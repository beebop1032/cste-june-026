'use server'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth'
import { read, writeFileSafe, listFiles } from '@/lib/storage'
import exams from '@/lib/exams.json'

export async function toggleLock(formData) {
  await requireAdmin()
  const examId = formData.get('examId')
  const current = (await read('admin-locks.json')) ?? { locked: [] }
  const set = new Set(current.locked)
  if (set.has(examId)) set.delete(examId)
  else set.add(examId)
  try {
    await writeFileSafe('admin-locks.json', { locked: [...set], updatedAt: new Date().toISOString() })
  } catch (err) {
    console.error('toggleLock write failed:', err)
  }
  revalidatePath('/admin')
}

export async function lockByNiveau(formData) {
  await requireAdmin()
  const niveau = formData.get('niveau')
  const current = (await read('admin-locks.json')) ?? { locked: [] }
  const set = new Set(current.locked)
  exams.filter(e => e.niveau === niveau).forEach(e => set.add(e.id))
  try {
    await writeFileSafe('admin-locks.json', { locked: [...set], updatedAt: new Date().toISOString() })
  } catch (err) {
    console.error('lockByNiveau write failed:', err)
  }
  revalidatePath('/admin')
}

export async function unlockByNiveau(formData) {
  await requireAdmin()
  const niveau = formData.get('niveau')
  const current = (await read('admin-locks.json')) ?? { locked: [] }
  const niveauIds = new Set(exams.filter(e => e.niveau === niveau).map(e => e.id))
  const filtered = current.locked.filter(id => !niveauIds.has(id))
  try {
    await writeFileSafe('admin-locks.json', { locked: filtered, updatedAt: new Date().toISOString() })
  } catch (err) {
    console.error('unlockByNiveau write failed:', err)
  }
  revalidatePath('/admin')
}

export async function getAllResponses() {
  await requireAdmin()
  const files = await listFiles('prof-')
  const currentFiles = files.filter(f => /^prof-[A-Z]+\.json$/.test(f))
  const results = {}
  for (const f of currentFiles) {
    const data = await read(f)
    if (data) results[data.profCode] = data
  }
  return results
}

export async function getLocksData() {
  await requireAdmin()
  return (await read('admin-locks.json')) ?? { locked: [] }
}
