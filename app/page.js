'use client'
import { useActionState, useState } from 'react'
import { checkCode } from '@/actions/auth'

const EyeOpen = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
  </svg>
)
const EyeClosed = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
)

export default function HomePage() {
  const [state, action, pending] = useActionState(checkCode, null)
  const [visible, setVisible] = useState(false)

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

      {/* Card container */}
      <div style={{ width: '100%', maxWidth: 380, display: 'flex', flexDirection: 'column', gap: 0 }}>

        {/* Logo + school name */}
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
            padding: '16px 32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid rgba(255,255,255,.14)',
          }}>
            <img
              src="/logo.png"
              alt="Logo Collège des Hayeffes"
              style={{ height: 'auto', maxWidth: 220, width: 220, display: 'block', filter: 'brightness(0) invert(1)' }}
            />
          </div>
          <div style={{ textAlign: 'center' }}>
            <h1 style={{ fontSize: 17, fontWeight: 600, margin: '0 0 3px', color: '#fff', letterSpacing: '-.2px' }}>
              Examens juin 2026
            </h1>
            <p style={{ margin: 0, fontSize: 12.5, color: 'rgba(255,255,255,.5)' }}>
              Collège des Hayeffes
            </p>
          </div>
        </div>

        {/* Form card */}
        <div style={{
          background: '#fff',
          borderRadius: '0 0 12px 12px',
          padding: '24px 28px 28px',
          boxShadow: '0 20px 60px rgba(0,0,0,.35)',
        }}>
          <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label htmlFor="code" style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--fg-muted)', marginBottom: 7, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                Code d'accès
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  id="code"
                  name="code"
                  type={visible ? 'text' : 'password'}
                  placeholder="········"
                  required
                  autoComplete="off"
                  autoFocus
                  className={`input${state?.error ? ' error' : ''}`}
                  style={{ paddingRight: 44, textAlign: 'center', letterSpacing: visible ? 2 : 5, fontSize: 18, fontWeight: 600 }}
                />
                <button
                  type="button"
                  className="btn-icon"
                  onClick={() => setVisible(v => !v)}
                  style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-subtle)' }}
                  aria-label={visible ? 'Masquer' : 'Afficher'}
                >
                  {visible ? <EyeOpen /> : <EyeClosed />}
                </button>
              </div>
            </div>

            {state?.error && (
              <div className="alert alert-error" role="alert" style={{ fontSize: 13 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                {state.error}
              </div>
            )}

            <button
              type="submit"
              disabled={pending}
              className="btn btn-primary"
              style={{ width: '100%', padding: '11px', fontSize: 14, fontWeight: 600, marginTop: 2 }}
            >
              {pending ? (
                <>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 0.8s linear infinite' }}>
                    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                  </svg>
                  Vérification…
                </>
              ) : 'Accéder'}
            </button>
          </form>
        </div>
      </div>
    </main>
  )
}
