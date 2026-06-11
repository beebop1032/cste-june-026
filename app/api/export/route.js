export const dynamic = 'force-dynamic'

import { requireAdmin } from '@/lib/auth'
import { listFiles, read, writeFileSafe, deleteFile } from '@/lib/storage'
import exams from '@/lib/exams.json'

export async function GET(request) {
  await requireAdmin()

  const { searchParams } = new URL(request.url)
  const format       = searchParams.get('format')  ?? 'csv'
  const profFilter   = searchParams.get('prof')    ?? null
  const groupeFilter = searchParams.get('groupe')  ?? null
  const niveauFilter = searchParams.get('niveau')  ?? null

  // Load admin statuts (exam-level overrides groupe-level)
  const locksRaw      = await read('admin-locks.json')
  const groupeStatuts = locksRaw?.groupeStatuts ?? {}
  const examStatuts   = locksRaw?.examStatuts   ?? {}

  // List all current prof files
  const allFiles     = await listFiles('prof-')
  const currentFiles = allFiles.filter(f => /^prof-[^.]+\.json$/.test(f) && !/-v\d+\.json$/.test(f))

  // Lecture unique et parallèle de tous les fichiers profs : les lectures Blob
  // séquentielles (2 appels réseau chacune, répétées par certains formats)
  // rendaient les pages très lentes à charger
  const profDatas = (await Promise.all(currentFiles.map(f => read(f)))).filter(Boolean)

  // ── Shared helpers for briefing + print ────────────────────────────────────

  function labelJour(dateStr) {
    const d = new Date(dateStr + 'T12:00:00Z')
    const day = d.toLocaleDateString('fr-FR', { weekday: 'long', timeZone: 'Europe/Brussels' })
    const [, m, j] = dateStr.split('-')
    return day.charAt(0).toUpperCase() + day.slice(1) + ' ' + j + '/' + m
  }

  async function buildPartMap() {
    const map = new Map()
    for (const ex of exams) {
      // exam-level overrides groupe-level
      const es = examStatuts[ex.id]
      const gs = groupeStatuts[ex.groupe]
      const s  = es ?? gs
      if (s === 'annule')   map.set(ex.id, { label: 'Annulé', type: 'annule' })
      else if (s === 'maintenu') map.set(ex.id, { label: 'Tous', type: 'tous' })
    }
    for (const prof of profDatas) {
      for (const ex of prof.examens ?? []) {
        if (map.has(ex.id)) continue
        const statut = ex.statut ?? (ex.maintenu === true ? 'maintenu' : null)
        if (statut === 'aucun') {
          map.set(ex.id, { label: 'Annulé', type: 'annule' })
        } else if (statut === 'tous' || statut === 'maintenu') {
          map.set(ex.id, { label: 'Tous', type: 'tous' })
        } else {
          const n = (ex.eleves ?? []).filter(e => e.nom || e.prenom).length
          map.set(ex.id, { label: n > 0 ? `${n} él.` : 'Liste', type: 'liste', n })
        }
      }
    }
    return map
  }

  const NIVEAUX       = ['1re', '2e', '3e', '4e', '5e', '6e']
  const NIVEAU_LABELS = ['1ère', '2ème', '3ème', '4ème', '5ème', '6ème']
  const JOURS         = [...new Set(exams.map(e => e.jour))].sort()

  function examsForBloc(jour, periode) {
    return exams.filter(e => e.jour === jour && (e.periode === periode || e.periode === 'P1+P2'))
  }

  // Un examen P1+P2 occupe deux plages distinctes : il est traité par période
  // (surveillant, local, liaison et décompte séparés en P1 et en P2)
  const periodesOf = ex => ex.periode === 'P1+P2' ? ['P1', 'P2'] : [ex.periode]
  const uidOf = (ex, periode) => ex.periode === 'P1+P2' ? `${ex.id}@${periode}` : ex.id

  function buildBlocRows(blocExams) {
    const byNiveau = {}
    for (const n of NIVEAUX) {
      byNiveau[n] = blocExams.filter(e => e.niveau === n)
        .sort((a, b) => a.matiere.localeCompare(b.matiere) || a.groupe.localeCompare(b.groupe))
    }
    const maxRows = Math.max(...Object.values(byNiveau).map(a => a.length), 1)
    return { byNiveau, maxRows }
  }

  // ── Briefing XLSX ───────────────────────────────────────────────────────────

  if (format === 'briefing') {
    const XLSX = (await import('xlsx')).default
    const partMap = await buildPartMap()

    const wsData  = []
    const styles  = {}

    function addStyle(rowIdx, colIdx, type) {
      const ref = XLSX.utils.encode_cell({ r: rowIdx, c: colIdx })
      const rgb = type === 'annule' ? 'FFCCCC' : type === 'tous' ? 'C6F6D5' : 'BEE3F8'
      styles[ref] = { fill: { fgColor: { rgb }, patternType: 'solid' } }
    }

    wsData.push(["Horaire d'examens juin 2026", ...Array(30).fill('')])
    wsData.push(Array(31).fill(''))
    const niveauHdr = Array(31).fill('')
    NIVEAUX.forEach((_, i) => { niveauHdr[1 + i * 5] = NIVEAU_LABELS[i] })
    wsData.push(niveauHdr)
    wsData.push(Array(31).fill(''))

    for (const jour of JOURS) {
      wsData.push([`${labelJour(jour)} (Réservistes P1 :  P2:)`, ...Array(30).fill('')])
      wsData.push(Array(31).fill(''))

      for (const periode of ['P1', 'P2']) {
        const bloc = examsForBloc(jour, periode)
        if (!bloc.length) continue
        const { byNiveau, maxRows } = buildBlocRows(bloc)

        for (let i = 0; i < maxRows; i++) {
          const row = Array(31).fill('')
          if (i === 0) row[0] = periode
          NIVEAUX.forEach((n, ni) => {
            const ex = byNiveau[n][i]
            if (!ex) return
            const offset = 1 + ni * 5
            const p = partMap.get(ex.id)
            row[offset]     = ex.matiere
            row[offset + 1] = ex.groupe
            row[offset + 2] = ex.profCode
            row[offset + 3] = p?.label ?? ''
            row[offset + 4] = ex.local
            if (p) addStyle(wsData.length, offset + 3, p.type)
          })
          wsData.push(row)
        }
        wsData.push(Array(31).fill(''))
      }
    }

    const ws = XLSX.utils.aoa_to_sheet(wsData)
    for (const [ref, s] of Object.entries(styles)) {
      if (ws[ref]) ws[ref].s = s
    }
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Surveillance')
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', cellStyles: true })
    return new Response(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="surveillance-juin2026.xlsx"',
      }
    })
  }

  // ── Vue imprimable ──────────────────────────────────────────────────────────

  if (format === 'print') {
    const partMap = await buildPartMap()

    // ── Surv data ────────────────────────────────────────────────────────────
    // survFlagMap: examId → true if prof requested to supervise
    const survFlagMap = new Map()
    for (const prof of profDatas) {
      for (const ex of prof.examens ?? []) {
        if (ex.surveilleParTitulaire) survFlagMap.set(ex.id, true)
      }
    }

    // Per slot (jour|periode): profs with active exams vs profs with annulled exams (potentially free)
    const activeAtSlot = new Map() // slot → Set<profCode>
    const freeAtSlot   = new Map() // slot → Array<profCode> sorted

    for (const ex of exams) {
      const p = partMap.get(ex.id)
      for (const per of periodesOf(ex)) {
        const slot = `${ex.jour}|${per}`
        if (!activeAtSlot.has(slot)) activeAtSlot.set(slot, new Set())
        if (!freeAtSlot.has(slot))   freeAtSlot.set(slot, [])
        if (!p || p.type === 'annule') freeAtSlot.get(slot).push(ex.profCode)
        else activeAtSlot.get(slot).add(ex.profCode)
      }
    }

    // Conflict detection: prof has 2+ active exams at same slot → can't supervise all
    const profActiveCount = new Map()
    for (const ex of exams) {
      const p = partMap.get(ex.id)
      if (!p || p.type === 'annule') continue
      for (const per of periodesOf(ex)) {
        const key = `${ex.profCode}|${ex.jour}|${per}`
        profActiveCount.set(key, (profActiveCount.get(key) || 0) + 1)
      }
    }

    function survCells(ex, periode) {
      const p = partMap.get(ex.id)
      if (!p || p.type === 'annule') {
        return `<td class="ts-an"></td><td class="ts-an"></td><td class="ts-fin"></td>`
      }
      const slot        = `${ex.jour}|${periode}`
      const wantsSurv   = survFlagMap.get(ex.id) ?? false
      const hasConflict = (profActiveCount.get(`${ex.profCode}|${ex.jour}|${periode}`) || 0) > 1
      const survVal     = (wantsSurv && !hasConflict) ? ex.profCode : ''
      let conseilVal = ''
      if (!wantsSurv || hasConflict) {
        const active = activeAtSlot.get(slot) || new Set()
        const free   = (freeAtSlot.get(slot) || []).filter(pc => !active.has(pc) && pc !== ex.profCode)
        conseilVal = free[0] ?? ''
      }
      return `<td class="ts${survVal ? ' ts-ok' : ''}">${survVal}</td><td class="ts${conseilVal ? ' ts-conseil' : ''}">${conseilVal}</td><td class="ts-fin"></td>`
    }

    function partBadge(ex) {
      const p = partMap.get(ex.id)
      if (!p) return `<td class="p-ns"><span class="badge b-ns">–</span></td>`
      if (p.type === 'annule')  return `<td class="p-an"><span class="badge b-an">✕ Annulé</span></td>`
      if (p.type === 'tous')    return `<td class="p-to"><span class="badge b-to">✓ Tous</span></td>`
      return `<td class="p-li"><span class="badge b-li">${p.label}</span></td>`
    }

    const NIV_COLORS = ['#1a3254','#1e4976','#1d5fa8','#1a6b8a','#1a7a6e','#236b3e']

    const css = `
      @import url('https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600;700&family=Playfair+Display:wght@700&family=JetBrains+Mono:wght@500&display=swap');
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0 }
      :root { --navy:#1a3254; --gold:#b8893a; --bg:#f4f3ef; --white:#ffffff; --text:#1c1c1c; --muted:#6b7280; --border:#d6d2c8 }
      body { font-family:'Source Sans 3','Helvetica Neue',sans-serif; font-size:11px; background:var(--bg); color:var(--text); line-height:1.4 }
      .topbar { background:var(--navy); color:#fff; padding:18px 32px; display:flex; align-items:center; justify-content:space-between; gap:16px }
      .topbar-left h1 { font-family:'Playfair Display',Georgia,serif; font-size:19px; font-weight:700; letter-spacing:-0.3px }
      .topbar-left p  { font-size:10.5px; color:rgba(255,255,255,.55); margin-top:3px }
      .topbar-right   { display:flex; align-items:center; gap:12px }
      .print-btn { background:var(--gold); color:#fff; border:none; padding:8px 18px; font-family:inherit; font-size:12px; font-weight:700; cursor:pointer; border-radius:4px; letter-spacing:.4px }
      .print-btn:hover { opacity:.88 }
      .legend { display:flex; gap:14px; align-items:center; padding:8px 32px; background:#fff; border-bottom:1px solid var(--border); font-size:10px; color:var(--muted); flex-wrap:wrap }
      .leg { display:flex; align-items:center; gap:5px }
      .leg-dot { width:10px; height:10px; border-radius:2px; flex-shrink:0 }
      .content { max-width:1700px; margin:0 auto; padding:18px 20px 36px }
      .day { background:var(--white); border:1px solid var(--border); border-radius:6px; overflow:hidden; margin-bottom:12px; box-shadow:0 1px 6px rgba(0,0,0,.06) }
      .day-hdr { background:var(--navy); color:#fff; padding:8px 14px; display:flex; align-items:center; justify-content:space-between }
      .day-name { font-weight:700; font-size:12px; letter-spacing:.6px; text-transform:uppercase }
      .day-res  { font-size:10px; color:rgba(255,255,255,.55) }
      .res-field { display:inline-block; min-width:55px; border-bottom:1px solid rgba(255,255,255,.4); margin-left:5px }
      .per { padding:8px 14px 10px; border-top:1px solid var(--border) }
      .per:first-of-type { border-top:none }
      .per-label { font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:1.2px; color:var(--navy); margin-bottom:6px; display:flex; align-items:center; gap:7px }
      .per-label::after { content:''; flex:1; height:1px; background:var(--border) }
      table { width:100%; border-collapse:collapse }
      thead tr.niv-row th { padding:3px 3px; font-size:9.5px; font-weight:700; color:#fff; letter-spacing:.4px; text-align:center; border:1px solid rgba(255,255,255,.2) }
      thead tr.col-row th { background:#f0ede6; color:var(--navy); font-size:7.5px; font-weight:700; text-transform:uppercase; letter-spacing:.3px; padding:2px 2px; border:1px solid var(--border); text-align:center }
      thead tr.col-row th.tc { background:#e8e4db }
      tbody td { border:1px solid #e2dfd8; padding:2px 2px; text-align:center; vertical-align:middle; white-space:nowrap }
      tbody tr:nth-child(even) td { background:#faf9f6 }
      .tc { background:#f8f6f1 !important; font-weight:700; font-size:8.5px; color:var(--navy) }
      .tm { font-weight:600; color:var(--text); font-size:9px }
      .tg { font-weight:700; color:var(--navy); font-size:9px }
      .tp { font-family:'JetBrains Mono','Courier New',monospace; font-size:8px; color:var(--muted) }
      .te { background:#faf9f7 !important }
      .badge { display:inline-block; padding:1px 4px; border-radius:3px; font-weight:700; font-size:7.5px; letter-spacing:.1px }
      .b-an  { background:#fde8e8; color:#991b1b; border:1px solid #fca5a5 }
      .b-to  { background:#d1fae5; color:#065f46; border:1px solid #6ee7b7 }
      .b-li  { background:#dbeafe; color:#1e40af; border:1px solid #93c5fd }
      .b-ns  { color:#9ca3af; font-style:italic; font-weight:400; font-size:8px }
      .p-an td, td.p-an { background:#fff5f5 }
      .p-to td, td.p-to { background:#f0fff4 }
      .p-li td, td.p-li { background:#eff6ff }
      /* ── Surv columns ── */
      .ts { font-family:'JetBrains Mono','Courier New',monospace; font-size:9px; min-width:26px; padding:2px 3px !important; text-align:center }
      .ts-ok      { background:#f0fdf4 !important; color:#166534; font-weight:700 }
      .ts-conseil { background:#fefce8 !important; color:#713f12; font-weight:600; font-style:italic }
      .ts-fin     { min-width:40px; background:#fff !important; border-bottom:1px dashed #aaa !important }
      .ts-an      { background:#f5f5f5 !important; opacity:.35 }
      .surv-hdr   { background:#374151 !important; font-size:8px !important; letter-spacing:.05em !important }
      /* ── Half-table gap ── */
      .half-gap { height:4px }
      /* ── Print A3 ── */
      .print-hdr { display:none }
      @media print {
        @page { size: A3 landscape; margin: 6mm 8mm }
        body { background:#fff; font-size:8px }
        .topbar, .legend, .print-btn { display:none }
        .print-hdr { display:block; text-align:center; margin-bottom:6px; padding-bottom:5px; border-bottom:2px solid var(--navy) }
        .print-hdr h1 { font-family:'Playfair Display',Georgia,serif; font-size:13px; font-weight:700; color:var(--navy) }
        .print-hdr p  { font-size:8px; color:var(--muted); margin-top:2px }
        .content { padding:0; max-width:none }
        .day { box-shadow:none; border-radius:0; border:1px solid #bbb; margin-bottom:5px }
        .day-hdr { padding:3px 7px }
        .day-name { font-size:9px }
        .per { padding:2px 7px 5px }
        table { font-size:7.5px }
        .tm, .tg { font-size:7.5px }
        .tp { font-size:7px }
        thead tr.niv-row th { font-size:8.5px; padding:2px 3px }
        thead tr.col-row th { font-size:6.5px; padding:1px 2px }
        tbody td { padding:1px 2px }
        .badge { font-size:6.5px; padding:0 3px }
        .ts { font-size:7px; min-width:18px; padding:1px 2px !important }
        .ts-fin { min-width:28px }
        .half-gap { height:3px }
      }
    `

    let html = `<!DOCTYPE html>
<html lang="fr"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Surveillance — Examens juin 2026</title>
<style>${css}</style>
</head><body>

<div class="topbar">
  <div class="topbar-left">
    <h1>Surveillance des examens</h1>
    <p>Collège des Hayeffes &nbsp;·&nbsp; Juin 2026 &nbsp;·&nbsp; Format A3 paysage</p>
  </div>
  <div class="topbar-right">
    <div class="legend">
      <span class="leg"><span class="leg-dot" style="background:#fde8e8;border:1px solid #fca5a5"></span>Annulé</span>
      <span class="leg"><span class="leg-dot" style="background:#d1fae5;border:1px solid #6ee7b7"></span>Tous les élèves</span>
      <span class="leg"><span class="leg-dot" style="background:#dbeafe;border:1px solid #93c5fd"></span>Liste nominative</span>
      <span class="leg"><span class="leg-dot" style="background:#f0ede6;border:1px solid #d6d2c8"></span>Non renseigné</span>
      <span class="leg"><span class="leg-dot" style="background:#f0fdf4;border:1px solid #86efac"></span>SURV confirmée</span>
      <span class="leg"><span class="leg-dot" style="background:#fefce8;border:1px solid #fde047"></span>SURV conseillée</span>
    </div>
    <button class="print-btn" onclick="window.print()">Imprimer A3 / PDF</button>
  </div>
</div>

<div class="print-hdr">
  <h1>Surveillance des examens — Juin 2026</h1>
  <p>Collège des Hayeffes · Imprimé le ${new Date().toLocaleDateString('fr-BE', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
</div>

<div class="content">
`
    for (const jour of JOURS) {
      html += `<div class="day">
  <div class="day-hdr">
    <span class="day-name">${labelJour(jour)}</span>
    <span class="day-res">Réservistes &nbsp; P1 :<span class="res-field">&nbsp;</span>&nbsp; P2 :<span class="res-field">&nbsp;</span></span>
  </div>`

      for (const periode of ['P1', 'P2']) {
        const bloc = examsForBloc(jour, periode)
        if (!bloc.length) continue
        const { byNiveau, maxRows } = buildBlocRows(bloc)

        // Split 6 niveaux into 2 half-tables of 3
        const HALVES = [[0,1,2],[3,4,5]]

        html += `<div class="per"><div class="per-label">${periode}</div>`

        HALVES.forEach((indices, hi) => {
          const halfNiveaux = indices.map(i => NIVEAUX[i])
          const halfLabels  = indices.map(i => NIVEAU_LABELS[i])
          const halfColors  = indices.map(i => NIV_COLORS[i])

          if (hi > 0) html += `<div class="half-gap"></div>`

          html += `<table>
<thead>
<tr class="niv-row"><th class="tc"></th>`
          halfNiveaux.forEach((_, i) => {
            html += `<th colspan="7" style="background:${halfColors[i]}">${halfLabels[i]}</th>`
          })
          html += `</tr>
<tr class="col-row"><th class="tc">Pér.</th>`
          halfNiveaux.forEach(() => {
            html += `<th>Mat.</th><th>Cl.</th><th>Prof</th><th>Él.</th><th class="surv-hdr" style="color:#fff">SURV</th><th class="surv-hdr" style="color:#fff">Cons.</th><th class="surv-hdr" style="color:#fff">Fin.</th>`
          })
          html += `</tr></thead><tbody>`

          for (let i = 0; i < maxRows; i++) {
            html += `<tr><td class="tc">${i === 0 ? periode : ''}</td>`
            halfNiveaux.forEach(n => {
              const ex = byNiveau[n][i]
              if (!ex) {
                html += `<td class="te"></td><td class="te"></td><td class="te"></td><td class="te"></td><td class="te"></td><td class="te"></td><td class="te"></td>`
                return
              }
              html += `<td class="tm">${ex.matiere}</td><td class="tg">${ex.groupe}</td><td class="tp">${ex.profCode}</td>${partBadge(ex)}${survCells(ex, periode)}`
            })
            html += `</tr>`
          }
          html += `</tbody></table>`
        })

        html += `</div>`
      }
      html += `</div>`
    }

    html += `</div></body></html>`
    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  }

  // ── Tableau final — éditable, SURV + Fin. (conseil + input) ───────────────

  if (format === 'print-final') {
    const partMap = await buildPartMap()

    const CLASS_SIZES_F = {
      '1H': 19, '1I': 20, '1J': 21, '1K': 21, '1L': 21, '1M': 21, '1N': 21,
      '2H': 20, '2I': 23, '2J': 21, '2K': 21, '2L': 21, '2M': 20, '2N': 19,
      '6H': 25, '6I': 24, '6J': 24, '6K': 24,
    }
    const classSizeF = g => CLASS_SIZES_F[g] ?? 25

    // Copies to correct per prof
    const copiesPerProfF = {}
    for (const ex of exams) {
      const p = partMap.get(ex.id)
      if (!p || p.type === 'annule') continue
      const n = p.type === 'liste' ? (p.n || 0) : classSizeF(ex.groupe)
      copiesPerProfF[ex.profCode] = (copiesPerProfF[ex.profCode] || 0) + n
    }

    // Données répartitions.xlsx : heures surv prévues + copies initiales
    const repDataF = {
      ANM:{s:14,c:7},   BALJ:{s:14,c:59},  BAL:{s:14,c:129}, BAU:{s:6,c:11},
      BERS:{s:14,c:57}, BIE:{s:8,c:0},     BLOA:{s:14,c:28}, BUC:{s:14,c:0},
      CAR:{s:12,c:68},  CARO:{s:12,c:51},  CP:{s:8,c:62},    CLO:{s:8,c:50},
      COL:{s:14,c:0},   CORE:{s:4,c:0},    DANB:{s:12,c:15}, SMO:{s:12,c:57},
      DVT:{s:12,c:39},  DEBS:{s:12,c:52},  DKS:{s:9,c:175},  DELF:{s:12,c:106},
      DMI:{s:12,c:81},  DEMN:{s:14,c:9},   DESI:{s:11,c:105},DEST:{s:12,c:62},
      DOM:{s:14,c:57},  DRAY:{s:13,c:70},  DT:{s:12,c:0},    ENS:{s:14,c:53},
      EVR:{s:14,c:42},  FR:{s:11,c:0},     FOF:{s:13,c:83},  GAU:{s:10,c:18},
      GOD:{s:14,c:39},  HEK:{s:4,c:43},    HE:{s:10,c:15},   IVE:{s:12,c:5},
      JY:{s:8,c:0},     JAQ:{s:12,c:0},    JOR:{s:11,c:80},  KOT:{s:12,c:69},
      LAY:{s:4,c:0},    LMC:{s:10,c:62},   LNB:{s:14,c:6},   MEL:{s:12,c:13},
      MRS:{s:11,c:0},   MYN:{s:8,c:4},     PHM:{s:12,c:4},   ORF:{s:12,c:22},
      PAY:{s:12,c:0},   PEC:{s:13,c:158},  PERS:{s:12,c:32}, PIEJ:{s:13,c:90},
      ROD:{s:12,c:111}, RSV:{s:7,c:0},     SAR:{s:10,c:26},  SHE:{s:7,c:0},
      TAB:{s:14,c:0},   TAC:{s:4,c:10},    TAIL:{s:14,c:7},  VDS:{s:12,c:19},
      VHM:{s:12,c:0},   VBG:{s:14,c:139},  VERM:{s:14,c:43}, VERS:{s:10,c:11},
    }

    // Same surv logic as format=print
    const survFlagMapF = new Map()
    for (const prof of profDatas) {
      for (const ex of prof.examens ?? []) {
        if (ex.surveilleParTitulaire) survFlagMapF.set(ex.id, true)
      }
    }
    const profActiveCountF = new Map()
    for (const ex of exams) {
      const p = partMap.get(ex.id)
      if (!p || p.type === 'annule') continue
      for (const per of periodesOf(ex)) {
        const key = `${ex.profCode}|${ex.jour}|${per}`
        profActiveCountF.set(key, (profActiveCountF.get(key) || 0) + 1)
      }
    }

    // Profs who are actively supervising their OWN exam at each slot
    // (active + asked to supervise + no scheduling conflict) → can co-supervise another exam
    const survWillingAtSlot = new Map()
    for (const ex of exams) {
      const p = partMap.get(ex.id)
      if (!p || p.type === 'annule') continue
      if (!survFlagMapF.has(ex.id)) continue
      if (periodesOf(ex).some(per => (profActiveCountF.get(`${ex.profCode}|${ex.jour}|${per}`) || 0) > 1)) continue
      for (const per of periodesOf(ex)) {
        const slot = `${ex.jour}|${per}`
        if (!survWillingAtSlot.has(slot)) survWillingAtSlot.set(slot, [])
        survWillingAtSlot.get(slot).push(ex.profCode)
      }
    }

    // Profs with no file at all (never connected)
    const profsWithFile = new Set(currentFiles.map(f => f.replace(/^prof-/, '').replace(/\.json$/, '')))
    const profsNoResponse = [...new Set(exams.map(e => e.profCode))].filter(p => !profsWithFile.has(p)).sort()

    function survFinalCells(ex, periode) {
      const p = partMap.get(ex.id)
      if (!p || p.type === 'annule') {
        return `<td class="ts-an"></td><td class="tfin-cell ts-an"></td><td class="tloc-cell ts-an"></td>`
      }
      // Plage et identité par période : un examen P1+P2 a des saisies séparées en P1 et P2
      const slot        = `${ex.jour}|${periode}`
      const uid         = uidOf(ex, periode)
      const wantsSurv   = survFlagMapF.get(ex.id) ?? false
      const hasConflict = (profActiveCountF.get(`${ex.profCode}|${ex.jour}|${periode}`) || 0) > 1
      const survVal     = (wantsSurv && !hasConflict) ? ex.profCode : ''
      // Arrow shows the prof's own code whenever they asked to supervise (conflict or not)
      const conseilVal = wantsSurv ? ex.profCode : ''
      const cpBtn = conseilVal
        ? `<button class="cp-btn" data-v="${conseilVal}" onclick="cp(this)" title="${conseilVal}">← ${conseilVal}</button>`
        : ''
      // 1re/2e : examens inchangés → local pré-encodé avec l'ancien local
      const preLocal = (ex.niveau === '1re' || ex.niveau === '2e') ? (ex.local ?? '') : ''
      const locInput = `<input class="loc-inp${preLocal ? ' has-val' : ''}" type="text" data-exid="${uid}" data-default="${preLocal}" value="${preLocal}" placeholder="${ex.local ?? ''}" autocomplete="off" />`
      const lnkBtn = `<button class="lnk-btn" data-exid="${uid}" data-slot="${slot}" onclick="lnk(this)" title="Lier à un autre examen de la même plage (fusion prévue)">🔗</button>`
      return `<td class="ts${survVal ? ' ts-ok' : ''}">${survVal}</td><td class="tfin-cell"><div class="tfin-wrap"><input class="fin-inp" type="text" list="profs-dl" data-conseil="${conseilVal}" data-slot="${slot}" data-exid="${uid}" placeholder="${conseilVal}" autocomplete="off" />${cpBtn}</div></td><td class="tloc-cell"><div class="tloc-wrap">${locInput}${lnkBtn}</div></td>`
    }

    function partBadgeF(ex) {
      const p = partMap.get(ex.id)
      if (!p) return `<td class="p-ns"><span class="badge b-ns">–</span></td>`
      if (p.type === 'annule')  return `<td class="p-an"><span class="badge b-an">✕</span></td>`
      if (p.type === 'tous')    return `<td class="p-to"><span class="badge b-to">✓</span></td>`
      return `<td class="p-li"><span class="badge b-li">${p.label}</span></td>`
    }

    const NIV_COLORS_F = ['#1a3254','#1e4976','#1d5fa8','#1a6b8a','#1a7a6e','#236b3e']

    const cssF = `
      @import url('https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600;700&family=Playfair+Display:wght@700&family=JetBrains+Mono:wght@500&display=swap');
      *, *::before, *::after { box-sizing:border-box; margin:0; padding:0 }
      :root { --navy:#1a3254; --gold:#b8893a; --bg:#f4f3ef; --white:#fff; --text:#1c1c1c; --muted:#6b7280; --border:#d6d2c8 }
      body { font-family:'Source Sans 3','Helvetica Neue',sans-serif; font-size:11px; background:var(--bg); color:var(--text); line-height:1.4 }
      .topbar { background:var(--navy); color:#fff; padding:14px 28px; display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap }
      .topbar-left h1 { font-family:'Playfair Display',Georgia,serif; font-size:18px; font-weight:700 }
      .topbar-left p  { font-size:10px; color:rgba(255,255,255,.55); margin-top:2px }
      .topbar-right   { display:flex; align-items:center; gap:8px; flex-wrap:wrap }
      .print-btn  { background:var(--gold); color:#fff; border:none; padding:7px 16px; font-family:inherit; font-size:11.5px; font-weight:700; cursor:pointer; border-radius:4px }
      .copy-all-btn { background:#374151; color:#fff; border:none; padding:7px 14px; font-family:inherit; font-size:11px; font-weight:600; cursor:pointer; border-radius:4px }
      .reset-btn    { background:transparent; color:rgba(255,255,255,.6); border:1px solid rgba(255,255,255,.25); padding:6px 12px; font-family:inherit; font-size:10.5px; cursor:pointer; border-radius:4px }
      .save-status  { font-size:10px; color:rgba(255,255,255,.5); min-width:80px }
      .legend { display:flex; gap:12px; align-items:center; padding:7px 28px; background:#fff; border-bottom:1px solid var(--border); font-size:10px; color:var(--muted); flex-wrap:wrap }
      .leg { display:flex; align-items:center; gap:4px }
      .leg-dot { width:9px; height:9px; border-radius:2px; flex-shrink:0 }
      .leg-sep { width:1px; height:14px; background:var(--border); margin:0 2px }
      .leg-filter { cursor:pointer; font-weight:600; color:#374151; user-select:none }
      .leg-filter input { accent-color:#1a3254; cursor:pointer }
      /* Filtres : masquage des examens annulés / remplis (Prof + Local) */
      body.hide-annule td[data-annule],
      body.hide-filled td[data-filled] { visibility:hidden }
      .content { max-width:1700px; margin:0 auto; padding:14px 18px 32px }
      .day { background:var(--white); border:1px solid var(--border); border-radius:6px; overflow:hidden; margin-bottom:10px; box-shadow:0 1px 5px rgba(0,0,0,.05) }
      .day-hdr { background:var(--navy); color:#fff; padding:5px 13px 6px; display:flex; align-items:center; gap:14px; flex-wrap:wrap }
      .day-name { font-weight:700; font-size:11.5px; letter-spacing:.5px; text-transform:uppercase; margin-right:4px }
      .res-row { display:flex; align-items:center; gap:6px; flex:1; flex-wrap:wrap }
      .res-lbl { font-size:9px; font-weight:700; color:rgba(255,255,255,.6); text-transform:uppercase; letter-spacing:.5px; white-space:nowrap }
      .res-inp { width:160px; border:1px solid rgba(255,255,255,.3); border-radius:3px; padding:2px 6px; font-family:'JetBrains Mono',monospace; font-size:9px; color:#fff; background:rgba(255,255,255,.1); text-transform:uppercase }
      .res-inp:focus { outline:none; border-color:rgba(255,255,255,.7); background:rgba(255,255,255,.18) }
      .res-inp.has-val { background:rgba(255,255,255,.2); border-color:rgba(255,255,255,.6) }
      .per { padding:7px 13px 9px; border-top:1px solid var(--border) }
      .per:first-of-type { border-top:none }
      .per-label { font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:1.2px; color:var(--navy); margin-bottom:5px; display:flex; align-items:center; gap:6px }
      .per-label::after { content:''; flex:1; height:1px; background:var(--border) }
      .half-gap { height:4px }
      table { width:100%; border-collapse:collapse }
      thead tr.niv-row th { padding:3px 3px; font-size:9.5px; font-weight:700; color:#fff; letter-spacing:.3px; text-align:center; border:1px solid rgba(255,255,255,.2) }
      thead tr.col-row th { background:#f0ede6; color:var(--navy); font-size:7.5px; font-weight:700; text-transform:uppercase; padding:2px 2px; border:1px solid var(--border); text-align:center }
      thead tr.col-row th.tc { background:#e8e4db }
      tbody td { border:1px solid #e2dfd8; padding:2px 2px; text-align:center; vertical-align:middle; white-space:nowrap }
      tbody tr:nth-child(even) td { background:#faf9f6 }
      .tc  { background:#f8f6f1 !important; font-weight:700; font-size:8.5px; color:var(--navy) }
      .tm  { font-weight:600; font-size:9px }
      .tg  { font-weight:700; font-size:9px; color:var(--navy) }
      .tp  { font-family:'JetBrains Mono',monospace; font-size:8px; color:var(--muted) }
      .te  { background:#faf9f7 !important }
      .badge { display:inline-block; padding:1px 3px; border-radius:2px; font-weight:700; font-size:7.5px }
      .b-an { background:#fde8e8; color:#991b1b }
      .b-to { background:#d1fae5; color:#065f46 }
      .b-li { background:#dbeafe; color:#1e40af }
      .b-ns { color:#9ca3af; font-style:italic; font-weight:400 }
      .p-an td, td.p-an { background:#fff5f5 }
      .p-to td, td.p-to { background:#f0fff4 }
      .p-li td, td.p-li { background:#eff6ff }
      /* ── SURV col ── */
      .ts     { font-family:'JetBrains Mono',monospace; font-size:8.5px; min-width:24px; padding:1px 3px !important; text-align:center }
      .ts-ok  { background:#f0fdf4 !important; color:#166534; font-weight:700 }
      .ts-an  { background:#f5f5f5 !important; opacity:.3 }
      .surv-hdr { background:#374151 !important; color:#fff !important; font-size:7.5px !important }
      /* ── FIN. editable col ── */
      .tfin-cell { padding:1px 2px !important; min-width:110px }
      .tfin-wrap { display:flex; align-items:center; gap:2px; justify-content:flex-start }
      .fin-inp {
        width:54px; border:1px solid #d1d5db; border-radius:3px;
        padding:2px 4px; font-family:'JetBrains Mono',monospace; font-size:9px;
        color:#374151; background:#fff; text-align:left; text-transform:uppercase;
        transition: background .15s, color .15s, border-color .1s;
      }
      .fin-inp:focus { outline:none; border-color:#3b82f6; box-shadow:0 0 0 2px rgba(59,130,246,.25) }
      .fin-inp.has-val { background:#f0fdf4 !important; color:#166534 !important; font-weight:700; border-color:#86efac }
      /* ── LOC. editable col ── */
      .tloc-cell { padding:1px 2px !important; min-width:52px }
      .loc-inp {
        width:46px; border:1px solid #d1d5db; border-radius:3px;
        padding:2px 4px; font-family:'JetBrains Mono',monospace; font-size:9px;
        color:#374151; background:#fff; text-align:left; text-transform:uppercase;
        transition: background .15s, color .15s, border-color .1s;
      }
      .loc-inp:focus { outline:none; border-color:#8b5cf6; box-shadow:0 0 0 2px rgba(139,92,246,.25) }
      .loc-inp.has-val { background:#f5f3ff !important; color:#5b21b6 !important; font-weight:700; border-color:#c4b5fd }
      /* ── Fusion (même surveillant, même plage) ── */
      .fin-inp.fused-ok,  .loc-inp.fused-ok  { border-color:#7c3aed !important; box-shadow:0 0 0 1.5px rgba(124,58,237,.35) }
      .fin-inp.fused-warn, .loc-inp.fused-warn { border-color:#d97706 !important; box-shadow:0 0 0 1.5px rgba(217,119,6,.45); background:#fffbeb !important }
      .fuse-badge { flex-shrink:0; font-size:9px; cursor:help; line-height:1 }
      .fuse-badge.warn { filter:hue-rotate(160deg) }
      /* ── Liaison manuelle (fusion prévue, avant saisie prof/local) ── */
      .tloc-wrap { display:flex; align-items:center; gap:2px }
      .lnk-btn { flex-shrink:0; border:none; background:none; cursor:pointer; font-size:8px; opacity:.22; padding:0 1px; line-height:1 }
      .lnk-btn:hover { opacity:1 }
      .lnk-btn.lnk-on { opacity:1 }
      .lnk-btn.lnk-pending { opacity:1; outline:2px dashed #0d9488; border-radius:3px; background:#ccfbf1 }
      .lnk-btn[data-grp]::after { content:attr(data-grp); font-size:7px; font-weight:700; color:#0d9488; vertical-align:super }
      .fin-inp.linked-grp, .loc-inp.linked-grp { outline:2px dashed #0d9488; outline-offset:1px }
      .cp-btn {
        flex-shrink:0; border:none; background:#fef9c3; color:#713f12;
        font-size:8px; cursor:pointer; padding:2px 5px; border-radius:3px;
        font-weight:700; white-space:nowrap; max-width:60px; overflow:hidden;
        text-overflow:ellipsis;
      }
      .cp-btn:hover { background:#fde047; color:#1c1917 }
      .cp-btn:active { transform:scale(.95) }
      /* ── Récap final (bas de page, imprimable) ── */
      .recap-final { margin-top:12px; padding:9px 13px; background:#f8f6f1; border:1px solid #e2dfd8; border-radius:4px; page-break-inside:avoid }
      .rf-title { font-size:10px; font-weight:700; color:#1a3254; margin-bottom:7px; text-transform:uppercase; letter-spacing:.5px }
      .rf-grid { display:flex; flex-direction:column; gap:4px }
      .rf-niv { display:flex; align-items:center; gap:4px; flex-wrap:wrap }
      .rf-niv-label { font-size:8px; font-weight:700; color:#6b7280; min-width:38px; text-transform:uppercase; letter-spacing:.5px }
      .rf-item { display:inline-flex; align-items:center; gap:3px; background:#fff; border:1px solid #d6d2c8; border-radius:3px; padding:1px 5px }
      .rf-groupe { font-family:'JetBrains Mono',monospace; font-size:9px; font-weight:700; color:#1a3254 }
      .rf-count { font-size:8px; color:#6b7280 }
      /* ── Récap sidebar ── */
      .recap-section { position:fixed; top:56px; right:0; width:260px; height:calc(100vh - 56px); overflow-y:auto; background:#fff; border-left:1px solid #e2dfd8; box-shadow:-3px 0 12px rgba(0,0,0,.06); z-index:100; padding:14px 12px }
      .recap-title { font-size:12px; font-weight:700; color:#1a3254; margin-bottom:2px }
      .recap-sub   { font-size:9px; color:#9ca3af; margin-bottom:6px }
      .recap-legend { font-size:8px; color:#6b7280; margin-bottom:8px; line-height:1.6 }
      .recap-table { width:100%; border-collapse:collapse; font-size:10px }
      .recap-table thead th { background:#f0ede6; color:#1a3254; font-size:7.5px; font-weight:700; text-transform:uppercase; padding:3px 4px; border:1px solid #e2dfd8; text-align:left }
      .recap-table tbody td { border:1px solid #e8e4db; padding:3px 4px; vertical-align:middle }
      .rc-prof  { font-family:'JetBrains Mono',monospace; font-size:9px; font-weight:600; color:#374151; white-space:nowrap }
      .rc-bar-row { display:flex; align-items:center; gap:4px }
      .rc-bar { flex:1; height:5px; background:#e2dfd8; border-radius:2px; min-width:30px; overflow:hidden }
      .rc-bar-fill { height:100%; border-radius:2px; transition:width .25s }
      .rc-bar-copy { background:#94a3b8 }
      .rc-bar-ok   { background:#16a34a }
      .rc-bar-warn { background:#d97706 }
      .rc-bar-low  { background:#dc2626 }
      .rc-val      { font-size:9px; font-weight:600; min-width:18px; text-align:right; white-space:nowrap }
      .rc-denom    { font-size:8px; color:#9ca3af }
      .rc-diff     { text-align:center; font-size:10px; font-weight:700; min-width:22px; white-space:nowrap }
      .autofill-btn { width:100%; margin:6px 0 8px; background:#1a3254; color:#fff; border:none; padding:6px 10px; font-family:inherit; font-size:10px; font-weight:700; cursor:pointer; border-radius:4px; text-align:center }
      .autofill-btn:hover { background:#1e4976 }
      .recap-absent { margin-top:14px; padding-top:10px; border-top:1px solid #e2dfd8 }
      .recap-absent-title { font-size:10px; font-weight:700; color:#7c3aed; margin-bottom:6px }
      .absent-badge { display:inline-block; background:#f5f3ff; color:#4c1d95; border:1px solid #ddd6fe; border-radius:3px; font-family:'JetBrains Mono',monospace; font-size:8.5px; font-weight:600; padding:1px 5px; margin:1px 2px }
      .content { margin-right:270px }
      /* ── Print A3 ── */
      .print-hdr { display:none }
      @media print {
        @page { size: A3 landscape; margin: 6mm 8mm }
        body { background:#fff; font-size:7.5px }
        .topbar, .legend, .copy-all-btn, .reset-btn, .save-status, .print-btn, .recap-section { display:none }
        .content { margin-right:0 }
        .print-hdr { display:block; text-align:center; margin-bottom:5px; padding-bottom:4px; border-bottom:2px solid var(--navy) }
        .print-hdr h1 { font-family:'Playfair Display',Georgia,serif; font-size:12px; font-weight:700; color:var(--navy) }
        .print-hdr p  { font-size:8px; color:var(--muted); margin-top:2px }
        .content { padding:0; max-width:none }
        .day  { box-shadow:none; border-radius:0; border:1px solid #bbb; margin-bottom:5px }
        .day-hdr { padding:3px 7px }
        .day-name { font-size:9px }
        .per  { padding:2px 7px 4px }
        .half-gap { height:2px }
        table { font-size:7px }
        .tm, .tg { font-size:7px }
        .tp { font-size:6.5px }
        thead tr.niv-row th { font-size:8px; padding:2px 2px }
        thead tr.col-row th { font-size:6px; padding:1px 1px }
        tbody td { padding:1px 1px }
        .badge { font-size:6px; padding:0 2px }
        .ts { font-size:6.5px; min-width:16px }
        .tfin-cell { min-width:52px }
        .cp-btn, .lnk-btn { display:none }
        .res-inp {
          border:none !important; background:transparent !important;
          width:auto !important; font-size:7px; padding:0 !important;
          color:#fff; font-weight:700; text-transform:uppercase;
        }
        .res-inp::placeholder { display:none; color:transparent }
        .fin-inp, .loc-inp {
          border:none !important; background:transparent !important;
          width:auto !important; font-size:7px; padding:0 !important;
          color:#166534; font-weight:700; text-transform:uppercase;
        }
        .loc-inp { color:#5b21b6 }
        .fin-inp::placeholder, .loc-inp::placeholder { color:#9ca3af; font-style:italic; font-weight:400 }
      }
    `

    const jsF = `
      const allInps = () => [...document.querySelectorAll('.fin-inp')];
      function cp(btn) {
        const inp = btn.previousElementSibling;
        inp.value = btn.dataset.v;
        inp.classList.add('has-val');
        save();
        // Focus next empty input
        const list = allInps();
        const idx  = list.indexOf(inp);
        const next = list.slice(idx + 1).find(i => !i.value);
        if (next) next.focus();
      }
      function copyAll() {
        document.querySelectorAll('.fin-inp').forEach(inp => {
          const c = inp.dataset.conseil;
          if (c && !inp.value) { inp.value = c; inp.classList.add('has-val'); }
        });
        save();
      }
      function resetAll() {
        if (!confirm('Effacer toutes les valeurs saisies ?')) return;
        document.querySelectorAll('.fin-inp').forEach(inp => { inp.value = ''; inp.classList.remove('has-val'); });
        // Locaux : retour à la valeur pré-encodée (1re/2e) ou vide
        document.querySelectorAll('.loc-inp').forEach(inp => {
          inp.value = inp.dataset.default || '';
          inp.classList.toggle('has-val', inp.value.length > 0);
        });
        localStorage.removeItem('tf-surv-2026');
        scheduleSync();
        updateFilledMarks();
        showStatus('Réinitialisé');
      }
      function save() {
        const vals = [...document.querySelectorAll('.fin-inp')].map(i => i.value);
        localStorage.setItem('tf-surv-2026', JSON.stringify(vals));
        showStatus('Sauvegardé ✓');
        scheduleSync();
        updateFilledMarks();
        updateRecap();
      }
      // Marque data-filled sur les cellules des examens dont Prof (Fin.) ET Local sont saisis.
      // L'examen dont un input a le focus n'est jamais marqué : pas de masquage sous le curseur.
      function updateFilledMarks() {
        const act = document.activeElement;
        const activeExid = act && act.dataset ? act.dataset.exid : null;
        const locByEx = {};
        document.querySelectorAll('.loc-inp[data-exid]').forEach(i => { locByEx[i.dataset.exid] = i.value.trim(); });
        document.querySelectorAll('.fin-inp[data-exid]').forEach(inp => {
          const id = inp.dataset.exid;
          const filled = inp.value.trim() && locByEx[id] && id !== activeExid;
          document.querySelectorAll('td[data-exgrp="' + id + '"]').forEach(td => {
            if (filled) td.setAttribute('data-filled', '1');
            else td.removeAttribute('data-filled');
          });
        });
        updateFusionMarks();
      }
      // Fusion : un même surveillant sur plusieurs examens d'une même plage.
      // Local identique partout → liaison OK (violet) ; locaux différents ou
      // manquants → à vérifier (orange, le surveillant ne peut pas être à deux endroits).
      function updateFusionMarks() {
        document.querySelectorAll('.fin-inp, .loc-inp').forEach(inp => {
          inp.classList.remove('fused-ok', 'fused-warn');
          if (inp.classList.contains('fin-inp')) inp.removeAttribute('title');
        });
        document.querySelectorAll('.fuse-badge').forEach(b => b.remove());
        const locByEx = {};
        document.querySelectorAll('.loc-inp[data-exid]').forEach(i => { locByEx[i.dataset.exid] = i.value.trim().toUpperCase(); });
        const groups = {};
        document.querySelectorAll('.fin-inp[data-exid]').forEach(inp => {
          const v = inp.value.trim().toUpperCase();
          if (!v) return;
          const key = (inp.dataset.slot || '') + '|' + v;
          (groups[key] = groups[key] || []).push(inp);
        });
        for (const key in groups) {
          const inps = groups[key];
          if (inps.length < 2) continue;
          const prof = key.split('|')[2] || '';
          const locs = inps.map(i => locByEx[i.dataset.exid] || '');
          const allSame = locs.every(l => l && l === locs[0]);
          const cls = allSame ? 'fused-ok' : 'fused-warn';
          const title = allSame
            ? 'Fusion : ' + inps.length + ' examens · ' + prof + ' · local ' + locs[0]
            : prof + ' surveille ' + inps.length + ' examens sur cette plage — locaux différents ou manquants';
          inps.forEach(inp => {
            inp.classList.add(cls);
            inp.title = title;
            const loc = document.querySelector('.loc-inp[data-exid="' + inp.dataset.exid + '"]');
            if (loc) loc.classList.add(cls);
            const w = inp.closest('.tfin-wrap');
            if (w && !w.querySelector('.fuse-badge')) {
              const b = document.createElement('span');
              b.className = 'fuse-badge' + (allSame ? '' : ' warn');
              b.textContent = '🔗';
              b.title = title;
              w.insertBefore(b, inp);
            }
          });
        }
      }
      // Sync serveur (Blob) : surveillants + locaux par examen — utilisé par les vues imprimables
      let syncT = null;
      function scheduleSync() {
        clearTimeout(syncT);
        syncT = setTimeout(syncServer, 800);
      }
      async function syncServer() {
        const surveillants = {}, locaux = {}, reservistes = {};
        document.querySelectorAll('.fin-inp').forEach(i => {
          if (i.value.trim() && i.dataset.exid) surveillants[i.dataset.exid] = i.value.trim().toUpperCase();
        });
        document.querySelectorAll('.loc-inp').forEach(i => {
          if (i.value.trim() && i.dataset.exid) locaux[i.dataset.exid] = i.value.trim().toUpperCase();
        });
        document.querySelectorAll('.res-inp').forEach(i => {
          if (i.value.trim() && i.dataset.slot) reservistes[i.dataset.slot] = i.value.trim().toUpperCase();
        });
        try {
          const r = await fetch('/api/final', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ surveillants, locaux, liaisons: LIAISONS, reservistes }),
          });
          showStatus(r.ok ? 'Synchronisé ☁' : 'Erreur de sync serveur');
        } catch (e) {
          showStatus('Hors-ligne — sauvé en local');
        }
      }
      function showStatus(msg) {
        const el = document.getElementById('save-status');
        if (el) { el.textContent = msg; clearTimeout(el._t); el._t = setTimeout(() => el.textContent = '', 2000); }
      }
      const HEURES_PAR_PLAGE = 2;   // répartitions.xlsx compte en heures : 1 plage (P1/P2) = 2h
      // Un même prof sur plusieurs examens de la même plage (jour|période) = 1 seule
      // surveillance (fusion) : on compte les plages distinctes, pas les cellules.
      function getCounts() {
        const c = {};
        const seen = new Set();
        document.querySelectorAll('.fin-inp').forEach(inp => {
          const v = inp.value.trim().toUpperCase();
          if (!v) return;
          const key = v + '|' + (inp.dataset.slot || '');
          if (seen.has(key)) return;
          seen.add(key);
          c[v] = (c[v] || 0) + 1;
        });
        return c;
      }
      // Liaisons manuelles : examId → id de groupe (fusion prévue avant saisie prof/local)
      let LIAISONS = {};
      let pendingLink = null;
      function lnk(btn) {
        const id = btn.dataset.exid, slot = btn.dataset.slot;
        if (pendingLink && pendingLink.id === id) {
          // Re-clic sur le même examen : délier (si lié), sinon annuler la sélection
          if (LIAISONS[id]) {
            const gid = LIAISONS[id];
            delete LIAISONS[id];
            const rest = Object.keys(LIAISONS).filter(k => LIAISONS[k] === gid);
            if (rest.length === 1) delete LIAISONS[rest[0]];
            pendingLink = null;
            afterLiaisonChange('Liaison retirée');
          } else {
            pendingLink = null;
            renderLiaisons();
            showStatus('Liaison annulée');
          }
        } else if (pendingLink && pendingLink.slot === slot) {
          // Clic même plage : lier (rejoint un groupe existant le cas échéant).
          // Le groupe reste sélectionné → on peut enchaîner les clics pour l agrandir.
          const gid = LIAISONS[id] || LIAISONS[pendingLink.id] || ('L' + Date.now());
          LIAISONS[id] = gid;
          LIAISONS[pendingLink.id] = gid;
          pendingLink = { id, slot };
          const n = Object.keys(LIAISONS).filter(k => LIAISONS[k] === gid).length;
          afterLiaisonChange('Groupe de ' + n + ' examens 🔗 — clique 🔗 sur un autre examen pour agrandir, re-clique pour délier', gid);
        } else if (pendingLink) {
          pendingLink = { id, slot };
          renderLiaisons();
          showStatus('Autre plage — nouvelle sélection : choisis un examen de la même plage');
        } else {
          // Premier clic : sélection (un examen déjà lié permet d agrandir son groupe)
          pendingLink = { id, slot };
          renderLiaisons();
          showStatus(LIAISONS[id]
            ? 'Groupe sélectionné — clique un examen de la même plage pour le rejoindre, ou re-clique pour délier'
            : 'Choisis un autre examen de la même plage à lier…');
        }
      }
      function afterLiaisonChange(msg, gid) {
        if (gid) propagateLiaison(gid);
        renderLiaisons();
        save();
        showStatus(msg);
      }
      // À la liaison : copie du prof (Fin.) et du local depuis le membre le plus haut
      // du groupe (premier non vide, priorité à l ordre du tableau) vers les autres
      function propagateLiaison(gid) {
        const ids = [...document.querySelectorAll('.fin-inp[data-exid]')]
          .map(i => i.dataset.exid)
          .filter(id => LIAISONS[id] === gid);
        if (ids.length < 2) return;
        ['fin-inp', 'loc-inp'].forEach(c => {
          const inps = ids.map(id => document.querySelector('.' + c + '[data-exid="' + id + '"]')).filter(Boolean);
          const src = inps.find(i => i.value.trim());
          if (!src) return;
          const v = src.value.trim().toUpperCase();
          inps.forEach(i => {
            if (i.value.trim().toUpperCase() !== v) {
              i.value = v;
              i.classList.add('has-val');
            }
          });
        });
      }
      // Saisie sur un membre d un groupe lié : miroir vers les autres membres
      function mirrorToGroup(inp, cls) {
        const gid = LIAISONS[inp.dataset.exid];
        if (!gid) return;
        const v = inp.value.trim().toUpperCase();
        document.querySelectorAll('.' + cls + '[data-exid]').forEach(o => {
          if (o !== inp && LIAISONS[o.dataset.exid] === gid && o.value !== v) {
            o.value = v;
            o.classList.toggle('has-val', v.length > 0);
          }
        });
      }
      function renderLiaisons() {
        document.querySelectorAll('.lnk-btn').forEach(btn => {
          btn.classList.remove('lnk-on', 'lnk-pending');
          btn.removeAttribute('data-grp');
          btn.title = 'Lier à un autre examen de la même plage (fusion prévue)';
        });
        document.querySelectorAll('.fin-inp, .loc-inp').forEach(i => i.classList.remove('linked-grp'));
        const slotGroups = {};
        Object.keys(LIAISONS).forEach(id => {
          const btn = document.querySelector('.lnk-btn[data-exid="' + id + '"]');
          if (!btn) { delete LIAISONS[id]; return; }
          const slot = btn.dataset.slot, gid = LIAISONS[id];
          slotGroups[slot] = slotGroups[slot] || {};
          if (!(gid in slotGroups[slot])) slotGroups[slot][gid] = Object.keys(slotGroups[slot]).length + 1;
          const n = slotGroups[slot][gid];
          btn.classList.add('lnk-on');
          btn.setAttribute('data-grp', n);
          btn.title = 'Liaison ' + n + ' — fusion prévue (cliquer pour délier)';
          ['fin-inp', 'loc-inp'].forEach(c => {
            const inp = document.querySelector('.' + c + '[data-exid="' + id + '"]');
            if (inp) inp.classList.add('linked-grp');
          });
        });
        if (pendingLink) {
          const b = document.querySelector('.lnk-btn[data-exid="' + pendingLink.id + '"]');
          if (b) b.classList.add('lnk-pending');
        }
      }
      // Total de plages à pourvoir : les cellules vides comptent 1 chacune, les
      // cellules remplies fusionnent par (prof, plage), et un groupe lié manuellement
      // compte pour 1 plage même vide → le total diminue à chaque fusion/liaison.
      function totalPlages() {
        const seen = new Set();
        let total = 0;
        const groupHasFilled = {};
        document.querySelectorAll('.fin-inp[data-exid]').forEach(inp => {
          const gid = LIAISONS[inp.dataset.exid];
          if (gid && inp.value.trim()) groupHasFilled[gid] = true;
        });
        document.querySelectorAll('.fin-inp[data-exid]').forEach(inp => {
          const v = inp.value.trim().toUpperCase();
          const gid = LIAISONS[inp.dataset.exid];
          if (v) {
            const key = v + '|' + (inp.dataset.slot || '');
            if (!seen.has(key)) { seen.add(key); total++; }
          } else if (gid) {
            // Vide mais lié : couvert par le membre rempli du groupe, sinon 1 plage pour tout le groupe
            if (groupHasFilled[gid]) return;
            if (!seen.has('LIA|' + gid)) { seen.add('LIA|' + gid); total++; }
          } else {
            total++;
          }
        });
        return total;
      }
      // Cible de surveillance par prof après remaniement.
      // La charge globale (copies + heures de surv) est passée de (Cavant + Havant)
      // à (Capres + Hnouv) : la charge de chaque prof est réduite dans la même
      // proportion, ses copies recalculées sont déduites, le solde = heures de surv
      // à lui attribuer. Les cibles somment exactement au nouveau total d'heures.
      let CIBLES = null;
      function computeCibles(totalPl) {
        const profs = Object.keys(REP_DATA);
        const Hnouv = totalPl * HEURES_PAR_PLAGE;
        let Cavant = 0, Havant = 0, Capres = 0;
        profs.forEach(p => {
          Cavant += REP_DATA[p].c;
          Havant += REP_DATA[p].s;
          Capres += COPIES_PER_PROF[p] || 0;
        });
        const R = (Cavant + Havant) > 0 ? (Capres + Hnouv) / (Cavant + Havant) : 0;
        CIBLES = {};
        profs.forEach(p => {
          const d = REP_DATA[p];
          const cibleH = Math.max(0, R * (d.c + d.s) - (COPIES_PER_PROF[p] || 0));
          CIBLES[p] = cibleH / HEURES_PAR_PLAGE; // en plages
        });
      }
      function fmt1(x) {
        return (Math.round(x * 10) / 10).toString().replace('.', ',');
      }
      function updateCounter() {
        const filled = Object.values(getCounts()).reduce((a, b) => a + b, 0);
        const total  = totalPlages();
        const el = document.getElementById('fill-counter');
        if (!el) return;
        const done = filled >= total;
        el.innerHTML =
          '<strong style="font-size:12px;color:' + (done ? '#166534' : '#1a3254') + '">' + filled + '</strong>'
          + ' <span style="color:#9ca3af">/ ' + total + '</span>'
          + ' <span style="color:#6b7280">plages renseignées</span>';
      }
      function updateRecap() {
        const totalSurv  = totalPlages();
        computeCibles(totalSurv); // recalcul à chaque saisie : les fusions réduisent le total
        const survCounts = getCounts();
        const allProfs   = Object.keys(REP_DATA);
        const resteOf = p => (CIBLES[p] || 0) - (survCounts[p] || 0);
        // Tri par reste à attribuer décroissant : le prof le plus en retard en premier
        allProfs.sort((a, b) => resteOf(b) - resteOf(a));
        const tbody = document.getElementById('recap-tbody');
        if (!tbody) return;
        tbody.innerHTML = allProfs.map(prof => {
          const d     = REP_DATA[prof];
          const nouv  = survCounts[prof] || 0;
          const cible = CIBLES[prof] || 0;
          const reste = cible - nouv;
          const resteTxt = reste > 0.05
            ? \`<span style="color:#991b1b">\${fmt1(reste)}</span>\`
            : reste < -0.55
              ? \`<span style="color:#b45309">+\${fmt1(-reste)}</span>\`
              : \`<span style="color:#166534">✓</span>\`;
          return \`<tr title="\${prof} · avant: \${d.c} copies + \${d.s}h surv · après: \${COPIES_PER_PROF[prof] || 0} copies · cible: \${fmt1(cible * HEURES_PAR_PLAGE)}h = \${fmt1(cible)} plages · attribuées: \${nouv}">
            <td class="rc-prof">\${prof}</td>
            <td><span class="rc-val">\${nouv}<span class="rc-denom">/\${totalSurv}</span></span></td>
            <td class="rc-val">\${fmt1(cible)}</td>
            <td style="font-weight:700;font-size:9px;text-align:center;white-space:nowrap">\${resteTxt}</td>
          </tr>\`;
        }).join('');
        updateCounter();
      }
      function getReste(prof, nouv) {
        if (!CIBLES) computeCibles(totalPlages());
        if (!(prof in (CIBLES || {}))) return 0;
        return Math.max(0, CIBLES[prof] - nouv);
      }
      function autoFill() {
        const inputs = [...document.querySelectorAll('.fin-inp')].filter(i => !i.value);
        if (!inputs.length) { alert('Tous les champs sont déjà remplis.'); return; }
        const counts = getCounts();
        inputs.forEach(inp => {
          const examProf = inp.closest('tr')?.querySelector('.tp')?.textContent.trim().toUpperCase() || '';
          // Pick prof with highest reste who isn't the exam's own prof
          const best = Object.keys(REP_DATA)
            .filter(p => p !== examProf)
            .sort((a, b) => getReste(b, counts[b]||0) - getReste(a, counts[a]||0))
            .find(p => getReste(p, counts[p]||0) > 0);
          if (best) {
            inp.value = best;
            inp.classList.add('has-val');
            counts[best] = (counts[best] || 0) + 1;
          }
        });
        save();
      }
      document.addEventListener('DOMContentLoaded', function() {
        document.querySelectorAll('.fin-inp').forEach((inp, _, arr) => {
          inp.addEventListener('input', function() {
            this.value = this.value.toUpperCase();
            this.classList.toggle('has-val', this.value.length > 0);
            mirrorToGroup(this, 'fin-inp');
            save();
          });
          // Tab/Shift-Tab navigate only between .fin-inp fields
          inp.addEventListener('keydown', function(e) {
            if (e.key === 'Tab') {
              e.preventDefault();
              const list = allInps();
              const idx  = list.indexOf(this);
              const next = e.shiftKey ? list[idx - 1] : list[idx + 1];
              if (next) next.focus();
            }
          });
          // Au départ du focus, l'examen complété peut être masqué par le filtre
          inp.addEventListener('blur', () => setTimeout(updateFilledMarks, 120));
        });
        document.querySelectorAll('.res-inp').forEach(inp => {
          inp.addEventListener('input', function() {
            this.value = this.value.toUpperCase();
            this.classList.toggle('has-val', this.value.length > 0);
            scheduleSync();
            showStatus('Sauvegardé ✓');
          });
        });
        document.querySelectorAll('.loc-inp').forEach(inp => {
          inp.addEventListener('blur', () => setTimeout(updateFilledMarks, 120));
        });
        document.querySelectorAll('.loc-inp').forEach(inp => {
          inp.addEventListener('input', function() {
            this.value = this.value.toUpperCase();
            this.classList.toggle('has-val', this.value.length > 0);
            mirrorToGroup(this, 'loc-inp');
            scheduleSync();
            updateFilledMarks();
            showStatus('Sauvegardé ✓');
          });
        });
        try {
          const saved = localStorage.getItem('tf-surv-2026');
          if (saved) {
            const vals = JSON.parse(saved);
            document.querySelectorAll('.fin-inp').forEach((inp, i) => {
              if (vals[i]) { inp.value = vals[i]; inp.classList.add('has-val'); }
            });
            showStatus('Chargé ✓');
          }
        } catch(e) {}
        // Données serveur (clé = id d'examen) : locaux prioritaires, surveillants en complément.
        // Les examens P1+P2 ont un id par période (id@P1 / id@P2) : les saisies héritées
        // sauvées sous l'id brut sont reprises sur les deux périodes.
        const legacyOf = (map, exid) => {
          const m = map || {};
          return m[exid] ?? (exid.includes('@') ? m[exid.split('@')[0]] : undefined);
        };
        fetch('/api/final').then(r => r.ok ? r.json() : null).then(data => {
          if (!data) return;
          LIAISONS = data.liaisons || {};
          // Migration : liaison héritée sur un examen P1+P2 → une liaison par période
          Object.keys(LIAISONS).forEach(id => {
            if (document.querySelector('.lnk-btn[data-exid="' + id + '"]')) return;
            const gid = LIAISONS[id];
            ['P1', 'P2'].forEach(p => {
              if (document.querySelector('.lnk-btn[data-exid="' + id + '@' + p + '"]')) LIAISONS[id + '@' + p] = gid + '@' + p;
            });
            delete LIAISONS[id];
          });
          renderLiaisons();
          document.querySelectorAll('.loc-inp').forEach(inp => {
            const v = legacyOf(data.locaux, inp.dataset.exid);
            if (v) { inp.value = v; inp.classList.add('has-val'); }
          });
          document.querySelectorAll('.fin-inp').forEach(inp => {
            const v = legacyOf(data.surveillants, inp.dataset.exid);
            if (v && !inp.value) { inp.value = v; inp.classList.add('has-val'); }
          });
          // Réservistes
          const res = data.reservistes || {};
          document.querySelectorAll('.res-inp').forEach(inp => {
            const v = res[inp.dataset.slot];
            if (v) { inp.value = v; inp.classList.add('has-val'); }
          });
          updateFilledMarks();
          updateRecap();
        }).catch(() => {});
        updateFilledMarks();
        updateRecap();
      });
    `

    const allProfCodes = [...new Set(exams.map(e => e.profCode))].sort()
    const datalistHtml = `<datalist id="profs-dl">${allProfCodes.map(c => `<option value="${c}">`).join('')}</datalist>`

    let htmlF = `<!DOCTYPE html>
<html lang="fr"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Tableau final — Surveillance juin 2026</title>
<style>${cssF}</style>
</head><body>
${datalistHtml}
<div class="topbar">
  <div class="topbar-left">
    <h1>Tableau final — Surveillance</h1>
    <p>Collège des Hayeffes &nbsp;·&nbsp; Juin 2026 &nbsp;·&nbsp; Les saisies sont sauvegardées automatiquement &nbsp;·&nbsp; v3</p>
  </div>
  <div class="topbar-right">
    <span class="save-status" id="save-status"></span>
    <button class="copy-all-btn" onclick="copyAll()">↙ Copier toutes les suggestions</button>
    <button class="reset-btn" onclick="resetAll()">Réinitialiser</button>
    <button class="print-btn" onclick="window.print()">Imprimer A3 / PDF</button>
  </div>
</div>

<div class="print-hdr">
  <h1>Tableau de surveillance — Juin 2026</h1>
  <p>Collège des Hayeffes · Imprimé le ${new Date().toLocaleDateString('fr-BE', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
</div>

<div class="legend">
  <span class="leg"><span class="leg-dot" style="background:#f0fdf4;border:1px solid #86efac"></span>SURV confirmée (titulaire)</span>
  <span class="leg"><span class="leg-dot" style="background:#fefce8;border:1px solid #fde047"></span>← suggestion auto (prof libre)</span>
  <span class="leg"><span class="leg-dot" style="background:#fde8e8;border:1px solid #fca5a5"></span>Annulé</span>
  <span class="leg"><span class="leg-dot" style="background:#d1fae5;border:1px solid #6ee7b7"></span>Tous les élèves</span>
  <span class="leg"><span class="leg-dot" style="background:#dbeafe;border:1px solid #93c5fd"></span>Liste nominative</span>
  <span class="leg">🔗 <span style="color:#7c3aed;font-weight:600">Fusion</span> (même surveillant + même local sur la plage)</span>
  <span class="leg">🔗 <span style="color:#d97706;font-weight:600">à vérifier</span> (même surveillant, locaux différents/manquants)</span>
  <span class="leg"><span style="display:inline-block;width:9px;height:9px;border:2px dashed #0d9488;border-radius:2px"></span><span style="color:#0d9488;font-weight:600">Liaison manuelle</span> (clic 🔗 sur deux examens d'une même plage = 1 plage à caser)</span>
  <span class="leg-sep"></span>
  <label class="leg leg-filter"><input type="checkbox" checked onchange="document.body.classList.toggle('hide-annule', !this.checked)" /> Afficher les examens annulés</label>
  <label class="leg leg-filter"><input type="checkbox" checked onchange="document.body.classList.toggle('hide-filled', !this.checked)" /> Afficher les examens remplis (Prof + Local)</label>
  <span class="leg-sep"></span>
  <span id="fill-counter" style="font-size:10.5px"></span>
</div>

<div class="content">
`

    for (const jour of JOURS) {
      htmlF += `<div class="day">
  <div class="day-hdr">
    <span class="day-name">${labelJour(jour)}</span>
    <div class="res-row">
      <span class="res-lbl">Rés. P1 :</span>
      <input class="res-inp" type="text" data-slot="${jour}@P1" list="profs-dl" placeholder="ABC, DEF…" autocomplete="off" />
      <span class="res-lbl">P2 :</span>
      <input class="res-inp" type="text" data-slot="${jour}@P2" list="profs-dl" placeholder="ABC…" autocomplete="off" />
    </div>
  </div>`

      for (const periode of ['P1', 'P2']) {
        const bloc = examsForBloc(jour, periode)
        if (!bloc.length) continue
        const { byNiveau, maxRows } = buildBlocRows(bloc)
        const HALVES_F = [[0,1,2],[3,4,5]]

        htmlF += `<div class="per"><div class="per-label">${periode}</div>`

        HALVES_F.forEach((indices, hi) => {
          const halfNiveaux = indices.map(i => NIVEAUX[i])
          const halfLabels  = indices.map(i => NIVEAU_LABELS[i])
          const halfColors  = indices.map(i => NIV_COLORS_F[i])

          if (hi > 0) htmlF += `<div class="half-gap"></div>`

          htmlF += `<table><thead>
<tr class="niv-row"><th class="tc"></th>`
          halfNiveaux.forEach((_, i) => {
            htmlF += `<th colspan="7" style="background:${halfColors[i]}">${halfLabels[i]}</th>`
          })
          htmlF += `</tr><tr class="col-row"><th class="tc">Pér.</th>`
          halfNiveaux.forEach(() => {
            htmlF += `<th>Mat.</th><th>Cl.</th><th>Prof</th><th>Él.</th><th class="surv-hdr">SURV</th><th class="surv-hdr">Fin.</th><th class="surv-hdr">Loc.</th>`
          })
          htmlF += `</tr></thead><tbody>`

          for (let i = 0; i < maxRows; i++) {
            htmlF += `<tr><td class="tc">${i === 0 ? periode : ''}</td>`
            halfNiveaux.forEach(n => {
              const ex = byNiveau[n][i]
              if (!ex) {
                htmlF += `<td class="te"></td><td class="te"></td><td class="te"></td><td class="te"></td><td class="te"></td><td class="te"></td><td class="te"></td>`
                return
              }
              // Tag chaque cellule de l'examen pour les filtres annulés/remplis (masquage client)
              const isAnnule = partMap.get(ex.id)?.type === 'annule'
              let cells = `<td class="tm">${ex.matiere}</td><td class="tg">${ex.groupe}</td><td class="tp">${ex.profCode}</td>${partBadgeF(ex)}${survFinalCells(ex, periode)}`
              cells = cells.replace(/<td /g, `<td data-exgrp="${uidOf(ex, periode)}"${isAnnule ? ' data-annule="1"' : ''} `)
              htmlF += cells
            })
            htmlF += `</tr>`
          }
          htmlF += `</tbody></table>`
        })
        htmlF += `</div>`
      }
      htmlF += `</div>`
    }

    // Count active exam periods per groupe/niveau (un examen P1+P2 = 2 plages)
    const activeByGroupe = {}
    let totalActiveF = 0
    for (const ex of exams) {
      const p = partMap.get(ex.id)
      if (!p || p.type === 'annule') continue
      const nPer = periodesOf(ex).length
      totalActiveF += nPer
      activeByGroupe[ex.groupe] = (activeByGroupe[ex.groupe] || 0) + nPer
    }

    const recapFinalHtml = `<div class="recap-final">
  <div class="rf-title">Récapitulatif — ${totalActiveF} période${totalActiveF > 1 ? 's' : ''} à surveiller</div>
  <div class="rf-grid">
    ${NIVEAUX.map((n, ni) => {
      const groups = [...new Set(exams.filter(e => e.niveau === n).map(e => e.groupe))].sort()
      const items = groups.map(g => {
        const count = activeByGroupe[g] || 0
        if (!count) return ''
        return `<span class="rf-item"><span class="rf-groupe">${g}</span><span class="rf-count">${count}</span></span>`
      }).filter(Boolean).join('')
      if (!items) return ''
      return `<div class="rf-niv"><span class="rf-niv-label">${NIVEAU_LABELS[ni]}</span>${items}</div>`
    }).filter(Boolean).join('')}
  </div>
</div>`

    const noRespHtml = profsNoResponse.length
      ? `<div class="recap-absent">
    <h3 class="recap-absent-title">Sans réponse (${profsNoResponse.length})</h3>
    ${profsNoResponse.map(p => `<span class="absent-badge">${p}</span>`).join('')}
  </div>`
      : ''

    htmlF += recapFinalHtml + `</div>

<div class="recap-section no-print">
  <div class="recap-inner">
    <h2 class="recap-title">Récap charge de travail</h2>
    <p class="recap-sub">Trié par reste à attribuer · mis à jour en temps réel</p>
    <p class="recap-legend">
      <b>À attrib.</b> = nouvelle cible de surveillance (en plages, 1 plage = 2h) après remaniement :
      la charge du prof (copies + heures) est réduite dans la même proportion que la charge globale,
      copies recalculées déduites.<br>
      <b>Reste</b> = cible − plages déjà attribuées (Fin.) ·
      <span style="color:#166534">✓</span>=atteint ·
      <span style="color:#b45309">+x</span>=dépassé<br>
      Un même prof sur plusieurs examens d'une même plage = 1 surveillance (fusion, le total diminue)
    </p>
    <table class="recap-table">
      <thead>
        <tr>
          <th>Prof</th>
          <th title="Plages de surveillance attribuées (Fin.) / total des plages à surveiller">Surv.</th>
          <th title="Nombre de surveillances à attribuer (cible en plages après remaniement)">À attrib.</th>
          <th title="Cible − plages déjà attribuées">Reste</th>
        </tr>
      </thead>
      <tbody id="recap-tbody">
        <tr><td colspan="4" style="color:#9ca3af;text-align:center;padding:10px;font-style:italic">Chargement…</td></tr>
      </tbody>
    </table>
    ${noRespHtml}
  </div>
</div>

<script>const COPIES_PER_PROF=${JSON.stringify(copiesPerProfF)};const REP_DATA=${JSON.stringify(repDataF)};${jsF}</script></body></html>`
    return new Response(htmlF, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  }

  // ── Récap prof : corrections + surveillances ──────────────────────────────

  if (format === 'print-recap-prof') {
    const finalRaw   = await read('final-locaux.json') ?? {}
    const survMap    = finalRaw.surveillants ?? {}
    const locMap     = finalRaw.locaux       ?? {}
    const resMap     = finalRaw.reservistes  ?? {}   // "jour@per" → "ABC, DEF"

    // Index: (prof, jour, per) → [{mat, grp, local}]
    const survBySlot = {}
    for (const [uid, survProf] of Object.entries(survMap)) {
      if (!survProf) continue
      const [baseId, per2] = uid.includes('@') ? uid.split('@') : [uid, null]
      const meta = exams.find(e => e.id === baseId)
      if (!meta) continue
      for (const per of (per2 ? [per2] : periodesOf(meta))) {
        const local = locMap[uid] ?? locMap[baseId] ?? meta.local ?? ''
        const key = survProf + '|' + meta.jour + '|' + per
        if (!survBySlot[key]) survBySlot[key] = []
        if (!survBySlot[key].find(s => s.mat === meta.matiere && s.grp === meta.groupe))
          survBySlot[key].push({ mat: meta.matiere, grp: meta.groupe, local })
      }
    }

    // Index: (prof, jour, per) → true if réserviste
    const resByProf = {}   // prof → Set of "jour|per"
    for (const [slot, val] of Object.entries(resMap)) {
      if (!val) continue
      const [jour, per] = slot.split('@')
      val.split(',').map(s => s.trim().toUpperCase()).filter(Boolean).forEach(prof => {
        if (!resByProf[prof]) resByProf[prof] = new Set()
        resByProf[prof].add(jour + '|' + per)
      })
    }

    // Union des profs avec examens + profs réservistes (peuvent ne pas avoir d'examens)
    const allProfsR = [...new Set([
      ...exams.map(e => e.profCode),
      ...Object.keys(resByProf),
    ])].sort()
    const nSurvOf = p => Object.keys(survBySlot).filter(k => k.startsWith(p + '|')).length
    const nResOf  = p => (resByProf[p] ? resByProf[p].size : 0)
    const sorted  = [...allProfsR].sort((a,b) => (nSurvOf(b)+nResOf(b)) - (nSurvOf(a)+nResOf(a)) || a.localeCompare(b))

    function fmtJR(iso) {
      const d   = new Date(iso + 'T12:00:00Z')
      const day = d.toLocaleDateString('fr-FR', { weekday: 'short', timeZone: 'Europe/Brussels' })
      const [,m,j] = iso.split('-')
      return `<span class="dw">${day.charAt(0).toUpperCase() + day.slice(1,3)}</span><span class="dd"> ${j}/${m}</span>`
    }

    const PERS = ['P1', 'P2']

    const cssR = `
      @import url('https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600;700&family=JetBrains+Mono:wght@500&display=swap');
      *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
      :root{--navy:#1a3254;--gold:#b8893a;--bg:#f4f3ef;--border:#d6d2c8;--muted:#6b7280}
      body{font-family:'Source Sans 3',sans-serif;font-size:10px;background:var(--bg);color:#1c1c1c;line-height:1.3}
      .topbar{background:var(--navy);color:#fff;padding:10px 20px;display:flex;align-items:center;justify-content:space-between;gap:10px;position:sticky;top:0;z-index:10}
      .topbar h1{font-size:14px;font-weight:700}
      .topbar p{font-size:9px;color:rgba(255,255,255,.5);margin-top:1px}
      .topbar-right{display:flex;align-items:center;gap:6px;flex-shrink:0}
      .btn-gold{background:var(--gold);color:#fff;border:none;padding:5px 13px;font-family:inherit;font-size:10.5px;font-weight:700;cursor:pointer;border-radius:4px}
      .btn-dark{background:#374151;color:#fff;border:none;padding:5px 12px;font-family:inherit;font-size:10px;font-weight:600;cursor:pointer;border-radius:4px}
      .content{max-width:1400px;margin:0 auto;padding:12px 14px 36px}
      .pcard{background:#fff;border:1px solid var(--border);border-radius:5px;overflow:hidden;margin-bottom:8px;page-break-inside:avoid;break-inside:avoid}
      .pcard-hdr{background:var(--navy);color:#fff;padding:4px 10px;display:flex;align-items:center;gap:10px}
      .pname{font-family:'JetBrains Mono',monospace;font-size:11.5px;font-weight:600;letter-spacing:.5px;min-width:50px}
      .pstats{font-size:8.5px;color:rgba(255,255,255,.6);display:flex;gap:8px}
      .ps{background:rgba(255,255,255,.12);border-radius:20px;padding:1px 7px;white-space:nowrap}
      .ps.z{opacity:.4}
      table.gt{width:100%;border-collapse:collapse;table-layout:fixed}
      table.gt th{background:#f0ede6;color:var(--navy);font-size:8px;font-weight:700;padding:3px 4px;border:1px solid var(--border);text-align:center;vertical-align:bottom}
      table.gt th.per-th{background:#e8e4db;width:32px;font-size:8px;font-weight:700;color:var(--navy)}
      table.gt th .dw{display:block;font-weight:700}
      table.gt th .dd{display:block;font-size:7.5px;color:var(--muted)}
      table.gt td{border:1px solid #e8e4db;padding:3px 5px;vertical-align:top;min-height:28px;font-size:8.5px}
      table.gt td.per-td{background:#f8f6f1;font-family:'JetBrains Mono',monospace;font-size:9px;font-weight:700;color:var(--navy);text-align:center;vertical-align:middle;width:32px}
      .cell-surv{display:flex;flex-direction:column;gap:1px}
      .s-item{background:#eff6ff;border:1px solid #bfdbfe;border-radius:3px;padding:1px 4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .s-mat{font-weight:600;color:#1e40af;font-size:8px}
      .s-grp{font-family:'JetBrains Mono',monospace;font-size:7.5px;color:#1e40af}
      .s-loc{font-family:'JetBrains Mono',monospace;font-size:7px;color:#5b21b6;font-weight:700}
      .cell-res{background:#fef9c3;border:1px solid #fde047;border-radius:3px;padding:2px 5px;font-size:8px;font-weight:700;color:#713f12;white-space:nowrap}
      .cell-empty{color:#d1d5db;font-size:9px;text-align:center;padding-top:4px}
      .print-hdr{display:none}
      @media print{
        @page{size:A4 landscape;margin:7mm 9mm}
        body{font-size:8.5px;background:#fff}
        .topbar,.btn-gold,.btn-dark{display:none}
        .print-hdr{display:block;text-align:center;padding-bottom:4px;border-bottom:2px solid var(--navy);margin-bottom:7px}
        .print-hdr h1{font-size:12px;font-weight:700;color:var(--navy)}
        .print-hdr p{font-size:7.5px;color:var(--muted);margin-top:2px}
        .content{padding:0;max-width:none}
        .pcard{border-radius:0;border:1px solid #bbb;margin-bottom:4px}
        .pcard-hdr{padding:2px 7px}
        .pname{font-size:10px}
        table.gt th{font-size:7px;padding:2px 3px}
        table.gt td{padding:2px 3px;font-size:7.5px}
        .s-item{padding:0 3px}
        .s-mat{font-size:7px}
        .s-grp,.s-loc{font-size:6.5px}
        .cell-res{font-size:7px;padding:1px 3px}
      }
    `

    const jsR = `
      let sortMode = 'surv';
      function toggleSort() {
        sortMode = sortMode === 'surv' ? 'alpha' : 'surv';
        const btn = document.getElementById('sort-btn');
        if(btn) btn.textContent = sortMode === 'surv' ? 'Tri : surveillances ↓' : 'Tri : alpha ↑';
        const wrap = document.getElementById('prof-list');
        if(!wrap) return;
        const cards = [...wrap.children];
        cards.sort((a,b) => sortMode === 'alpha'
          ? a.dataset.prof.localeCompare(b.dataset.prof)
          : parseInt(b.dataset.surv||0) - parseInt(a.dataset.surv||0) || a.dataset.prof.localeCompare(b.dataset.prof));
        cards.forEach(c => wrap.appendChild(c));
      }
    `

    let htmlR = `<!DOCTYPE html>
<html lang="fr"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Récap surveillance — Juin 2026</title>
<style>${cssR}</style>
</head><body>
<div class="topbar">
  <div>
    <h1>Récap surveillance — Profs</h1>
    <p>Collège des Hayeffes · Juin 2026 · ${allProfsR.length} profs</p>
  </div>
  <div class="topbar-right">
    <button class="btn-dark" id="sort-btn" onclick="toggleSort()">Tri : surveillances ↓</button>
    <button class="btn-gold" onclick="window.print()">Imprimer A4 paysage / PDF</button>
  </div>
</div>
<div class="print-hdr">
  <h1>Récap surveillance — Juin 2026 — Collège des Hayeffes</h1>
  <p>Imprimé le ${new Date().toLocaleDateString('fr-BE', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
</div>
<div class="content"><div id="prof-list">
`

    for (const prof of sorted) {
      const ns = nSurvOf(prof), nr = nResOf(prof)

      // Construire le tableau grille
      let thead = `<tr><th class="per-th"></th>${JOURS.map(j => `<th>${fmtJR(j)}</th>`).join('')}</tr>`
      let tbody = PERS.map(per => {
        const cells = JOURS.map(jour => {
          const survs = survBySlot[prof + '|' + jour + '|' + per] || []
          const isRes = resByProf[prof]?.has(jour + '|' + per)
          if (!survs.length && !isRes) return `<td><span class="cell-empty">—</span></td>`
          let html = `<td><div class="cell-surv">`
          survs.forEach(s => {
            html += `<div class="s-item"><span class="s-mat">${s.mat}</span> <span class="s-grp">${s.grp}</span>${s.local ? ` <span class="s-loc">${s.local}</span>` : ''}</div>`
          })
          if (isRes) html += `<div class="cell-res">Réserviste</div>`
          html += `</div></td>`
          return html
        }).join('')
        return `<tr><td class="per-td">${per}</td>${cells}</tr>`
      }).join('')

      htmlR += `<div class="pcard" data-prof="${prof}" data-surv="${ns + nr}">
  <div class="pcard-hdr">
    <span class="pname">${prof}</span>
    <span class="pstats">
      <span class="ps${ns === 0 ? ' z' : ''}">${ns} surveillance${ns > 1 ? 's' : ''}</span>
      <span class="ps${nr === 0 ? ' z' : ''}">${nr} réserviste${nr > 1 ? 's' : ''}</span>
    </span>
  </div>
  <table class="gt"><thead>${thead}</thead><tbody>${tbody}</tbody></table>
</div>`
    }

    htmlR += `</div></div><script>${jsR}</script></body></html>`
    return new Response(htmlR, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  }

  // ── Vue imprimable — propositions de fusion ────────────────────────────────

  if (format === 'print-propositions') {
    const partMap = await buildPartMap()

    // Build fusion groups: same prof, same jour, liste nominative ≤ 10 élèves
    const FEW_TH = 10
    const fusionCandidates = []
    for (const prof of profDatas) {
      for (const ex of prof.examens ?? []) {
        const meta = exams.find(e => e.id === ex.id)
        if (!meta) continue
        if (examStatuts[meta.id] ?? groupeStatuts[meta.groupe]) continue
        const statut = ex.statut ?? (ex.maintenu === true ? 'maintenu' : null)
        if (!statut || statut === 'aucun' || statut === 'maintenu' || statut === 'tous') continue
        const n = (ex.eleves ?? []).filter(e => e.nom || e.prenom).length
        if (n < 1 || n > FEW_TH) continue
        // Un examen P1+P2 est candidat dans chacune de ses deux plages
        for (const per of periodesOf(meta)) {
          fusionCandidates.push({ profCode: prof.profCode, jour: meta.jour, periode: per, matiere: meta.matiere, groupe: meta.groupe, local: meta.local, copies: n })
        }
      }
    }
    // Une fusion exige la même plage : même prof, même jour ET même période (P1/P2)
    const fusionGroupMap = {}
    for (const c of fusionCandidates) {
      const key = `${c.profCode}|${c.jour}|${c.periode}`
      if (!fusionGroupMap[key]) fusionGroupMap[key] = { profCode: c.profCode, jour: c.jour, periode: c.periode, items: [] }
      fusionGroupMap[key].items.push(c)
    }
    // fusionsByJourPer[`jour|periode`] = array of valid fusion groups (≥2 exams)
    const fusionsByJourPer = {}
    for (const g of Object.values(fusionGroupMap)) {
      if (g.items.length < 2) continue
      const k = `${g.jour}|${g.periode}`
      if (!fusionsByJourPer[k]) fusionsByJourPer[k] = []
      fusionsByJourPer[k].push(g)
    }

    function partBadge(ex) {
      const p = partMap.get(ex.id)
      if (!p) return `<td class="p-ns"><span class="badge b-ns">–</span></td>`
      if (p.type === 'annule')  return `<td class="p-an"><span class="badge b-an">✕ Annulé</span></td>`
      if (p.type === 'tous')    return `<td class="p-to"><span class="badge b-to">✓ Tous</span></td>`
      return `<td class="p-li"><span class="badge b-li">${p.label}</span></td>`
    }

    const NIV_COLORS_P = ['#1a3254','#1e4976','#1d5fa8','#1a6b8a','#1a7a6e','#236b3e']

    const cssP = `
      @import url('https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600;700&family=Playfair+Display:wght@700&family=JetBrains+Mono:wght@500&display=swap');
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0 }
      :root { --navy:#1a3254; --gold:#b8893a; --bg:#f4f3ef; --white:#ffffff; --text:#1c1c1c; --muted:#6b7280; --border:#d6d2c8; --fusion:#7c2d12 }
      body { font-family:'Source Sans 3','Helvetica Neue',sans-serif; font-size:11px; background:var(--bg); color:var(--text); line-height:1.4 }
      .topbar { background:var(--navy); color:#fff; padding:20px 32px; display:flex; align-items:center; justify-content:space-between; gap:16px }
      .topbar-left h1 { font-family:'Playfair Display',Georgia,serif; font-size:20px; font-weight:700; letter-spacing:-0.3px }
      .topbar-left p  { font-size:11px; color:rgba(255,255,255,.55); margin-top:3px }
      .topbar-right   { display:flex; align-items:center; gap:12px }
      .print-btn { background:var(--gold); color:#fff; border:none; padding:9px 20px; font-family:inherit; font-size:12px; font-weight:700; cursor:pointer; border-radius:4px; letter-spacing:.4px }
      .print-btn:hover { opacity:.88 }
      .legend { display:flex; gap:14px; align-items:center; padding:8px 32px; background:#fff; border-bottom:1px solid var(--border); font-size:10.5px; color:var(--muted) }
      .leg { display:flex; align-items:center; gap:5px }
      .leg-dot { width:10px; height:10px; border-radius:2px; flex-shrink:0 }
      .content { max-width:1600px; margin:0 auto; padding:20px 24px 40px }
      .day { background:var(--white); border:1px solid var(--border); border-radius:6px; overflow:hidden; margin-bottom:14px; box-shadow:0 1px 6px rgba(0,0,0,.06) }
      .day-hdr { background:var(--navy); color:#fff; padding:9px 16px; display:flex; align-items:center; justify-content:space-between }
      .day-name { font-weight:700; font-size:12.5px; letter-spacing:.6px; text-transform:uppercase }
      .per { padding:10px 16px 12px; border-top:1px solid var(--border) }
      .per:first-of-type { border-top:none }
      .per-label { font-size:9.5px; font-weight:700; text-transform:uppercase; letter-spacing:1.2px; color:var(--navy); margin-bottom:7px; display:flex; align-items:center; gap:7px }
      .per-label::after { content:''; flex:1; height:1px; background:var(--border) }
      table { width:100%; border-collapse:collapse }
      thead tr.niv-row th { padding:3px 4px; font-size:10px; font-weight:700; color:#fff; letter-spacing:.4px; text-align:center; border:1px solid rgba(255,255,255,.2) }
      thead tr.col-row th { background:#f0ede6; color:var(--navy); font-size:8.5px; font-weight:700; text-transform:uppercase; letter-spacing:.3px; padding:2px 3px; border:1px solid var(--border); text-align:center }
      thead tr.col-row th.tc { background:#e8e4db }
      tbody td { border:1px solid #e2dfd8; padding:2px 3px; text-align:center; vertical-align:middle; white-space:nowrap }
      tbody tr:nth-child(even) td { background:#faf9f6 }
      .tc { background:#f8f6f1 !important; font-weight:700; font-size:9px; color:var(--navy) }
      .tm { font-weight:600; color:var(--text) }
      .tg { font-weight:700; color:var(--navy) }
      .tp { font-family:'JetBrains Mono','Courier New',monospace; font-size:8.5px; color:var(--muted) }
      .te { background:#faf9f7 !important }
      .badge { display:inline-block; padding:1px 5px; border-radius:3px; font-weight:700; font-size:8px; letter-spacing:.15px }
      .b-an  { background:#fde8e8; color:#991b1b; border:1px solid #fca5a5 }
      .b-to  { background:#d1fae5; color:#065f46; border:1px solid #6ee7b7 }
      .b-li  { background:#dbeafe; color:#1e40af; border:1px solid #93c5fd }
      .b-ns  { color:#9ca3af; font-style:italic; font-weight:400; font-size:8.5px }
      .p-an td, td.p-an { background:#fff5f5 }
      .p-to td, td.p-to { background:#f0fff4 }
      .p-li td, td.p-li { background:#eff6ff }
      /* ── Fusion column ── */
      .tf-hdr { background:var(--fusion) !important; color:#fff !important; font-size:9px !important; padding:3px 6px !important; text-align:left !important; white-space:normal !important; min-width:130px; max-width:180px }
      .tf-cell { background:#fffbeb !important; border-left:2px solid #f59e0b !important; vertical-align:top !important; text-align:left !important; padding:4px 6px !important; white-space:normal !important; min-width:130px }
      .tf-empty { background:#fafaf8 !important }
      .fi { display:block; font-size:8px; color:#92400e; margin:2px 0; line-height:1.4 }
      .fi-prof { font-family:'JetBrains Mono','Courier New',monospace; font-weight:700; margin-right:3px }
      .fi-arrow { color:#b45309; margin:0 2px }
      .fi-tot { color:#78350f; font-weight:700 }
      .fi-none { font-size:8px; color:#9ca3af; font-style:italic }
      /* ── Print ── */
      .print-hdr { display:none }
      @media print {
        @page { size: A4 landscape; margin: 6mm 8mm }
        body { background:#fff; font-size:7.5px }
        .topbar, .legend, .print-btn { display:none }
        .print-hdr { display:block; text-align:center; margin-bottom:6px; padding-bottom:5px; border-bottom:2px solid var(--navy) }
        .print-hdr h1 { font-family:'Playfair Display',Georgia,serif; font-size:13px; font-weight:700; color:var(--navy) }
        .print-hdr p  { font-size:8.5px; color:var(--muted); margin-top:2px }
        .content { padding:0; max-width:none }
        .day { box-shadow:none; border-radius:0; border:1px solid #bbb; margin-bottom:6px }
        .day-hdr { padding:4px 8px }
        .day-name { font-size:9px }
        .per { padding:3px 8px 5px }
        table { font-size:6.5px }
        thead tr.niv-row th { font-size:7.5px; padding:2px 2px }
        thead tr.col-row th { font-size:6px; padding:1px 2px }
        tbody td { padding:1px 2px }
        .badge { font-size:6px; padding:0 2px }
        .tf-hdr { min-width:90px !important; max-width:120px !important; font-size:7px !important }
        .tf-cell { min-width:90px !important; padding:2px 4px !important }
        .fi { font-size:6.5px; margin:1px 0 }
      }
    `

    let htmlP = `<!DOCTYPE html>
<html lang="fr"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Propositions de fusion — Examens juin 2026</title>
<style>${cssP}</style>
</head><body>

<div class="topbar">
  <div class="topbar-left">
    <h1>Propositions de fusion — Examens juin 2026</h1>
    <p>Collège des Hayeffes &nbsp;·&nbsp; P1 et P2 traités comme identiques &nbsp;·&nbsp; Seuil : ≤ ${FEW_TH} élèves/examen</p>
  </div>
  <div class="topbar-right">
    <div class="legend">
      <span class="leg"><span class="leg-dot" style="background:#fde8e8;border:1px solid #fca5a5"></span>Annulé</span>
      <span class="leg"><span class="leg-dot" style="background:#d1fae5;border:1px solid #6ee7b7"></span>Tous les élèves</span>
      <span class="leg"><span class="leg-dot" style="background:#dbeafe;border:1px solid #93c5fd"></span>Liste nominative</span>
      <span class="leg"><span class="leg-dot" style="background:#fffbeb;border:2px solid #f59e0b"></span>Fusion proposée</span>
    </div>
    <button class="print-btn" onclick="window.print()">Imprimer / PDF</button>
  </div>
</div>

<div class="print-hdr">
  <h1>Propositions de fusion — Examens juin 2026</h1>
  <p>Collège des Hayeffes · Imprimé le ${new Date().toLocaleDateString('fr-BE', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
</div>

<div class="content">
`

    for (const jour of JOURS) {
      const nbFusionsJour = (fusionsByJourPer[`${jour}|P1`]?.length ?? 0) + (fusionsByJourPer[`${jour}|P2`]?.length ?? 0)

      htmlP += `<div class="day">
  <div class="day-hdr">
    <span class="day-name">${labelJour(jour)}</span>
    <span style="font-size:10px;color:rgba(255,255,255,.55)">${nbFusionsJour > 0 ? `${nbFusionsJour} proposition${nbFusionsJour > 1 ? 's' : ''} de fusion` : 'Aucune fusion proposée'}</span>
  </div>`

      for (const periode of ['P1', 'P2']) {
        const bloc = examsForBloc(jour, periode)
        if (!bloc.length) continue
        const { byNiveau, maxRows } = buildBlocRows(bloc)

        const perFusions = fusionsByJourPer[`${jour}|${periode}`] ?? []

        // Build fusion cell HTML
        let fusionCellHtml = ''
        if (perFusions.length === 0) {
          fusionCellHtml = `<span class="fi-none">–</span>`
        } else {
          fusionCellHtml = perFusions.map(g => {
            const parts = g.items.map(it => `${it.matiere}&nbsp;${it.groupe}&nbsp;(${it.periode},&nbsp;${it.copies}&nbsp;él.)`)
            const total = g.items.reduce((s, it) => s + it.copies, 0)
            return `<span class="fi"><span class="fi-prof">${g.profCode}</span><span class="fi-arrow">↔</span>${parts.join('<span class="fi-arrow"> + </span>')}<span class="fi-arrow"> →</span> <span class="fi-tot">${total}&nbsp;él.</span></span>`
          }).join('')
        }

        htmlP += `<div class="per"><div class="per-label">${periode}</div>
<table>
<thead>
<tr class="niv-row"><th class="tc"></th>`
        NIVEAUX.forEach((_, i) => {
          htmlP += `<th colspan="4" style="background:${NIV_COLORS_P[i]}">${NIVEAU_LABELS[i]}</th>`
        })
        htmlP += `<th rowspan="2" class="tf-hdr">Propositions de fusion</th>`
        htmlP += `</tr>
<tr class="col-row"><th class="tc">Pér.</th>`
        NIVEAUX.forEach(() => {
          htmlP += `<th>Matière</th><th>Classe</th><th>Prof</th><th>Élèves</th>`
        })
        htmlP += `</tr></thead><tbody>`

        for (let i = 0; i < maxRows; i++) {
          htmlP += `<tr><td class="tc">${i === 0 ? periode : ''}</td>`
          NIVEAUX.forEach(n => {
            const ex = byNiveau[n][i]
            if (!ex) { htmlP += `<td class="te"></td><td class="te"></td><td class="te"></td><td class="te"></td>`; return }
            htmlP += `<td class="tm">${ex.matiere}</td><td class="tg">${ex.groupe}</td><td class="tp">${ex.profCode}</td>${partBadge(ex)}`
          })
          if (i === 0) {
            htmlP += `<td rowspan="${maxRows}" class="tf-cell">${fusionCellHtml}</td>`
          }
          htmlP += `</tr>`
        }
        htmlP += `</tbody></table></div>`
      }
      htmlP += `</div>`
    }

    htmlP += `</div></body></html>`
    return new Response(htmlP, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  }

  if (format === 'cleanup-debug') {
    const { list, del } = await import('@vercel/blob')
    const { blobs } = await list({ prefix: 'debug-probe' })
    const urls = blobs.map(b => b.url)
    if (urls.length) await del(urls)
    return Response.json({ deleted: blobs.map(b => b.pathname) })
  }

  if (format === 'debug') {
    // Test: write a probe file and read it back to verify the full read/write cycle
    let writeReadTest = 'not run'
    try {
      const probe = { probe: true, ts: Date.now() }
      await writeFileSafe('debug-probe.json', probe)
      const { list, get } = await import('@vercel/blob')
      const { blobs } = await list({ prefix: 'debug-probe.json' })
      const blob = blobs.find(b => b.pathname === 'debug-probe.json')
      if (!blob) {
        writeReadTest = `list OK (${blobs.length} blobs avec ce prefix) mais debug-probe.json introuvable`
      } else {
        const result = await get(blob.url, { access: 'private' })
        if (!result || result.statusCode !== 200) {
          writeReadTest = `get() a retourné null/304 pour url=${blob.url}`
        } else {
          const text = await new Response(result.stream).text()
          const parsed = JSON.parse(text)
          writeReadTest = parsed?.probe === true ? 'OK — écriture et lecture Blob fonctionnent' : `lecture échouée (parsed=${JSON.stringify(parsed)})`
        }
      }
    } catch (e) {
      writeReadTest = `ERREUR: ${e?.message ?? String(e)}`
    }
    let rawBlobList = []
    try {
      const { list } = await import('@vercel/blob')
      const { blobs } = await list({})
      rawBlobList = blobs.map(b => ({ pathname: b.pathname, url: b.url }))
    } catch (e) {
      rawBlobList = [`ERREUR list: ${e?.message}`]
    }
    return Response.json({
      useBlob: !!process.env.BLOB_READ_WRITE_TOKEN,
      writeReadTest,
      rawBlobList,
      adminLocksContent: locksRaw,
      groupeStatuts,
      allFiles,
      currentFiles,
    })
  }

  // ── Temps prof CSV ─────────────────────────────────────────────────────────

  if (format === 'temps-prof') {
    const MAINTENU_COPIES = 25
    const ALL_PROF_CODES  = [...new Set(exams.map(e => e.profCode))].sort()

    const allResponses = {}
    for (const prof of profDatas) {
      if (!prof?.profCode) continue
      allResponses[prof.profCode] = prof
    }

    const tpRows = []
    for (const code of ALL_PROF_CODES) {
      const profExams = exams.filter(e => e.profCode === code)
      const profResp  = allResponses[code]

      let copies = 0, annules = 0, maintenu = 0, liste = 0, pending = 0, copiesListe = 0

      for (const ex of profExams) {
        const adminStatut = examStatuts[ex.id] ?? groupeStatuts[ex.groupe]
        if (adminStatut === 'annule') {
          annules++
        } else if (adminStatut === 'maintenu') {
          maintenu++; copies += MAINTENU_COPIES
        } else {
          const profEx = profResp?.examens?.find(e => e.id === ex.id)
          if (!profEx) {
            pending++
          } else {
            const statut = profEx.statut ?? (profEx.maintenu === true ? 'maintenu' : null)
            if (statut === 'aucun') {
              annules++
            } else if (statut === 'maintenu' || statut === 'tous') {
              maintenu++; copies += MAINTENU_COPIES
            } else {
              const n = (profEx.eleves ?? []).filter(e => e.nom || e.prenom).length
              liste++; copiesListe += n; copies += n
            }
          }
        }
      }

      tpRows.push({ profCode: code, examens: profExams.length, copies, annules, maintenu, liste, copiesListe, pending })
    }
    tpRows.sort((a, b) => b.copies - a.copies)

    const TP_COLS    = ['profCode','examens','copies','annules','maintenu','liste','copiesListe','pending']
    const TP_HEADERS = ['Prof','Nb examens','Copies totales','Annulés','Maintenus/Tous','Liste (nb exam)','Copies liste','En attente']
    const tpCsvRows  = tpRows.map(r => TP_COLS.map(k => `"${String(r[k] ?? '').replace(/"/g, '""')}"`).join(';'))
    const tpCsv      = '﻿' + [TP_HEADERS.join(';'), ...tpCsvRows].join('\r\n')
    return new Response(tpCsv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="temps-prof-juin2026.csv"',
      }
    })
  }

  const rows = []

  // Helper: build rows for exams governed by admin classe-level status
  // (no prof submission needed for these)
  const coveredByAdmin = new Set()
  for (const ex of exams) {
    const s = examStatuts[ex.id] ?? groupeStatuts[ex.groupe]
    if (!s) continue // open → handled by prof submission
    if (groupeFilter && ex.groupe !== groupeFilter) continue
    if (niveauFilter && ex.niveau !== niveauFilter) continue
    if (profFilter && ex.profCode !== profFilter) continue
    coveredByAdmin.add(ex.id)
    const base = {
      prof: ex.profCode, jour: ex.jour, periode: ex.periode,
      niveau: ex.niveau, groupe: ex.groupe, matiere: ex.matiere, local: ex.local,
      surveilleParTitulaire: 'Non',
    }
    if (s === 'annule') {
      rows.push({ ...base, nom: '', prenom: '', participation: "Annulé par l'administration" })
    } else if (s === 'maintenu') {
      rows.push({ ...base, nom: '(tous les élèves)', prenom: '', participation: 'Maintenu pour tous les élèves' })
    }
  }

  // Prof-submitted data for open groupes
  for (const prof of profDatas) {
    if (profFilter && prof.profCode !== profFilter) continue

    for (const ex of prof.examens ?? []) {
      if (coveredByAdmin.has(ex.id)) continue // admin override takes precedence
      const meta = exams.find(e => e.id === ex.id)
      if (!meta) continue
      if (groupeFilter && meta.groupe !== groupeFilter) continue
      if (niveauFilter && meta.niveau !== niveauFilter) continue

      const base = {
        prof: prof.profCode, jour: meta.jour, periode: meta.periode,
        niveau: meta.niveau, groupe: meta.groupe, matiere: meta.matiere, local: meta.local,
        surveilleParTitulaire: ex.surveilleParTitulaire ? 'Oui' : 'Non',
      }
      const statut = ex.statut ?? (ex.maintenu === true ? 'maintenu' : null)

      if (statut === 'aucun') {
        rows.push({ ...base, nom: '', prenom: '', participation: 'Aucun élève' })
      } else if (statut === 'tous') {
        rows.push({ ...base, nom: '(tous les élèves)', prenom: '', participation: 'Tous les élèves' })
      } else if (statut === 'maintenu') {
        rows.push({ ...base, nom: '(examen maintenu)', prenom: '', participation: 'Examen maintenu' })
      } else {
        for (const el of ex.eleves ?? []) {
          if (!el.nom && !el.prenom) continue
          rows.push({ ...base, nom: el.nom, prenom: el.prenom, participation: 'Liste nominative' })
        }
      }
    }
  }

  // Sort: jour → groupe → prof → nom
  rows.sort((a, b) => a.jour.localeCompare(b.jour) || a.groupe.localeCompare(b.groupe) || a.prof.localeCompare(b.prof) || a.nom.localeCompare(b.nom))

  const suffix   = profFilter ? `-${profFilter}` : groupeFilter ? `-${groupeFilter}` : niveauFilter ? `-${niveauFilter}` : ''
  const filename = `examens-juin2026${suffix}`

  const COLS    = ['prof','jour','periode','niveau','groupe','matiere','local','nom','prenom','participation','surveilleParTitulaire']
  const HEADERS = ['Prof','Jour','Période','Niveau','Groupe','Matière','Local','Nom','Prénom','Participation','Surveillé par titulaire']

  if (format === 'xlsx') {
    const XLSX = (await import('xlsx')).default
    const wsData = [HEADERS, ...rows.map(r => COLS.map(k => r[k] ?? ''))]
    const ws = XLSX.utils.aoa_to_sheet(wsData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Élèves')
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    return new Response(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}.xlsx"`,
      }
    })
  }

  const csvRows = rows.map(r => COLS.map(k => `"${String(r[k] ?? '').replace(/"/g, '""')}"`).join(';'))
  const csv = '﻿' + [HEADERS.join(';'), ...csvRows].join('\r\n')

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}.csv"`,
    }
  })
}
