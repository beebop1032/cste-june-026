'use server'
import { requireProf } from '@/lib/auth'
import { read, writeFileSafe } from '@/lib/storage'

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
    if (ex.maintenu !== undefined && typeof ex.maintenu !== 'boolean') return { error: 'Données invalides' }
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

  return { ok: true }
}
