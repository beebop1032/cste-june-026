import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, rmSync, mkdirSync } from 'fs'
import path from 'path'

const TMP = path.join(process.cwd(), 'tests', 'tmp-data')

process.env.BLOB_READ_WRITE_TOKEN = ''
process.env.DATA_DIR_OVERRIDE = TMP

const { read, writeFileSafe, listFiles } = await import('../lib/storage.js')

beforeEach(() => { mkdirSync(TMP, { recursive: true }) })
afterEach(() => { rmSync(TMP, { recursive: true, force: true }) })

describe('storage', () => {
  it('read returns null for missing file', async () => {
    expect(await read('missing.json')).toBeNull()
  })

  it('writeFileSafe creates file on first write', async () => {
    await writeFileSafe('test.json', { x: 1 })
    expect(await read('test.json')).toEqual({ x: 1 })
  })

  it('writeFileSafe archives before overwriting', async () => {
    await writeFileSafe('test.json', { x: 1 })
    await writeFileSafe('test.json', { x: 2 })
    expect(await read('test.json')).toEqual({ x: 2 })
    const files = await listFiles('test')
    expect(files.filter(f => f.includes('-v')).length).toBe(1)
  })

  it('listFiles returns matching files', async () => {
    await writeFileSafe('prof-ANM.json', { a: 1 })
    await writeFileSafe('prof-JAQ.json', { b: 2 })
    const files = await listFiles('prof-')
    expect(files.some(f => f.includes('prof-ANM'))).toBe(true)
    expect(files.some(f => f.includes('prof-JAQ'))).toBe(true)
  })
})
