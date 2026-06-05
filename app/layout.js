import { Fira_Sans, Fira_Code } from 'next/font/google'
import './globals.css'

const fira = Fira_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-body',
})

const firaCode = Fira_Code({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
  variable: '--font-code',
})

export const metadata = {
  title: 'Examens juin 2026 — Les Hayeffes',
}

export default function RootLayout({ children }) {
  return (
    <html lang="fr" className={`${fira.variable} ${firaCode.variable} ${fira.className}`}>
      <body>
        {children}
        <footer style={{ textAlign: 'center', padding: '20px 16px', fontSize: 12, color: 'var(--fg-muted)', borderTop: '1px solid var(--border)', marginTop: 40 }}>
          Made with <span style={{ color: '#E53E3E' }}>♥</span> by{' '}
          <a href="https://beebopcity.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: 500 }}>
            Beebopcity
          </a>
        </footer>
      </body>
    </html>
  )
}
