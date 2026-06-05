import { createHmac } from 'crypto'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export function makeToken(role, secret) {
  return createHmac('sha256', secret).update(role).digest('hex')
}

export async function setSessionCookie(role) {
  const secret = role === 'admin' ? process.env.ADMIN_KEY : process.env.ACCESS_CODE
  const jar = await cookies()
  jar.set(`sess_${role}`, makeToken(role, secret), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 8 * 3600,
    path: '/',
    sameSite: 'lax',
  })
}

export async function verifySession(role) {
  const secret = role === 'admin' ? process.env.ADMIN_KEY : process.env.ACCESS_CODE
  if (!secret) return false
  const jar = await cookies()
  const token = jar.get(`sess_${role}`)?.value
  return token === makeToken(role, secret)
}

export async function requireProf() {
  if (!(await verifySession('prof'))) redirect('/')
}

export async function requireAdmin() {
  if (!(await verifySession('admin'))) redirect('/')
}
