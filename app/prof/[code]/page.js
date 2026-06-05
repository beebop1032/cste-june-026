import { requireProf } from '@/lib/auth'
import { getProfStatus } from '@/actions/prof'
import { read } from '@/lib/storage'
import exams from '@/lib/exams.json'
import ProfForm from './ProfForm'

export default async function ProfPage({ params }) {
  const { code } = await params
  await requireProf()

  const { dejaRempli } = await getProfStatus(code)

  const locksData = await read('admin-locks.json')
  const locked = new Set(locksData?.locked ?? [])

  const profExams = exams.filter(e => e.profCode === code)

  if (profExams.length === 0) {
    return (
      <main style={{ maxWidth: 600, margin: '0 auto', padding: 24, textAlign: 'center' }}>
        <p style={{ color: '#666' }}>Aucun examen trouvé pour le code « {code} ».</p>
        <a href="/prof" style={{ color: '#1a1a2e' }}>← Retour</a>
      </main>
    )
  }

  return (
    <main style={{ maxWidth: 800, margin: '0 auto', padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8 }}>
        <a href="/prof" style={{ color: '#666', textDecoration: 'none', fontSize: 14 }}>← Retour</a>
        <h1 style={{ fontSize: 20, margin: 0 }}>Prof : {code}</h1>
      </div>
      <p style={{ color: '#666', marginBottom: 24, fontSize: 14 }}>
        Indiquez les élèves présents pour chaque examen. Zéro élève = examen annulé.
      </p>
      <ProfForm
        profCode={code}
        examens={profExams}
        locked={[...locked]}
        dejaRempli={dejaRempli}
      />
    </main>
  )
}
