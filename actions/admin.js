'use server'
import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/auth'
import { read, writeFileSafe, listFiles, deleteFile } from '@/lib/storage'
import exams from '@/lib/exams.json'

// Normalise to new { groupeStatuts: { groupe: 'annule'|'maintenu' } } format
function normalise(raw) {
  if (!raw) return { groupeStatuts: {} }
  if (raw.groupeStatuts) return { groupeStatuts: raw.groupeStatuts }
  // Old per-exam format → drop (not migrable to per-groupe)
  return { groupeStatuts: {} }
}

export async function setGroupeStatut(formData) {
  await requireAdmin()
  const groupe = formData.get('groupe')
  const statut = formData.get('statut') // 'open' | 'annule' | 'maintenu'
  if (!groupe || !['open', 'annule', 'maintenu'].includes(statut)) return
  const current = normalise(await read('admin-locks.json'))
  const groupeStatuts = { ...current.groupeStatuts }
  if (statut === 'open') delete groupeStatuts[groupe]
  else groupeStatuts[groupe] = statut
  try {
    await writeFileSafe('admin-locks.json', { groupeStatuts, updatedAt: new Date().toISOString() })
  } catch (err) {
    console.error('setGroupeStatut write failed:', err)
  }
  redirect('/admin?tab=verrous&ok=1')
}

export async function setNiveauStatut(formData) {
  await requireAdmin()
  const niveau = formData.get('niveau')
  const statut = formData.get('statut')
  if (!niveau || !['open', 'annule', 'maintenu'].includes(statut)) return
  const current = normalise(await read('admin-locks.json'))
  const groupeStatuts = { ...current.groupeStatuts }
  const niveauGroupes = [...new Set(exams.filter(e => e.niveau === niveau).map(e => e.groupe))]
  for (const g of niveauGroupes) {
    if (statut === 'open') delete groupeStatuts[g]
    else groupeStatuts[g] = statut
  }
  try {
    await writeFileSafe('admin-locks.json', { groupeStatuts, updatedAt: new Date().toISOString() })
  } catch (err) {
    console.error('setNiveauStatut write failed:', err)
  }
  redirect('/admin?tab=verrous&ok=1')
}

export async function resetAllData() {
  await requireAdmin()
  const files = await listFiles('prof-')
  await Promise.all(files.map(f => deleteFile(f)))
  try {
    await writeFileSafe('admin-locks.json', { groupeStatuts: {}, updatedAt: new Date().toISOString() })
  } catch (err) {
    console.error('resetAllData write failed:', err)
  }
  redirect('/admin?tab=suivi')
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
