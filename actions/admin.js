'use server'
import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/auth'
import { read, writeFileSafe, listFiles } from '@/lib/storage'
import exams from '@/lib/exams.json'

// Migrate old { locked: [...] } format to { statuts: { id: 'locked' } }
function normalise(raw) {
  if (!raw) return { statuts: {} }
  if (raw.statuts) return raw
  const locked = raw.locked ?? []
  return { statuts: Object.fromEntries(locked.map(id => [id, 'locked'])) }
}

export async function setExamStatut(formData) {
  await requireAdmin()
  const examId = formData.get('examId')
  const statut = formData.get('statut') // 'open' | 'locked' | 'annule' | 'supprime'
  const current = normalise(await read('admin-locks.json'))
  const statuts = { ...current.statuts }
  if (statut === 'open') delete statuts[examId]
  else statuts[examId] = statut
  try {
    await writeFileSafe('admin-locks.json', { statuts, updatedAt: new Date().toISOString() })
  } catch (err) {
    console.error('setExamStatut write failed:', err)
  }
  redirect('/admin?tab=verrous&ok=1')
}

export async function setNiveauStatut(formData) {
  await requireAdmin()
  const niveau = formData.get('niveau')
  const statut = formData.get('statut') // 'open' | 'locked' | 'annule' | 'supprime'
  const current = normalise(await read('admin-locks.json'))
  const statuts = { ...current.statuts }
  for (const ex of exams.filter(e => e.niveau === niveau)) {
    if (statut === 'open') delete statuts[ex.id]
    else statuts[ex.id] = statut
  }
  try {
    await writeFileSafe('admin-locks.json', { statuts, updatedAt: new Date().toISOString() })
  } catch (err) {
    console.error('setNiveauStatut write failed:', err)
  }
  redirect('/admin?tab=verrous&ok=1')
}

export async function getAllResponses() {
  await requireAdmin()
  const files = await listFiles('prof-')
  const currentFiles = files.filter(f => /^prof-[^.]+\.json$/.test(f) && !/-v\d+\.json$/.test(f))
  const results = {}
  for (const f of currentFiles) {
    const data = await read(f)
    if (data) results[data.profCode] = data
  }
  return results
}

export async function getLocksData() {
  await requireAdmin()
  return normalise(await read('admin-locks.json'))
}
