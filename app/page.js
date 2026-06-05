'use client'
import { useActionState, useState } from 'react'
import { checkCode } from '@/actions/auth'

const EyeOpen = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
)

const EyeClosed = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
      background: 'var(--bg)',
    }}>
      <div style={{
        width: '100%',
        maxWidth: 400,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 32,
      }}>
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div style={{
            background: 'var(--primary)',
            borderRadius: 16,
            padding: '20px 32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 20px rgba(30,58,138,.25)',
          }}>
            <img
              src="http://cste.be/msg/wp-content/uploads/2021/05/Logo_couleur_CollegeEnBlanc.png"
              alt="Logo école des Hayeffes"
              width={200}
              height={80}
              style={{ height: 'auto', maxWidth: 200, display: 'block' }}
            />
          </div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 4px', color: 'var(--fg)' }}>
              Examens juin 2026
            </h1>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--fg-muted)' }}>
              Collège des Hayeffes
            </p>
          </div>
        </div>

        <div className="card" style={{ width: '100%', padding: '28px 28px 24px', boxShadow: 'var(--shadow)' }}>
          <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label htmlFor="code" style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--fg)', marginBottom: 6 }}>
                Code d'accès
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  id="code"
                  name="code"
                  type={visible ? 'text' : 'password'}
                  placeholder="Entrez votre code"
                  required
                  autoComplete="off"
                  className={`input${state?.error ? ' error' : ''}`}
                  style={{ paddingRight: 44, textAlign: 'center', letterSpacing: visible ? 1 : 3, fontSize: 17 }}
                />
                <button
                  type="button"
                  className="btn-icon"
                  onClick={() => setVisible(v => !v)}
                  style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)' }}
                  aria-label={visible ? 'Masquer le code' : 'Afficher le code'}
                >
                  {visible ? <EyeOpen /> : <EyeClosed />}
                </button>
              </div>
            </div>

            {state?.error && (
              <div className="alert alert-error" role="alert">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                {state.error}
              </div>
            )}

            <button
              type="submit"
              disabled={pending}
              className="btn btn-primary"
              style={{ width: '100%', padding: '12px', fontSize: 15, marginTop: 4 }}
            >
              {pending ? (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 1s linear infinite' }}>
                    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                  </svg>
                  Vérification…
                </>
              ) : 'Accéder'}
            </button>
          </form>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </main>
  )
}
