export const dynamic = 'force-dynamic'

import { requireProf, verifySession } from '@/lib/auth'
import { getProfStatus } from '@/actions/prof'
import { read } from '@/lib/storage'
import exams from '@/lib/exams.json'
import ProfForm from './ProfForm'

export default async function ProfPage({ params }) {
  const { code } = await params
  await requireProf()
  const isAdmin = await verifySession('admin')

  const { dejaRempli } = await getProfStatus(code)
  const savedData  = dejaRempli ? await read(`prof-${code}.json`) : null
  const locksRaw = await read('admin-locks.json')
  const groupeStatuts = locksRaw?.groupeStatuts ?? {}
  const examStatuts   = locksRaw?.examStatuts   ?? {}
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
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '0 16px 48px' }}>
      {/* Header bar */}
      <div style={{ background: 'var(--primary)', margin: '0 -16px 24px', padding: '0 16px', height: 48, display: 'flex', alignItems: 'center', gap: 14 }}>
        <a href={isAdmin ? '/admin' : '/prof'} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'rgba(255,255,255,.55)', fontSize: 12, textDecoration: 'none', padding: '4px 8px', borderRadius: 5 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          {isAdmin ? 'Admin' : 'Retour'}
        </a>
        <img src="/logo.png" alt="Collège des Hayeffes" style={{ height: 38, width: 'auto', filter: 'brightness(0) invert(1)', flexShrink: 0 }} />
        <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,.2)' }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>
          Prof <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{code}</span>
        </span>
      </div>
      <p style={{ color: 'var(--fg-muted)', marginBottom: 20, fontSize: 13 }}>
        Indiquez le statut de chaque examen. Vous devez renseigner tous les examens avant de pouvoir envoyer.
      </p>
      <ProfForm
        profCode={code}
        examens={profExams}
        groupeStatuts={groupeStatuts}
        examStatuts={examStatuts}
        dejaRempli={dejaRempli}
        savedData={savedData}
        isAdmin={isAdmin}
      />
    </main>
  )
}
