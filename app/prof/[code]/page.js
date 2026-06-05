import { requireProf } from '@/lib/auth'
import { getProfStatus } from '@/actions/prof'
import { read } from '@/lib/storage'
import exams from '@/lib/exams.json'
import ProfForm from './ProfForm'

function normaliseStatuts(raw) {
  if (!raw) return {}
  if (raw.statuts) return raw.statuts
  return Object.fromEntries((raw.locked ?? []).map(id => [id, 'locked']))
}

export default async function ProfPage({ params }) {
  const { code } = await params
  await requireProf()

  const { dejaRempli } = await getProfStatus(code)
  const statuts = normaliseStatuts(await read('admin-locks.json'))
  const profExams = exams.filter(e => e.profCode === code)

  if (profExams.length === 0) {
    return (
      <main style={{ maxWidth: 600, margin: '0 auto', padding: '32px 16px', textAlign: 'center' }}>
        <div className="card" style={{ padding: '40px 24px' }}>
          <p style={{ margin: '0 0 16px', color: 'var(--fg-muted)', fontSize: 15 }}>
            Aucun examen trouvé pour le code <strong>{code}</strong>.
          </p>
          <a href="/prof" className="btn btn-secondary btn-sm">← Retour</a>
        </div>
      </main>
    )
  }

  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '24px 16px 48px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
        <a href="/prof" className="btn btn-ghost btn-sm" style={{ padding: '6px 10px' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          Retour
        </a>
        <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: 'var(--fg)' }}>
          Prof : <span style={{ fontFamily: 'monospace', color: 'var(--primary)' }}>{code}</span>
        </h1>
      </div>
      <p style={{ color: 'var(--fg-muted)', marginBottom: 24, fontSize: 13, marginLeft: 2 }}>
        Indiquez le statut de chaque examen. Vous devez renseigner tous les examens avant de pouvoir envoyer.
      </p>
      <ProfForm
        profCode={code}
        examens={profExams}
        statuts={statuts}
        dejaRempli={dejaRempli}
      />
    </main>
  )
}
