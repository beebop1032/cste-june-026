import { requireProf } from '@/lib/auth'

export default async function ProfSelectPage() {
  await requireProf()

  return (
    <main style={{
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 16px',
      background: 'var(--bg)',
    }}>
      <div style={{ width: '100%', maxWidth: 400, display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <div style={{ background: 'var(--primary)', borderRadius: 10, padding: '12px 28px' }}>
            <img src="/logo.png" alt="Collège des Hayeffes" style={{ height: 44, width: 'auto', display: 'block', filter: 'brightness(0) invert(1)' }} />
          </div>
        </div>

        <div className="card" style={{ padding: '28px 24px', boxShadow: 'var(--shadow)', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 36 }}>🔒</div>
          <h1 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: 'var(--fg)' }}>
            Période de saisie terminée
          </h1>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--fg-muted)', lineHeight: 1.5 }}>
            La période de saisie des listes de présence est clôturée.<br />
            Merci pour votre participation.
          </p>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--fg-muted)' }}>
            Collège des Hayeffes · Examens juin 2026
          </p>
        </div>

        <p style={{ textAlign: 'center', margin: 0 }}>
          <a href="/" style={{ fontSize: 13, color: 'var(--fg-muted)', textDecoration: 'none' }}>
            ← Retour à l'accueil
          </a>
        </p>
      </div>
    </main>
  )
}
