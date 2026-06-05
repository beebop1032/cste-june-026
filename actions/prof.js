'use server'
import { requireProf } from '@/lib/auth'
import { read, writeFileSafe } from '@/lib/storage'
import { cookies } from 'next/headers'

export async function getProfStatus(profCode) {
  await requireProf()
  const data = await read(`prof-${profCode}.json`)
  return { dejaRempli: data !== null }
}

export async function submitProf(profCode, payload) {
  await requireProf()

  if (!Array.isArray(payload?.examens)) return { error: 'Données invalides' }
  for (const ex of payload.examens) {
    if (typeof ex.id !== 'string') return { error: 'Données invalides' }
    if (!Array.isArray(ex.eleves)) return { error: 'Données invalides' }
    const VALID_STATUTS = [null, 'aucun', 'tous', 'maintenu', 'liste', 'locked', 'annule', 'supprime']
    if (!VALID_STATUTS.includes(ex.statut ?? null)) return { error: 'Données invalides' }
    for (const el of ex.eleves) {
      if (typeof el.nom !== 'string' || typeof el.prenom !== 'string') return { error: 'Données invalides' }
    }
  }

  const existing = await read(`prof-${profCode}.json`)
  const version = existing ? (existing.version ?? 0) + 1 : 1

  try {
    await writeFileSafe(`prof-${profCode}.json`, {
      profCode,
      submittedAt: new Date().toISOString(),
      version,
      examens: payload.examens,
    })
  } catch (err) {
    console.error('writeFileSafe failed:', err)
    return { error: 'Erreur de sauvegarde. Veuillez réessayer.' }
  }

  const jar = await cookies()
  jar.set('prof_done', profCode, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 3600,
    path: '/',
    sameSite: 'lax',
  })
  return { ok: true }
}
