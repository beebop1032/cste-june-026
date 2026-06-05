'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth'
import { read, write, listFiles, deleteFile } from '@/lib/storage'
import exams from '@/lib/exams.json'

function normalise(raw) {
  if (!raw) return { groupeStatuts: {}, examStatuts: {} }
  return {
    groupeStatuts: raw.groupeStatuts ?? {},
    examStatuts:   raw.examStatuts   ?? {},
  }
}

async function save(groupeStatuts, examStatuts) {
  await write('admin-locks.json', { groupeStatuts, examStatuts, updatedAt: new Date().toISOString() })
}

// ── Full-state save (no read, eliminates race condition) ─────────────────────

export async function saveFullStateSilent(groupeStatuts, examStatuts) {
  await requireAdmin()
  if (!groupeStatuts || typeof groupeStatuts !== 'object') return { error: 'Invalide' }
  if (!examStatuts   || typeof examStatuts   !== 'object') return { error: 'Invalide' }
  try {
    await write('admin-locks.json', { groupeStatuts, examStatuts, updatedAt: new Date().toISOString() })
    revalidatePath('/admin')
    revalidatePath('/prof', 'layout')
    return { ok: true }
  } catch (err) {
    console.error(err)
    return { error: 'Erreur' }
  }
}

// ── Groupe ──────────────────────────────────────────────────────────────────

export async function setGroupeStatut(formData) {
  await requireAdmin()
  const groupe = formData.get('groupe')
  const statut = formData.get('statut')
  if (!groupe || !['open', 'annule', 'maintenu'].includes(statut)) return
  const current = normalise(await read('admin-locks.json'))
  const groupeStatuts = { ...current.groupeStatuts }
  const examStatuts   = { ...current.examStatuts }
  if (statut === 'open') delete groupeStatuts[groupe]
  else groupeStatuts[groupe] = statut
  // Clear per-exam overrides for this groupe
  for (const ex of exams.filter(e => e.groupe === groupe)) delete examStatuts[ex.id]
  try { await save(groupeStatuts, examStatuts) } catch (err) { console.error(err) }
  redirect('/admin?tab=verrous&vue=classe&ok=1')
}

export async function setGroupeStatutSilent(groupe, statut) {
  await requireAdmin()
  if (!groupe || !['open', 'annule', 'maintenu'].includes(statut)) return { error: 'Invalide' }
  const current = normalise(await read('admin-locks.json'))
  const groupeStatuts = { ...current.groupeStatuts }
  const examStatuts   = { ...current.examStatuts }
  if (statut === 'open') delete groupeStatuts[groupe]
  else groupeStatuts[groupe] = statut
  for (const ex of exams.filter(e => e.groupe === groupe)) delete examStatuts[ex.id]
  try { await save(groupeStatuts, examStatuts); return { ok: true } }
  catch (err) { console.error(err); return { error: 'Erreur' } }
}

// ── Niveau ──────────────────────────────────────────────────────────────────

export async function setNiveauStatut(formData) {
  await requireAdmin()
  const niveau = formData.get('niveau')
  const statut = formData.get('statut')
  if (!niveau || !['open', 'annule', 'maintenu'].includes(statut)) return
  const current = normalise(await read('admin-locks.json'))
  const groupeStatuts = { ...current.groupeStatuts }
  const examStatuts   = { ...current.examStatuts }
  const niveauExams   = exams.filter(e => e.niveau === niveau)
  for (const g of [...new Set(niveauExams.map(e => e.groupe))]) {
    if (statut === 'open') delete groupeStatuts[g]
    else groupeStatuts[g] = statut
  }
  for (const ex of niveauExams) delete examStatuts[ex.id]
  try { await save(groupeStatuts, examStatuts) } catch (err) { console.error(err) }
  redirect('/admin?tab=verrous&ok=1')
}

export async function setNiveauStatutSilent(niveau, statut) {
  await requireAdmin()
  if (!niveau || !['open', 'annule', 'maintenu'].includes(statut)) return { error: 'Invalide' }
  const current = normalise(await read('admin-locks.json'))
  const groupeStatuts = { ...current.groupeStatuts }
  const examStatuts   = { ...current.examStatuts }
  const niveauExams   = exams.filter(e => e.niveau === niveau)
  for (const g of [...new Set(niveauExams.map(e => e.groupe))]) {
    if (statut === 'open') delete groupeStatuts[g]
    else groupeStatuts[g] = statut
  }
  for (const ex of niveauExams) delete examStatuts[ex.id]
  try { await save(groupeStatuts, examStatuts); return { ok: true } }
  catch (err) { console.error(err); return { error: 'Erreur' } }
}

// ── Exam individuel ──────────────────────────────────────────────────────────

export async function setExamStatutSilent(examId, statut) {
  await requireAdmin()
  if (!examId || !['open', 'annule', 'maintenu'].includes(statut)) return { error: 'Invalide' }
  const current = normalise(await read('admin-locks.json'))
  const examStatuts = { ...current.examStatuts }
  if (statut === 'open') delete examStatuts[examId]
  else examStatuts[examId] = statut
  try { await save(current.groupeStatuts, examStatuts); return { ok: true } }
  catch (err) { console.error(err); return { error: 'Erreur' } }
}

// ── Misc ─────────────────────────────────────────────────────────────────────

export async function resetAllData() {
  await requireAdmin()
  const files = await listFiles('prof-')
  await Promise.all(files.map(f => deleteFile(f)))
  try { await save({}, {}) } catch (err) { console.error(err) }
  revalidatePath('/admin', 'layout')
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
