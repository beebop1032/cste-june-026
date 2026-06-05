'use server'
import { redirect } from 'next/navigation'
import { setSessionCookie } from '@/lib/auth'

export async function checkCode(formData) {
  const code = formData.get('code')?.trim()
  if (code === process.env.ADMIN_KEY) {
    await setSessionCookie('admin')
    redirect('/admin')
  }
  if (code === process.env.ACCESS_CODE) {
    await setSessionCookie('prof')
    redirect('/prof')
  }
  return { error: 'Code incorrect' }
}
