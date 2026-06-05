import { Fira_Sans } from 'next/font/google'
import './globals.css'

const fira = Fira_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
})

export const metadata = {
  title: 'Examens juin 2026 — Les Hayeffes',
}

export default function RootLayout({ children }) {
  return (
    <html lang="fr" className={fira.className}>
      <body>{children}</body>
    </html>
  )
}
