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
    for (const f of currentFiles) {
      const prof = await read(f)
      if (!prof) continue
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
    for (const f of currentFiles) {
      const prof = await read(f)
      if (!prof) continue
      for (const ex of prof.examens ?? []) {
        if (ex.surveilleParTitulaire) survFlagMap.set(ex.id, true)
      }
    }

    // Per slot (jour|periode): profs with active exams vs profs with annulled exams (potentially free)
    const activeAtSlot = new Map() // slot → Set<profCode>
    const freeAtSlot   = new Map() // slot → Array<profCode> sorted

    for (const ex of exams) {
      const slot = `${ex.jour}|${ex.periode}`
      if (!activeAtSlot.has(slot)) activeAtSlot.set(slot, new Set())
      if (!freeAtSlot.has(slot))   freeAtSlot.set(slot, [])
      const p = partMap.get(ex.id)
      if (!p || p.type === 'annule') freeAtSlot.get(slot).push(ex.profCode)
      else activeAtSlot.get(slot).add(ex.profCode)
    }

    // Conflict detection: prof has 2+ active exams at same slot → can't supervise all
    const profActiveCount = new Map()
    for (const ex of exams) {
      const p = partMap.get(ex.id)
      if (!p || p.type === 'annule') continue
      const key = `${ex.profCode}|${ex.jour}|${ex.periode}`
      profActiveCount.set(key, (profActiveCount.get(key) || 0) + 1)
    }

    function survCells(ex) {
      const p = partMap.get(ex.id)
      if (!p || p.type === 'annule') {
        return `<td class="ts-an"></td><td class="ts-an"></td><td class="ts-fin"></td>`
      }
      const slot        = `${ex.jour}|${ex.periode}`
      const wantsSurv   = survFlagMap.get(ex.id) ?? false
      const hasConflict = (profActiveCount.get(`${ex.profCode}|${ex.jour}|${ex.periode}`) || 0) > 1
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
              html += `<td class="tm">${ex.matiere}</td><td class="tg">${ex.groupe}</td><td class="tp">${ex.profCode}</td>${partBadge(ex)}${survCells(ex)}`
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
    for (const f of currentFiles) {
      const prof = await read(f)
      if (!prof) continue
      for (const ex of prof.examens ?? []) {
        if (ex.surveilleParTitulaire) survFlagMapF.set(ex.id, true)
      }
    }
    const profActiveCountF = new Map()
    for (const ex of exams) {
      const p = partMap.get(ex.id)
      if (!p || p.type === 'annule') continue
      const key = `${ex.profCode}|${ex.jour}|${ex.periode}`
      profActiveCountF.set(key, (profActiveCountF.get(key) || 0) + 1)
    }

    // Profs who are actively supervising their OWN exam at each slot
    // (active + asked to supervise + no scheduling conflict) → can co-supervise another exam
    const survWillingAtSlot = new Map()
    for (const ex of exams) {
      const p = partMap.get(ex.id)
      if (!p || p.type === 'annule') continue
      if (!survFlagMapF.has(ex.id)) continue
      if ((profActiveCountF.get(`${ex.profCode}|${ex.jour}|${ex.periode}`) || 0) > 1) continue
      const slot = `${ex.jour}|${ex.periode}`
      if (!survWillingAtSlot.has(slot)) survWillingAtSlot.set(slot, [])
      survWillingAtSlot.get(slot).push(ex.profCode)
    }

    // Profs with no file at all (never connected)
    const profsWithFile = new Set(currentFiles.map(f => f.replace(/^prof-/, '').replace(/\.json$/, '')))
    const profsNoResponse = [...new Set(exams.map(e => e.profCode))].filter(p => !profsWithFile.has(p)).sort()

    function survFinalCells(ex) {
      const p = partMap.get(ex.id)
      if (!p || p.type === 'annule') {
        return `<td class="ts-an"></td><td class="tfin-cell ts-an"></td>`
      }
      const slot        = `${ex.jour}|${ex.periode}`
      const wantsSurv   = survFlagMapF.get(ex.id) ?? false
      const hasConflict = (profActiveCountF.get(`${ex.profCode}|${ex.jour}|${ex.periode}`) || 0) > 1
      const survVal     = (wantsSurv && !hasConflict) ? ex.profCode : ''
      // Arrow shows the prof's own code whenever they asked to supervise (conflict or not)
      const conseilVal = wantsSurv ? ex.profCode : ''
      const cpBtn = conseilVal
        ? `<button class="cp-btn" data-v="${conseilVal}" onclick="cp(this)" title="${conseilVal}">← ${conseilVal}</button>`
        : ''
      return `<td class="ts${survVal ? ' ts-ok' : ''}">${survVal}</td><td class="tfin-cell"><div class="tfin-wrap"><input class="fin-inp" type="text" list="profs-dl" data-conseil="${conseilVal}" placeholder="${conseilVal}" autocomplete="off" />${cpBtn}</div></td>`
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
      .content { max-width:1700px; margin:0 auto; padding:14px 18px 32px }
      .day { background:var(--white); border:1px solid var(--border); border-radius:6px; overflow:hidden; margin-bottom:10px; box-shadow:0 1px 5px rgba(0,0,0,.05) }
      .day-hdr { background:var(--navy); color:#fff; padding:7px 13px; display:flex; align-items:center; justify-content:space-between }
      .day-name { font-weight:700; font-size:11.5px; letter-spacing:.5px; text-transform:uppercase }
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
      .recap-table thead th { background:#f0ede6; color:#1a3254; font-size:7.5px; font-weight:700; text-transform:uppercase; padding:3px 3px; border:1px solid #e2dfd8; text-align:center }
      .recap-table tbody td { border:1px solid #e8e4db; padding:2px 3px; vertical-align:middle }
      .rc-prof  { font-family:'JetBrains Mono',monospace; font-size:9px; font-weight:600; color:#374151 }
      .rc-n     { text-align:center; font-size:9px; font-weight:600; min-width:22px }
      .rc-cible { text-align:center; font-size:9px; font-weight:700; min-width:28px; background:#f8f6f1 }
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
        .cp-btn { display:none }
        .fin-inp {
          border:none !important; background:transparent !important;
          width:auto !important; font-size:7px; padding:0 !important;
          color:#166534; font-weight:700; text-transform:uppercase;
        }
        .fin-inp::placeholder { color:#9ca3af; font-style:italic; font-weight:400 }
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
        localStorage.removeItem('tf-surv-2026');
        showStatus('Réinitialisé');
      }
      function save() {
        const vals = [...document.querySelectorAll('.fin-inp')].map(i => i.value);
        localStorage.setItem('tf-surv-2026', JSON.stringify(vals));
        showStatus('Sauvegardé ✓');
        updateRecap();
      }
      function showStatus(msg) {
        const el = document.getElementById('save-status');
        if (el) { el.textContent = msg; clearTimeout(el._t); el._t = setTimeout(() => el.textContent = '', 2000); }
      }
      const SURV_PTS = 16;
      function getCounts() {
        const c = {};
        document.querySelectorAll('.fin-inp').forEach(inp => {
          const v = inp.value.trim().toUpperCase();
          if (v) c[v] = (c[v] || 0) + 1;
        });
        return c;
      }
      function getReste(prof, nouv) {
        const d = REP_DATA[prof];
        if (!d) return 0;
        const cible = d.c + d.s * SURV_PTS;
        const score = (COPIES_PER_PROF[prof] || 0) + nouv * SURV_PTS;
        return cible - score;
      }
      function updateRecap() {
        const survCounts = getCounts();
        const allProfs = Object.keys(REP_DATA);
        allProfs.sort((a, b) => getReste(b, survCounts[b]||0) - getReste(a, survCounts[a]||0));
        const tbody = document.getElementById('recap-tbody');
        if (!tbody) return;
        tbody.innerHTML = allProfs.map(prof => {
          const d      = REP_DATA[prof];
          const copies = COPIES_PER_PROF[prof] || 0;
          const nouv   = survCounts[prof] || 0;
          const score  = copies + nouv * SURV_PTS;
          const cible  = d.c + d.s * SURV_PTS;
          const reste  = cible - score;
          const rc = reste <= 0 ? '#166534' : reste <= 48 ? '#b45309' : '#991b1b';
          const nd = v => v > 0 ? v : \`<span style="color:#d1d5db">–</span>\`;
          const resteCell = reste <= 0
            ? \`<span style="color:#166534;font-weight:700">✓</span>\`
            : \`<span style="color:\${rc};font-weight:700">\${reste}</span>\`;
          return \`<tr title="Copies initial: \${d.c} · Surv prévues: \${d.s}h · Cible: \${cible}">
            <td class="rc-prof">\${prof}</td>
            <td class="rc-n">\${score}</td>
            <td class="rc-n">\${nd(d.s)}</td>
            <td class="rc-n">\${nd(nouv)}</td>
            <td class="rc-cible">\${resteCell}</td>
          </tr>\`;
        }).join('');
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
    <p>Collège des Hayeffes &nbsp;·&nbsp; Juin 2026 &nbsp;·&nbsp; Les saisies sont sauvegardées automatiquement</p>
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
</div>

<div class="content">
`

    for (const jour of JOURS) {
      htmlF += `<div class="day">
  <div class="day-hdr"><span class="day-name">${labelJour(jour)}</span></div>`

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
            htmlF += `<th colspan="6" style="background:${halfColors[i]}">${halfLabels[i]}</th>`
          })
          htmlF += `</tr><tr class="col-row"><th class="tc">Pér.</th>`
          halfNiveaux.forEach(() => {
            htmlF += `<th>Mat.</th><th>Cl.</th><th>Prof</th><th>Él.</th><th class="surv-hdr">SURV</th><th class="surv-hdr">Fin.</th>`
          })
          htmlF += `</tr></thead><tbody>`

          for (let i = 0; i < maxRows; i++) {
            htmlF += `<tr><td class="tc">${i === 0 ? periode : ''}</td>`
            halfNiveaux.forEach(n => {
              const ex = byNiveau[n][i]
              if (!ex) {
                htmlF += `<td class="te"></td><td class="te"></td><td class="te"></td><td class="te"></td><td class="te"></td><td class="te"></td>`
                return
              }
              htmlF += `<td class="tm">${ex.matiere}</td><td class="tg">${ex.groupe}</td><td class="tp">${ex.profCode}</td>${partBadgeF(ex)}${survFinalCells(ex)}`
            })
            htmlF += `</tr>`
          }
          htmlF += `</tbody></table>`
        })
        htmlF += `</div>`
      }
      htmlF += `</div>`
    }

    // Count active exam periods per groupe/niveau
    const activeByGroupe = {}
    let totalActiveF = 0
    for (const ex of exams) {
      const p = partMap.get(ex.id)
      if (!p || p.type === 'annule') continue
      totalActiveF++
      activeByGroupe[ex.groupe] = (activeByGroupe[ex.groupe] || 0) + 1
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
    <p class="recap-sub">Trié par score décroissant · mis à jour en temps réel</p>
    <p class="recap-legend">Score = copies actuelles + nouv × 16<br>Cible = copies initiales + H.prév × 16<br>Reste = Cible − Score &nbsp;<span style="color:#166534">✓</span>=atteint</p>
    <table class="recap-table">
      <thead>
        <tr>
          <th>Prof</th>
          <th title="Score actuel = copies + nouv surv × 16">Score</th>
          <th title="Heures surv prévues (répartitions initiales)">H.Prév</th>
          <th title="Nouvelles heures assignées (Fin.)">Nouv</th>
          <th title="Reste à atteindre pour égaler la cible (Cible − Score)">Reste</th>
        </tr>
      </thead>
      <tbody id="recap-tbody">
        <tr><td colspan="5" style="color:#9ca3af;text-align:center;padding:10px;font-style:italic">Chargement…</td></tr>
      </tbody>
    </table>
    ${noRespHtml}
  </div>
</div>

<script>const COPIES_PER_PROF=${JSON.stringify(copiesPerProfF)};const REP_DATA=${JSON.stringify(repDataF)};${jsF}</script></body></html>`
    return new Response(htmlF, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  }

  // ── Vue imprimable — propositions de fusion ────────────────────────────────

  if (format === 'print-propositions') {
    const partMap = await buildPartMap()

    // Build fusion groups: same prof, same jour, liste nominative ≤ 10 élèves
    const FEW_TH = 10
    const fusionCandidates = []
    for (const f of currentFiles) {
      const prof = await read(f)
      if (!prof) continue
      for (const ex of prof.examens ?? []) {
        const meta = exams.find(e => e.id === ex.id)
        if (!meta) continue
        if (examStatuts[meta.id] ?? groupeStatuts[meta.groupe]) continue
        const statut = ex.statut ?? (ex.maintenu === true ? 'maintenu' : null)
        if (!statut || statut === 'aucun' || statut === 'maintenu' || statut === 'tous') continue
        const n = (ex.eleves ?? []).filter(e => e.nom || e.prenom).length
        if (n < 1 || n > FEW_TH) continue
        fusionCandidates.push({ profCode: prof.profCode, jour: meta.jour, periode: meta.periode, matiere: meta.matiere, groupe: meta.groupe, local: meta.local, copies: n })
      }
    }
    const fusionGroupMap = {}
    for (const c of fusionCandidates) {
      const key = `${c.profCode}|${c.jour}`
      if (!fusionGroupMap[key]) fusionGroupMap[key] = { profCode: c.profCode, jour: c.jour, items: [] }
      fusionGroupMap[key].items.push(c)
    }
    // fusionsByJour[jour] = array of valid fusion groups (≥2 exams)
    const fusionsByJour = {}
    for (const g of Object.values(fusionGroupMap)) {
      if (g.items.length < 2) continue
      if (!fusionsByJour[g.jour]) fusionsByJour[g.jour] = []
      fusionsByJour[g.jour].push(g)
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
      const dayFusions  = fusionsByJour[jour] ?? []
      let fusionPrinted = false

      htmlP += `<div class="day">
  <div class="day-hdr">
    <span class="day-name">${labelJour(jour)}</span>
    <span style="font-size:10px;color:rgba(255,255,255,.55)">${dayFusions.length > 0 ? `${dayFusions.length} proposition${dayFusions.length > 1 ? 's' : ''} de fusion` : 'Aucune fusion proposée'}</span>
  </div>`

      for (const periode of ['P1', 'P2']) {
        const bloc = examsForBloc(jour, periode)
        if (!bloc.length) continue
        const { byNiveau, maxRows } = buildBlocRows(bloc)

        const showFusionContent = !fusionPrinted
        if (showFusionContent) fusionPrinted = true

        // Build fusion cell HTML
        let fusionCellHtml = ''
        if (dayFusions.length === 0) {
          fusionCellHtml = `<span class="fi-none">–</span>`
        } else {
          fusionCellHtml = dayFusions.map(g => {
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
            if (showFusionContent) {
              htmlP += `<td rowspan="${maxRows}" class="tf-cell">${fusionCellHtml}</td>`
            } else {
              htmlP += `<td rowspan="${maxRows}" class="tf-empty"></td>`
            }
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
    for (const f of currentFiles) {
      const prof = await read(f)
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
  for (const f of currentFiles) {
    const prof = await read(f)
    if (!prof) continue
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
