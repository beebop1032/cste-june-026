import { requireAdmin } from '@/lib/auth'
import { listFiles, read, writeFileSafe } from '@/lib/storage'
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
        if (!result) {
          writeReadTest = `get() a retourné null (404?) pour url=${blob.url}`
        } else {
          const buf = await result.stream.arrayBuffer()
          const parsed = JSON.parse(Buffer.from(buf).toString('utf8'))
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
