import { readFile, writeFile, mkdir, readdir, unlink } from 'fs/promises'
import path from 'path'

const DATA_DIR = process.env.DATA_DIR_OVERRIDE || '/tmp/horaires-data'
const USE_BLOB = !!process.env.BLOB_READ_WRITE_TOKEN

export async function read(name) {
  try {
    if (USE_BLOB) return await blobRead(name)
    return await localRead(name)
  } catch {
    return null
  }
}

export async function writeFileSafe(name, data) {
  const existing = await read(name)
  if (existing !== null) {
    const archiveName = name.replace('.json', `-v${Date.now()}.json`)
    await writeRaw(archiveName, existing)
  }
  await writeRaw(name, data)
}

export async function listFiles(prefix) {
  try {
    if (USE_BLOB) return await blobList(prefix)
    return await localList(prefix)
  } catch {
    return []
  }
}

export async function deleteFile(name) {
  try {
    if (USE_BLOB) return await blobDelete(name)
    await unlink(path.join(DATA_DIR, name))
  } catch {
    // ignore — file may not exist
  }
}

// ── Local fallback ──────────────────────────────────────────────────────────

async function localRead(name) {
  try {
    const content = await readFile(path.join(DATA_DIR, name), 'utf8')
    return JSON.parse(content)
  } catch {
    return null
  }
}

async function localWrite(name, data) {
  await mkdir(DATA_DIR, { recursive: true })
  await writeFile(path.join(DATA_DIR, name), JSON.stringify(data, null, 2), 'utf8')
}

async function localList(prefix) {
  try {
    const files = await readdir(DATA_DIR)
    return files.filter(f => f.startsWith(prefix))
  } catch {
    return []
  }
}

// ── Vercel Blob ─────────────────────────────────────────────────────────────

async function blobRead(name) {
  const { list } = await import('@vercel/blob')
  const { blobs } = await list({ prefix: name })
  const blob = blobs.find(b => b.pathname === name)
  if (!blob) return null
  // downloadUrl = URL signée temporaire, fonctionne avec les stores privés
  const res = await fetch(blob.downloadUrl, { cache: 'no-store' })
  if (!res.ok) return null
  return res.json()
}

async function blobWrite(name, data) {
  const { put } = await import('@vercel/blob')
  await put(name, JSON.stringify(data, null, 2), {
    access: 'private',
    addRandomSuffix: false,
  })
}

async function blobList(prefix) {
  const { list } = await import('@vercel/blob')
  const { blobs } = await list({ prefix })
  return blobs.map(b => b.pathname)
}

async function blobDelete(name) {
  const { list, del } = await import('@vercel/blob')
  const { blobs } = await list({ prefix: name })
  const blob = blobs.find(b => b.pathname === name)
  if (blob) await del(blob.url) // del() s'authentifie via le token SDK
}

async function writeRaw(name, data) {
  if (USE_BLOB) return blobWrite(name, data)
  return localWrite(name, data)
}
