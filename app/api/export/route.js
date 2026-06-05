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
        .sort((a, b) => a.groupe.localeCompare(b.groupe))
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

      /* ── Screen chrome ── */
      .topbar { background:var(--navy); color:#fff; padding:20px 32px; display:flex; align-items:center; justify-content:space-between; gap:16px }
      .topbar-left h1 { font-family:'Playfair Display',Georgia,serif; font-size:20px; font-weight:700; letter-spacing:-0.3px }
      .topbar-left p  { font-size:11px; color:rgba(255,255,255,.55); margin-top:3px }
      .topbar-right   { display:flex; align-items:center; gap:12px }
      .print-btn { background:var(--gold); color:#fff; border:none; padding:9px 20px; font-family:inherit; font-size:12px; font-weight:700; cursor:pointer; border-radius:4px; letter-spacing:.4px }
      .print-btn:hover { opacity:.88 }
      .legend { display:flex; gap:14px; align-items:center; padding:8px 32px; background:#fff; border-bottom:1px solid var(--border); font-size:10.5px; color:var(--muted) }
      .leg { display:flex; align-items:center; gap:5px }
      .leg-dot { width:10px; height:10px; border-radius:2px; flex-shrink:0 }

      /* ── Content ── */
      .content { max-width:1440px; margin:0 auto; padding:20px 24px 40px }

      /* ── Day card ── */
      .day { background:var(--white); border:1px solid var(--border); border-radius:6px; overflow:hidden; margin-bottom:14px; box-shadow:0 1px 6px rgba(0,0,0,.06) }
      .day-hdr { background:var(--navy); color:#fff; padding:9px 16px; display:flex; align-items:center; justify-content:space-between }
      .day-name { font-weight:700; font-size:12.5px; letter-spacing:.6px; text-transform:uppercase }
      .day-res  { font-size:10px; color:rgba(255,255,255,.55) }
      .res-field { display:inline-block; min-width:55px; border-bottom:1px solid rgba(255,255,255,.4); margin-left:5px }

      /* ── Period block ── */
      .per { padding:10px 16px 12px; border-top:1px solid var(--border) }
      .per:first-of-type { border-top:none }
      .per-label { font-size:9.5px; font-weight:700; text-transform:uppercase; letter-spacing:1.2px; color:var(--navy); margin-bottom:7px; display:flex; align-items:center; gap:7px }
      .per-label::after { content:''; flex:1; height:1px; background:var(--border) }

      /* ── Table ── */
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

      /* ── Participation badges ── */
      .badge { display:inline-block; padding:1px 5px; border-radius:3px; font-weight:700; font-size:8px; letter-spacing:.15px }
      .b-an  { background:#fde8e8; color:#991b1b; border:1px solid #fca5a5 }
      .b-to  { background:#d1fae5; color:#065f46; border:1px solid #6ee7b7 }
      .b-li  { background:#dbeafe; color:#1e40af; border:1px solid #93c5fd }
      .b-ns  { color:#9ca3af; font-style:italic; font-weight:400; font-size:8.5px }
      .p-an td, td.p-an { background:#fff5f5 }
      .p-to td, td.p-to { background:#f0fff4 }
      .p-li td, td.p-li { background:#eff6ff }

      /* ── Print ── */
      .print-hdr { display:none }
      @media print {
        @page { size: A4 landscape; margin: 8mm 10mm }
        body { background:#fff; font-size:8px }
        .topbar, .legend, .print-btn { display:none }
        .print-hdr { display:block; text-align:center; margin-bottom:8px; padding-bottom:6px; border-bottom:2px solid var(--navy) }
        .print-hdr h1 { font-family:'Playfair Display',Georgia,serif; font-size:14px; font-weight:700; color:var(--navy) }
        .print-hdr p  { font-size:9px; color:var(--muted); margin-top:2px }
        .content { padding:0; max-width:none }
        .day { box-shadow:none; border-radius:0; border:1px solid #bbb; margin-bottom:7px }
        .day-hdr { padding:5px 8px }
        .day-name { font-size:9.5px }
        .per { padding:4px 8px 6px }
        table { font-size:7px }
        thead tr.niv-row th { font-size:8px; padding:2px 3px }
        thead tr.col-row th { font-size:6.5px; padding:1px 2px }
        tbody td { padding:1px 2px }
        .badge { font-size:6.5px; padding:0 3px }
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
    <p>Collège des Hayeffes &nbsp;·&nbsp; Juin 2026</p>
  </div>
  <div class="topbar-right">
    <div class="legend">
      <span class="leg"><span class="leg-dot" style="background:#fde8e8;border:1px solid #fca5a5"></span>Annulé</span>
      <span class="leg"><span class="leg-dot" style="background:#d1fae5;border:1px solid #6ee7b7"></span>Tous les élèves</span>
      <span class="leg"><span class="leg-dot" style="background:#dbeafe;border:1px solid #93c5fd"></span>Liste nominative</span>
      <span class="leg"><span class="leg-dot" style="background:#f0ede6;border:1px solid #d6d2c8"></span>Non renseigné</span>
    </div>
    <button class="print-btn" onclick="window.print()">Imprimer / PDF</button>
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

        html += `<div class="per"><div class="per-label">${periode}</div>
<table>
<thead>
<tr class="niv-row"><th class="tc"></th>`
        NIVEAUX.forEach((_, i) => {
          html += `<th colspan="4" style="background:${NIV_COLORS[i]}">${NIVEAU_LABELS[i]}</th>`
        })
        html += `</tr>
<tr class="col-row"><th class="tc">Pér.</th>`
        NIVEAUX.forEach(() => {
          html += `<th>Matière</th><th>Classe</th><th>Prof</th><th>Élèves</th>`
        })
        html += `</tr></thead><tbody>`

        for (let i = 0; i < maxRows; i++) {
          html += `<tr><td class="tc">${i === 0 ? periode : ''}</td>`
          NIVEAUX.forEach(n => {
            const ex = byNiveau[n][i]
            if (!ex) { html += `<td class="te"></td><td class="te"></td><td class="te"></td><td class="te"></td>`; return }
            html += `<td class="tm">${ex.matiere}</td><td class="tg">${ex.groupe}</td><td class="tp">${ex.profCode}</td>${partBadge(ex)}`
          })
          html += `</tr>`
        }
        html += `</tbody></table></div>`
      }
      html += `</div>`
    }

    html += `</div></body></html>`
    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
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
