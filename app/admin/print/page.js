import { requireAdmin } from '@/lib/auth'
import { getAllResponses, getLocksData } from '@/actions/admin'
import exams from '@/lib/exams.json'
import PrintViews from './PrintViews'

export default async function PrintPage() {
  await requireAdmin()

  const [responses, locksData] = await Promise.all([getAllResponses(), getLocksData()])
  const groupeStatuts = locksData.groupeStatuts ?? {}
  const examStatuts   = locksData.examStatuts   ?? {}

  // Build participation map: examId → { type, eleves, nEleves, surveilleParTitulaire }
  const partData = {}

  for (const ex of exams) {
    const s = examStatuts[ex.id] ?? groupeStatuts[ex.groupe]
    if (s === 'annule')   partData[ex.id] = { type: 'annule', eleves: [], nEleves: 0,    surveilleParTitulaire: false }
    if (s === 'maintenu') partData[ex.id] = { type: 'tous',   eleves: [], nEleves: null, surveilleParTitulaire: false }
  }

  for (const prof of Object.values(responses)) {
    for (const ex of prof.examens ?? []) {
      if (partData[ex.id]) continue
      const statut = ex.statut ?? (ex.maintenu === true ? 'maintenu' : null)
      const eleves = (ex.eleves ?? []).filter(e => e.nom || e.prenom)
      if (statut === 'aucun') {
        partData[ex.id] = { type: 'annule', eleves: [], nEleves: 0, surveilleParTitulaire: ex.surveilleParTitulaire ?? false }
      } else if (statut === 'tous' || statut === 'maintenu') {
        partData[ex.id] = { type: 'tous', eleves: [], nEleves: null, surveilleParTitulaire: ex.surveilleParTitulaire ?? false }
      } else if (eleves.length > 0) {
        partData[ex.id] = { type: 'liste', eleves, nEleves: eleves.length, surveilleParTitulaire: ex.surveilleParTitulaire ?? false }
      }
    }
  }

  const allGroupes = [...new Set(exams.map(e => e.groupe))].sort()
  const allProfs   = [...new Set(exams.map(e => e.profCode))].sort()

  return <PrintViews exams={exams} partData={partData} allGroupes={allGroupes} allProfs={allProfs} />
}
