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
  const format = searchParams.get('format') ?? 'csv'

  const files = await listFiles('prof-')
  const currentFiles = files.filter(f => /^prof-[A-Z]+\.json$/.test(f))

  const rows = []
  for (const f of currentFiles) {
    const prof = await read(f)
    if (!prof) continue
    for (const ex of prof.examens ?? []) {
      const meta = exams.find(e => e.id === ex.id)
      if (!meta || ex.eleves.length === 0) continue
      for (const el of ex.eleves) {
        rows.push({
          prof: prof.profCode,
          jour: meta.jour,
          periode: meta.periode,
          niveau: meta.niveau,
          groupe: meta.groupe,
          matiere: meta.matiere,
          local: meta.local,
          nom: el.nom,
          prenom: el.prenom,
          surveilleParTitulaire: ex.surveilleParTitulaire ? 'Oui' : 'Non',
        })
      }
    }
  }

  if (format === 'xlsx') {
    const XLSX = (await import('xlsx')).default
    const wsData = [
      ['Prof', 'Jour', 'Période', 'Niveau', 'Groupe', 'Matière', 'Local', 'Nom', 'Prénom', 'Surveillé par titulaire'],
      ...rows.map(r => [r.prof, r.jour, r.periode, r.niveau, r.groupe, r.matiere, r.local, r.nom, r.prenom, r.surveilleParTitulaire])
    ]
    const ws = XLSX.utils.aoa_to_sheet(wsData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Élèves')
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    return new Response(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="examens-juin2026.xlsx"',
      }
    })
  }

  // CSV with UTF-8 BOM for Excel compatibility
  const COLS = ['prof', 'jour', 'periode', 'niveau', 'groupe', 'matiere', 'local', 'nom', 'prenom', 'surveilleParTitulaire']
  const header = ['Prof', 'Jour', 'Période', 'Niveau', 'Groupe', 'Matière', 'Local', 'Nom', 'Prénom', 'Surveillé par titulaire'].join(';')
  const csvRows = rows.map(r => COLS.map(k => `"${String(r[k] ?? '').replace(/"/g, '""')}"`).join(';'))
  const csv = '﻿' + [header, ...csvRows].join('\r\n')

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="examens-juin2026.csv"',
    }
  })
}
