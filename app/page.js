import { checkCode } from '@/actions/auth'

export default function HomePage() {
  return (
    <main style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 32,
      padding: 24,
    }}>
      <img
        src="http://cste.be/msg/wp-content/uploads/2021/05/Logo_couleur_CollegeEnBlanc.png"
        alt="Logo école des Hayeffes"
        style={{ maxWidth: 240, height: 'auto' }}
      />
      <h1 style={{ fontSize: 22, margin: 0, textAlign: 'center', color: '#1a1a2e' }}>
        Examens juin 2026
      </h1>
      <form action={checkCode} style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', maxWidth: 320 }}>
        <input
          name="code"
          type="password"
          placeholder="Code d'accès"
          required
          autoComplete="off"
          style={{
            padding: '12px 16px',
            fontSize: 18,
            border: '2px solid #ccc',
            borderRadius: 8,
            outline: 'none',
            textAlign: 'center',
            letterSpacing: 2,
          }}
        />
        <button
          type="submit"
          style={{
            padding: '12px 16px',
            fontSize: 16,
            background: '#1a1a2e',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
          }}
        >
          Accéder
        </button>
      </form>
    </main>
  )
}
