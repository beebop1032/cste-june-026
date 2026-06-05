import { requireProf } from '@/lib/auth'
import { redirect } from 'next/navigation'
import exams from '@/lib/exams.json'

const PROF_CODES = [...new Set(exams.map(e => e.profCode))].sort()

export default async function ProfSelectPage() {
  await requireProf()

  async function selectProf(formData) {
    'use server'
    const code = formData.get('profCode')
    redirect(`/prof/${code}`)
  }

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
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 4px', color: 'var(--fg)' }}>
              Sélectionnez votre code
            </h1>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--fg-muted)' }}>
              Examens juin 2026 — Collège des Hayeffes
            </p>
          </div>
        </div>

        <div className="card" style={{ padding: '24px', boxShadow: 'var(--shadow)' }}>
          <form action={selectProf} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label htmlFor="profCode" style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--fg)', marginBottom: 6 }}>
                Code professeur
              </label>
              <select name="profCode" id="profCode" required defaultValue="" className="select">
                <option value="" disabled>— Sélectionnez votre code —</option>
                {PROF_CODES.map(code => (
                  <option key={code} value={code}>{code}</option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '12px', fontSize: 15 }}>
              Continuer
            </button>
          </form>
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
