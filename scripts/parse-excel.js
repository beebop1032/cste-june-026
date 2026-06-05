const XLSX = require('xlsx')
const fs = require('fs')
const path = require('path')

// Case-insensitive annotation set — matches CE1D, CESS, oral, Oral, 1h
const ANNOT_WORDS = new Set(['ce1d', 'cess', 'oral', '1h', 'segec'])
// Annotations that qualify the WHOLE block (backfill previous entries)
// vs forward-only qualifiers (oral, 1h) that only apply from that row onwards
const BACKFILL_WORDS = new Set(['ce1d', 'cess', 'segec'])

// Niveau offsets in the sheet: col 1=1ère, 6=2ème, 11=3ème, 16=4ème, 21=5ème, 26=6ème
const NIVEAU_OFFSETS = [
  { niveau: '1re', col: 1 },
  { niveau: '2e', col: 6 },
  { niveau: '3e', col: 11 },
  { niveau: '4e', col: 16 },
  { niveau: '5e', col: 21 },
  { niveau: '6e', col: 26 },
]

function isAnnotation(word) {
  return ANNOT_WORDS.has(word.toLowerCase())
}

// Base matière = words that are NOT annotations
function getBase(matiere) {
  return matiere.trim().split(/\s+/).filter(w => !isAnnotation(w)).join(' ')
}

// Annotations from a matière string (deduped, lowercased for comparison)
function getAnnots(matiere) {
  return matiere.trim().split(/\s+/).filter(w => isAnnotation(w))
}

// Merge two matière strings: keep base + union of annotations (P1 annots first)
function mergeMatiere(m1, m2) {
  const base = getBase(m1) || getBase(m2)
  const annots1 = getAnnots(m1)
  const annots2 = getAnnots(m2)
  const seen = new Set(annots1.map(a => a.toLowerCase()))
  const combined = [...annots1]
  for (const a of annots2) {
    if (!seen.has(a.toLowerCase())) { combined.push(a); seen.add(a.toLowerCase()) }
  }
  return combined.length ? `${base} ${combined.join(' ')}`.trim() : base
}

function slugify(str) {
  return String(str)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function makeId(profCode, matiere, groupe, niveau, jour, periode) {
  const day = jour.slice(8, 10)
  const per = periode.replace('+', '')
  return `${profCode}-${slugify(matiere)}-${slugify(groupe)}-${slugify(niveau)}-${day}-${per}`
}

function parseDayToISO(str) {
  // "Jeudi 18/06 (...)" → "2026-06-18"
  const m = str.match(/(\d{1,2})\/(\d{2})/)
  if (!m) return null
  const [, day, month] = m
  return `2026-${month}-${String(day).padStart(2, '0')}`
}

function parseExcel() {
  const wb = XLSX.readFile(path.join(__dirname, '..', 'Surveillance exam juin2026.xlsx'))
  const ws = wb.Sheets['Feuil1']
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

  const exams = []
  let currentJour = null
  let currentPeriode = null
  const currentMatiere = Object.fromEntries(NIVEAU_OFFSETS.map(({ niveau }) => [niveau, '']))

  // Track indices of exams emitted in the current matière block per niveau,
  // so annotations on later rows can backfill earlier entries.
  const blockIndices = Object.fromEntries(NIVEAU_OFFSETS.map(({ niveau }) => [niveau, []]))

  function resetBlock(niveau) { blockIndices[niveau] = [] }
  function resetAllBlocks() { NIVEAU_OFFSETS.forEach(({ niveau }) => resetBlock(niveau)) }

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]
    const col0 = String(row[0] || '').trim()

    // Day header: contains "/" like "Jeudi 18/06 (...)"
    if (col0.includes('/')) {
      currentJour = parseDayToISO(col0)
      NIVEAU_OFFSETS.forEach(({ niveau }) => { currentMatiere[niveau] = '' })
      resetAllBlocks()
      continue
    }

    // Period marker
    if (col0 === 'P1' || col0 === 'P2') {
      currentPeriode = col0
      NIVEAU_OFFSETS.forEach(({ niveau }) => { currentMatiere[niveau] = '' })
      resetAllBlocks()
    }

    if (!currentJour || !currentPeriode) continue

    // Parse each niveau bloc
    for (const { niveau, col } of NIVEAU_OFFSETS) {
      const matiereCell = String(row[col] || '').trim()
      const groupe = String(row[col + 1] || '').trim()
      const profCode = String(row[col + 2] || '').trim()
      const local = String(row[col + 4] || '').trim()

      // Skip "Lg oraux àpd" informational rows
      if (matiereCell.toLowerCase().startsWith('lg oraux')) continue

      // "- CESS", "- CE1D", "- 1h" etc. → strip leading dash and treat as continuation
      const normalizedCell = matiereCell.replace(/^-\s*/, '').trim()

      // Update current matière — case-insensitive annotation check
      if (normalizedCell) {
        const allAnnotations = normalizedCell.split(/\s+/).every(w => isAnnotation(w))
        if (allAnnotations) {
          if (currentMatiere[niveau]) {
            const oldMatiere = currentMatiere[niveau]
            currentMatiere[niveau] = `${oldMatiere} ${normalizedCell}`
            // Backfill only for "block qualifiers" (CESS, CE1D, SEGEC) — these apply to the whole
            // section. Forward-only qualifiers (oral, 1h) only affect rows from here onwards.
            const isBlockQualifier = normalizedCell.split(/\s+/).every(w => BACKFILL_WORDS.has(w.toLowerCase()))
            if (isBlockQualifier) {
              const currentBase = getBase(currentMatiere[niveau])
              for (const idx of blockIndices[niveau]) {
                if (getBase(exams[idx].matiere) === currentBase) exams[idx].matiere = currentMatiere[niveau]
              }
            }
          } else {
            currentMatiere[niveau] = normalizedCell
          }
        } else {
          // New base matière: start a fresh block for this niveau
          currentMatiere[niveau] = normalizedCell
          resetBlock(niveau)
        }
      }

      // Emit exam only if we have prof and groupe
      if (!profCode || !groupe || !currentMatiere[niveau]) continue

      blockIndices[niveau].push(exams.length)
      exams.push({
        matiere: currentMatiere[niveau],
        niveau,
        groupe,
        profCode,
        jour: currentJour,
        periode: currentPeriode,
        local,
      })
    }
  }

  // Two matières can merge (P1+P2) only if annotation sets are IDENTICAL.
  // "Lg1" + "Lg1" → merge. "Lg1 CE1D" + "Lg1 CE1D" → merge.
  // "Lg1" + "Lg1 Oral" → keep separate (different exam types on same day).
  function canMerge(m1, m2) {
    if (m1 === m2) return true
    if (getBase(m1) !== getBase(m2)) return false
    const a1 = new Set(getAnnots(m1).map(a => a.toLowerCase()))
    const a2 = new Set(getAnnots(m2).map(a => a.toLowerCase()))
    return a1.size === a2.size && [...a1].every(a => a2.has(a))
  }

  // Group by profCode|groupe|niveau|jour, then try to merge compatible entries
  const byGroup = new Map()
  for (const ex of exams) {
    const gk = `${ex.profCode}|${ex.groupe}|${ex.niveau}|${ex.jour}`
    if (!byGroup.has(gk)) { byGroup.set(gk, [{ ...ex }]); continue }
    const entries = byGroup.get(gk)
    let merged = false
    for (const existing of entries) {
      if (canMerge(existing.matiere, ex.matiere)) {
        if (existing.periode !== ex.periode) existing.periode = 'P1+P2'
        existing.matiere = mergeMatiere(existing.matiere, ex.matiere)
        merged = true
        break
      }
    }
    if (!merged) entries.push({ ...ex })
  }

  const merged = [...byGroup.values()].flat().map(ex => ({
    id: makeId(ex.profCode, ex.matiere, ex.groupe, ex.niveau, ex.jour, ex.periode),
    matiere: ex.matiere,
    niveau: ex.niveau,
    groupe: ex.groupe,
    profCode: ex.profCode,
    jour: ex.jour,
    periode: ex.periode,
    local: ex.local,
  }))

  const profCodes = new Set(merged.map(e => e.profCode))
  console.log(`Parsed ${merged.length} unique exams, ${profCodes.size} profs`)
  console.log('Prof codes:', [...profCodes].sort().join(', '))
  return merged
}

const result = parseExcel()
fs.writeFileSync(
  path.join(__dirname, '..', 'lib', 'exams.json'),
  JSON.stringify(result, null, 2),
  'utf8'
)
console.log('Written to lib/exams.json')
