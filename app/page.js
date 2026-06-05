import { verifySession } from '@/lib/auth'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import LoginForm from './LoginForm'

export default async function HomePage() {
  const [isAdmin, isProf] = await Promise.all([
    verifySession('admin'),
    verifySession('prof'),
  ])

  if (isAdmin) return <AdminChoice />

  if (isProf) {
    const jar = await cookies()
    const profDone = jar.get('prof_done')?.value
    if (profDone) redirect(`/prof/${profDone}?back=1`)
    redirect('/prof')
  }

  return <LoginForm />
}

function AdminChoice() {
  return (
    <main style={{
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 16px',
      background: 'linear-gradient(160deg, #0d1f3c 0%, #1E3A8A 52%, #7c2d00 100%)',
    }}>
      <div style={{ width: '100%', maxWidth: 400, display: 'flex', flexDirection: 'column', gap: 0 }}>

        {/* Header */}
        <div style={{
          background: 'rgba(255,255,255,.07)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255,255,255,.12)',
          borderRadius: '12px 12px 0 0',
          padding: '28px 28px 22px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 16,
        }}>
          <div style={{
            background: 'rgba(255,255,255,.10)',
            borderRadius: 12,
            padding: '14px 28px',
            border: '1px solid rgba(255,255,255,.14)',
          }}>
            <img
              src="/logo.png"
              alt="Collège des Hayeffes"
              style={{ height: 'auto', maxWidth: 200, width: 200, display: 'block', filter: 'brightness(0) invert(1)' }}
            />
          </div>
          <div style={{ textAlign: 'center' }}>
            <h1 style={{ fontSize: 17, fontWeight: 600, margin: '0 0 3px', color: '#fff', letterSpacing: '-.2px' }}>
              Examens juin 2026
            </h1>
            <p style={{ margin: 0, fontSize: 12.5, color: 'rgba(255,255,255,.5)' }}>
              Collège des Hayeffes — Admin
            </p>
          </div>
        </div>

        {/* Choice */}
        <div style={{
          background: '#fff',
          borderRadius: '0 0 12px 12px',
          padding: '24px 24px 28px',
          boxShadow: '0 20px 60px rgba(0,0,0,.35)',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}>
          <a href="/admin" style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: '14px 18px',
            borderRadius: 8,
            background: 'var(--primary)',
            color: '#fff',
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: 14,
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
              <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
            </svg>
            <div>
              <div>Panneau admin</div>
              <div style={{ fontSize: 11.5, fontWeight: 400, opacity: .75, marginTop: 1 }}>Suivi, horaires, statuts, exports</div>
            </div>
          </a>

          <a href="/prof" style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: '14px 18px',
            borderRadius: 8,
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            color: 'var(--fg)',
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: 14,
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            <div>
              <div>Vue professeur</div>
              <div style={{ fontSize: 11.5, fontWeight: 400, color: 'var(--fg-muted)', marginTop: 1 }}>Saisir les réponses d'un prof</div>
            </div>
          </a>
        </div>
      </div>
    </main>
  )
}
