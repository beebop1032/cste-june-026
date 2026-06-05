import { cookies } from 'next/headers'
import { makeToken } from '@/lib/auth'
import { listFiles, read } from '@/lib/storage'
import exams from '@/lib/exams.json'

export async function GET(request) {
  const jar = await cookies()
  const token = jar.get('sess_admin')?.value
  const expected = makeToken('admin', process.env.ADMIN_KEY)
  if (token !== expected) {
    return new Response('Non autorisé', { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const format  = searchParams.get('format') ?? 'csv'
  const profFilter   = searchParams.get('prof')   ?? null
  const groupeFilter = searchParams.get('groupe') ?? null
  const niveauFilter = searchParams.get('niveau') ?? null

  const files = await listFiles('prof-')
  const currentFiles = files.filter(f => /^prof-[A-Z]+\.json$/.test(f))

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

      if (ex.statut === 'aucun') {
        rows.push({ ...base, nom: '', prenom: '', participation: 'Aucun élève' })
      } else if (ex.statut === 'tous') {
        rows.push({ ...base, nom: '', prenom: '', participation: 'Tous les élèves' })
      } else if (ex.statut === 'maintenu') {
        rows.push({ ...base, nom: '', prenom: '', participation: 'Examen maintenu' })
      } else {
        for (const el of ex.eleves ?? []) {
          rows.push({ ...base, nom: el.nom, prenom: el.prenom, participation: 'Liste nominative' })
        }
      }
    }
  }

  const suffix = profFilter ? `-${profFilter}` : groupeFilter ? `-${groupeFilter}` : niveauFilter ? `-${niveauFilter}` : ''
  const filename = `examens-juin2026${suffix}`

  const COLS = ['prof','jour','periode','niveau','groupe','matiere','local','nom','prenom','participation','surveilleParTitulaire']
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
  const header = HEADERS.join(';')
  const csvRows = rows.map(r => COLS.map(k => `"${String(r[k] ?? '').replace(/"/g, '""')}"`).join(';'))
  const csv = '﻿' + [header, ...csvRows].join('\r\n')

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}.csv"`,
    }
  })
}
