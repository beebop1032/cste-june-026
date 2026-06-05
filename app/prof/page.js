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
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 24,
      padding: 24,
    }}>
      <h1 style={{ fontSize: 20, margin: 0 }}>Sélectionnez votre code prof</h1>
      <form action={selectProf} style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', maxWidth: 320 }}>
        <select
          name="profCode"
          required
          defaultValue=""
          style={{ padding: '10px 14px', fontSize: 16, border: '2px solid #ccc', borderRadius: 8 }}
        >
          <option value="" disabled>-- Votre code --</option>
          {PROF_CODES.map(code => (
            <option key={code} value={code}>{code}</option>
          ))}
        </select>
        <button
          type="submit"
          style={{ padding: '12px 16px', fontSize: 16, background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}
        >
          Continuer →
        </button>
      </form>
    </main>
  )
}
