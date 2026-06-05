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

  // Load admin groupe-level statuts (these override prof submissions)
  const locksRaw = await read('admin-locks.json')
  const groupeStatuts = locksRaw?.groupeStatuts ?? {}

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
      const gs = groupeStatuts[ex.groupe]
      if (gs === 'annule')   map.set(ex.id, { label: 'Annulé', type: 'annule' })
      else if (gs === 'maintenu') map.set(ex.id, { label: 'Tous', type: 'tous' })
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

    function partCell(ex) {
      const p = partMap.get(ex.id)
      if (!p) return `<td class="ns">?</td>`
      const cls = p.type === 'annule' ? 'an' : p.type === 'tous' ? 'to' : 'li'
      return `<td class="${cls}">${p.label}</td>`
    }

    let html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8">
<title>Surveillance examens juin 2026</title>
<style>
  *{box-sizing:border-box}
  body{font-family:Arial,sans-serif;font-size:10px;margin:10mm}
  h1{font-size:14px;text-align:center;margin:0 0 8px}
  .print-btn{display:block;margin:8px auto 16px;padding:6px 18px;font-size:13px;cursor:pointer;border:1px solid #888;border-radius:4px;background:#f0f0f0}
  .day{margin-bottom:14px;page-break-inside:avoid}
  .day-hdr{font-size:11px;font-weight:bold;background:#E2E8F0;padding:3px 6px;margin-bottom:3px}
  .per-hdr{font-size:10px;font-weight:bold;color:#555;margin:3px 0 1px}
  table{width:100%;border-collapse:collapse;margin-bottom:6px;font-size:9px}
  th,td{border:1px solid #CBD5E0;padding:1px 3px;text-align:center;white-space:nowrap}
  th{background:#F7FAFC;font-size:9px}
  .niv{background:#EDF2F7;font-weight:bold}
  .an{background:#FED7D7}
  .to{background:#C6F6D5}
  .li{background:#BEE3F8}
  .ns{color:#aaa}
  @media print{
    .print-btn{display:none}
    .day{page-break-inside:avoid}
    body{margin:5mm}
  }
</style></head><body>
<button class="print-btn" onclick="window.print()">🖨️ Imprimer / Enregistrer en PDF</button>
<h1>Surveillance examens — juin 2026</h1>
`
    for (const jour of JOURS) {
      html += `<div class="day"><div class="day-hdr">${labelJour(jour)} &nbsp;&nbsp; Réservistes P1 : _____ &nbsp; P2 : _____</div>`

      for (const periode of ['P1', 'P2']) {
        const bloc = examsForBloc(jour, periode)
        if (!bloc.length) continue
        const { byNiveau, maxRows } = buildBlocRows(bloc)

        html += `<div class="per-hdr">${periode}</div><table><thead>`
        html += `<tr><th></th>`
        NIVEAUX.forEach((_, i) => {
          html += `<th class="niv" colspan="4">${NIVEAU_LABELS[i]}</th>`
        })
        html += `</tr><tr><th></th>`
        for (let i = 0; i < NIVEAUX.length; i++) {
          html += `<th>Mat.</th><th>Gr.</th><th>Prof</th><th>Él.</th>`
        }
        html += `</tr></thead><tbody>`

        for (let i = 0; i < maxRows; i++) {
          html += `<tr><td>${i === 0 ? periode : ''}</td>`
          NIVEAUX.forEach(n => {
            const ex = byNiveau[n][i]
            if (!ex) { html += `<td></td><td></td><td></td><td></td>`; return }
            html += `<td>${ex.matiere}</td><td>${ex.groupe}</td><td>${ex.profCode}</td>${partCell(ex)}`
          })
          html += `</tr>`
        }
        html += `</tbody></table>`
      }
      html += `</div>`
    }

    html += `</body></html>`
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
    const gs = groupeStatuts[ex.groupe]
    if (!gs) continue // open → handled by prof submission
    if (groupeFilter && ex.groupe !== groupeFilter) continue
    if (niveauFilter && ex.niveau !== niveauFilter) continue
    if (profFilter && ex.profCode !== profFilter) continue
    coveredByAdmin.add(ex.id)
    const base = {
      prof: ex.profCode, jour: ex.jour, periode: ex.periode,
      niveau: ex.niveau, groupe: ex.groupe, matiere: ex.matiere, local: ex.local,
      surveilleParTitulaire: 'Non',
    }
    if (gs === 'annule') {
      rows.push({ ...base, nom: '', prenom: '', participation: "Annulé par l'administration" })
    } else if (gs === 'maintenu') {
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
