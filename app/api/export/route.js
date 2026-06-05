import { requireAdmin } from '@/lib/auth'
import { listFiles, read } from '@/lib/storage'
import exams from '@/lib/exams.json'

export async function GET(request) {
  await requireAdmin()

  const { searchParams } = new URL(request.url)
  const format       = searchParams.get('format')  ?? 'csv'
  const profFilter   = searchParams.get('prof')    ?? null
  const groupeFilter = searchParams.get('groupe')  ?? null
  const niveauFilter = searchParams.get('niveau')  ?? null

  // List all prof files — accept any code (letters, digits, hyphens)
  const allFiles    = await listFiles('prof-')
  const currentFiles = allFiles.filter(f => /^prof-[^.]+\.json$/.test(f) && !/-v\d+\.json$/.test(f))

  // Debug format: show raw storage state
  if (format === 'debug') {
    return Response.json({
      allFiles,
      currentFiles,
      useBlob: !!process.env.BLOB_READ_WRITE_TOKEN,
    })
  }

  const rows = []
  for (const f of currentFiles) {
    const prof = await read(f)
    if (!prof) continue
    if (profFilter && prof.profCode !== profFilter) continue

    for (const ex of prof.examens ?? []) {
      const meta = exams.find(e => e.id === ex.id)
      if (!meta) continue
      if (groupeFilter && meta.groupe !== groupeFilter) continue
      if (niveauFilter && meta.niveau !== niveauFilter) continue

      const base = {
        prof: prof.profCode,
        jour: meta.jour,
        periode: meta.periode,
        niveau: meta.niveau,
        groupe: meta.groupe,
        matiere: meta.matiere,
        local: meta.local,
        surveilleParTitulaire: ex.surveilleParTitulaire ? 'Oui' : 'Non',
      }

      // Determine effective statut — handle both old (maintenu bool) and new (statut string) formats
      const statut = ex.statut
        ?? (ex.maintenu === true ? 'maintenu' : null)

      if (statut === 'aucun') {
        // Exam cancelled — still export as one row so admin can see it
        rows.push({ ...base, nom: '', prenom: '', participation: 'Aucun élève' })
      } else if (statut === 'tous') {
        rows.push({ ...base, nom: '(tous les élèves)', prenom: '', participation: 'Tous les élèves' })
      } else if (statut === 'maintenu') {
        rows.push({ ...base, nom: '(examen maintenu)', prenom: '', participation: 'Examen maintenu' })
      } else {
        // Liste nominative (or old format with eleves)
        for (const el of ex.eleves ?? []) {
          if (!el.nom && !el.prenom) continue
          rows.push({ ...base, nom: el.nom, prenom: el.prenom, participation: 'Liste nominative' })
        }
      }
    }
  }

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

  // CSV — UTF-8 BOM for Excel compatibility
  const csvRows = rows.map(r => COLS.map(k => `"${String(r[k] ?? '').replace(/"/g, '""')}"`).join(';'))
  const csv = '﻿' + [HEADERS.join(';'), ...csvRows].join('\r\n')

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}.csv"`,
    }
  })
}
