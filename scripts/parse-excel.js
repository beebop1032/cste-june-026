const XLSX = require('xlsx')
const fs = require('fs')
const path = require('path')

const ANNOTATIONS = new Set(['CE1D', 'CESS', 'oral', '1h'])
// Niveau offsets in the sheet: col 1=1ère, 6=2ème, 11=3ème, 16=4ème, 21=5ème, 26=6ème
const NIVEAU_OFFSETS = [
  { niveau: '1re', col: 1 },
  { niveau: '2e', col: 6 },
  { niveau: '3e', col: 11 },
  { niveau: '4e', col: 16 },
  { niveau: '5e', col: 21 },
  { niveau: '6e', col: 26 },
]

function slugify(str) {
  return String(str)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function makeId(profCode, matiere, groupe, jour, periode) {
  const day = jour.slice(8, 10)
  const per = periode.replace('+', '')
  return `${profCode}-${slugify(matiere)}-${slugify(groupe)}-${day}-${per}`
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

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]
    const col0 = String(row[0] || '').trim()

    // Day header: contains "/" like "Jeudi 18/06 (...)"
    if (col0.includes('/')) {
      currentJour = parseDayToISO(col0)
      // Reset all matières for new day
      NIVEAU_OFFSETS.forEach(({ niveau }) => { currentMatiere[niveau] = '' })
      continue
    }

    // Period marker
    if (col0 === 'P1' || col0 === 'P2') {
      currentPeriode = col0
      NIVEAU_OFFSETS.forEach(({ niveau }) => { currentMatiere[niveau] = '' })
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

      // Update current matière state
      if (matiereCell) {
        if (ANNOTATIONS.has(matiereCell)) {
          currentMatiere[niveau] = currentMatiere[niveau]
            ? `${currentMatiere[niveau]} ${matiereCell}`
            : matiereCell
        } else {
          currentMatiere[niveau] = matiereCell
        }
      }

      // Emit exam only if we have prof and groupe
      if (!profCode || !groupe || !currentMatiere[niveau]) continue

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

  // Merge P1+P2: same profCode/matière/groupe/local on same jour
  const byKey = new Map()
  for (const ex of exams) {
    const key = `${ex.profCode}|${ex.matiere}|${ex.groupe}|${ex.local}|${ex.jour}`
    if (byKey.has(key)) {
      const existing = byKey.get(key)
      if (existing.periode !== ex.periode) existing.periode = 'P1+P2'
    } else {
      byKey.set(key, { ...ex })
    }
  }

  const merged = [...byKey.values()].map(ex => ({
    id: makeId(ex.profCode, ex.matiere, ex.groupe, ex.jour, ex.periode),
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
