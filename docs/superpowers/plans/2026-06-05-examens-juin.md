# Examens Juin 2026 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Next.js 15 mini-site that collects teacher responses about the June 2026 exam schedule (strike context), with an admin dashboard to pilot the process, zero data loss, deployed on Vercel.

**Architecture:** Server Components for all read-only pages, Server Actions for mutations (submit, lock/unlock, auth), one Route Handler for file export. Vercel Blob for storage in prod with `./data/` local fallback. Archive-before-overwrite on every write operation.

**Tech Stack:** Next.js 15 App Router, React 19, JS (no UI libs), inline styles, `@vercel/blob`, `xlsx` (SheetJS), Node.js built-in `crypto` for cookie signing, `vitest` for unit tests.

---

## Context

A Belgian secondary school is on strike; June 2026 exams are being revised. Teachers must declare which students still sit each exam. The admin needs a live dashboard to lock exams as "maintained" and export the final list. Data loss is unacceptable — every write archives the previous version before overwriting.

---

## File Map

```
package.json
next.config.mjs
.env.local                          ← local dev env vars (gitignored)
.gitignore
data/.gitkeep                       ← local fallback dir (contents gitignored)

scripts/
  parse-excel.js                    ← one-shot Excel → lib/exams.json

lib/
  exams.json                        ← committed output of parse-excel.js
  storage.js                        ← read / writeFileSafe / listFiles (Blob + local)
  auth.js                           ← makeToken / setSessionCookie / verifySession / requireProf / requireAdmin

actions/
  auth.js                           ← checkCode Server Action (handles both prof + admin)
  prof.js                           ← getProfStatus, submitProf Server Actions
  admin.js                          ← toggleLock, lockByNiveau, unlockByNiveau Server Actions

app/
  layout.js                         ← root layout (no global CSS)
  page.js                           ← home: code entry form + school logo
  prof/
    page.js                         ← prof code selector (Server Component, protected)
    [code]/
      page.js                       ← Server Component: auth check + status, renders ProfForm
      ProfForm.js                   ← Client Component: dynamic student list + submit
  admin/
    page.js                         ← admin dashboard: 3 views + lock panel (Server Component)
  api/
    export/
      route.js                      ← GET ?format=csv|xlsx (Route Handler, admin-protected)

tests/
  storage.test.js
  auth.test.js
```

---

## Task 1: Project Bootstrap

**Files:**
- Create: `package.json`
- Create: `next.config.mjs`
- Create: `app/layout.js`
- Create: `.env.local`
- Create: `.gitignore`
- Create: `data/.gitkeep`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "horaires-juin",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "parse": "node scripts/parse-excel.js",
    "test": "vitest run"
  },
  "dependencies": {
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@vercel/blob": "^0.27.0",
    "xlsx": "^0.18.5"
  },
  "devDependencies": {
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Install dependencies**

```bash
npm install
```

- [ ] **Step 3: Create next.config.mjs**

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['xlsx'],
}

export default nextConfig
```

- [ ] **Step 4: Create app/layout.js**

```javascript
export const metadata = {
  title: 'Examens juin 2026 — Les Hayeffes',
}

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#f5f5f5' }}>
        {children}
      </body>
    </html>
  )
}
```

- [ ] **Step 5: Create .env.local**

```
ACCESS_CODE=AIF2026LCK
ADMIN_KEY=AIFADMIN2026LCK
BLOB_READ_WRITE_TOKEN=
```

- [ ] **Step 6: Create .gitignore**

```
.next/
node_modules/
.env.local
data/*
!data/.gitkeep
.DS_Store
```

- [ ] **Step 7: Create data/.gitkeep**

```bash
touch data/.gitkeep
```

- [ ] **Step 8: Verify dev server starts**

```bash
npm run dev
```

Expected: server starts on http://localhost:3000 (404 is fine, no pages yet)

- [ ] **Step 9: Commit**

```bash
git add package.json next.config.mjs app/layout.js .gitignore data/.gitkeep
git commit -m "feat: bootstrap Next.js 15 project"
```

---

## Task 2: Excel Parser Script → lib/exams.json

**Files:**
- Create: `scripts/parse-excel.js`
- Create: `lib/exams.json` (generated output, committed)

The Excel (`Surveillance exam juin2026.xlsx`, sheet "Feuil1") has:
- Day header rows containing "juin"
- P1 / P2 period rows
- 6 horizontal niveau blocs, each 5 columns wide: matière | groupe | profCode | (empty) | local
- Matière propagates down within a bloc until a new non-empty, non-annotation value appears
- Annotations to concatenate: `CE1D`, `CESS`, `oral`, `1h`
- Rows to ignore: start with "Réserviste" or "Lg oraux"
- Same exam in P1 and P2 same day (same matière/groupe/profCode/local) → merge to "P1+P2"

- [ ] **Step 1: Create scripts/parse-excel.js**

```javascript
const XLSX = require('xlsx')
const fs = require('fs')
const path = require('path')

const ANNOTATIONS = ['CE1D', 'CESS', 'oral', '1h']
const NIVEAUX = ['1re', '2e', '3e', '4e', '5e', '6e']

function slugify(str) {
  return String(str)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function makeId(profCode, matiere, groupe, jour, periode) {
  const day = jour.slice(8, 10) // "2026-06-18" → "18"
  const per = periode.replace('+', '')
  return `${profCode}-${slugify(matiere)}-${groupe}-${day}-${per}`
}

function parseExcel() {
  const wb = XLSX.readFile(path.join(__dirname, '..', 'Surveillance exam juin2026.xlsx'))
  const ws = wb.Sheets['Feuil1']
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

  // Find column offsets for the 6 niveau blocs
  // Each bloc = 5 cols: matière(0), groupe(1), profCode(2), vide(3), local(4)
  // Find the header row containing niveau labels to determine offsets
  let niveauColOffsets = null
  let headerRowIdx = -1

  for (let r = 0; r < Math.min(20, rows.length); r++) {
    const row = rows[r]
    const found = []
    for (let c = 0; c < row.length; c++) {
      const cell = String(row[c]).trim()
      if (NIVEAUX.includes(cell)) found.push({ niveau: cell, col: c })
    }
    if (found.length >= 3) {
      niveauColOffsets = found
      headerRowIdx = r
      break
    }
  }

  if (!niveauColOffsets) throw new Error('Cannot find niveau header row in Excel')

  console.log('Niveau offsets:', niveauColOffsets)

  const exams = []
  let currentJour = null
  let currentPeriode = null
  // Per bloc: track current matière
  const currentMatiere = {}
  niveauColOffsets.forEach(({ niveau }) => { currentMatiere[niveau] = '' })

  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row = rows[r]
    const firstCell = String(row[0] || '').trim()

    // Detect day row (contains "juin")
    if (firstCell.toLowerCase().includes('juin')) {
      currentJour = parseDayToISO(firstCell)
      currentPeriode = null
      niveauColOffsets.forEach(({ niveau }) => { currentMatiere[niveau] = '' })
      continue
    }

    // Detect period row
    if (firstCell === 'P1' || firstCell === 'P2') {
      currentPeriode = firstCell
      niveauColOffsets.forEach(({ niveau }) => { currentMatiere[niveau] = '' })
      continue
    }

    // Skip ignored rows
    if (firstCell.startsWith('Réserviste') || firstCell.toLowerCase().startsWith('lg oraux')) continue
    if (!currentJour || !currentPeriode) continue

    // Parse each niveau bloc
    for (const { niveau, col } of niveauColOffsets) {
      const matiereCellRaw = String(row[col] || '').trim()
      const groupe = String(row[col + 1] || '').trim()
      const profCode = String(row[col + 2] || '').trim()
      const local = String(row[col + 4] || '').trim()

      // Update current matière
      if (matiereCellRaw) {
        if (ANNOTATIONS.includes(matiereCellRaw) || ANNOTATIONS.some(a => matiereCellRaw.startsWith(a))) {
          currentMatiere[niveau] = currentMatiere[niveau]
            ? `${currentMatiere[niveau]} ${matiereCellRaw}`
            : matiereCellRaw
        } else {
          currentMatiere[niveau] = matiereCellRaw
        }
      }

      if (!profCode || !groupe || !currentMatiere[niveau]) continue

      exams.push({
        matiere: currentMatiere[niveau],
        niveau,
        groupe,
        profCode,
        jour: currentJour,
        periode: currentPeriode,
        local,
      })
    }
  }

  // Merge P1+P2: same matière/groupe/profCode/local on same jour
  const merged = []
  const seen = new Map()

  for (const ex of exams) {
    const key = `${ex.profCode}|${ex.matiere}|${ex.groupe}|${ex.jour}|${ex.local}`
    if (seen.has(key)) {
      const existing = seen.get(key)
      if (existing.periode !== ex.periode) {
        existing.periode = 'P1+P2'
      }
    } else {
      const entry = { ...ex }
      entry.id = makeId(ex.profCode, ex.matiere, ex.groupe, ex.jour, ex.periode)
      seen.set(key, entry)
      merged.push(entry)
    }
  }

  // Fix IDs for merged P1+P2
  for (const ex of merged) {
    ex.id = makeId(ex.profCode, ex.matiere, ex.groupe, ex.jour, ex.periode)
  }

  console.log(`Parsed ${merged.length} unique exams, ${new Set(merged.map(e => e.profCode)).size} profs`)
  return merged
}

function parseDayToISO(str) {
  // e.g. "Jeudi 18 juin 2026" → "2026-06-18"
  const months = { janvier:1,février:2,mars:3,avril:4,mai:5,juin:6,juillet:7,août:8,septembre:9,octobre:10,novembre:11,décembre:12 }
  const m = str.match(/(\d+)\s+(\w+)\s+(\d{4})/)
  if (!m) return null
  const [, day, monthStr, year] = m
  const month = months[monthStr.toLowerCase()]
  if (!month) return null
  return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`
}

const result = parseExcel()
fs.writeFileSync(
  path.join(__dirname, '..', 'lib', 'exams.json'),
  JSON.stringify(result, null, 2),
  'utf8'
)
console.log('Written to lib/exams.json')
```

- [ ] **Step 2: Run the parser**

```bash
mkdir -p lib && npm run parse
```

Expected output:
```
Niveau offsets: [...]
Parsed ~289 unique exams, ~54 profs
Written to lib/exams.json
```

If the count differs significantly from 289/54, inspect the output and adjust the column offset detection or matière propagation logic.

- [ ] **Step 3: Verify the output**

```bash
node -e "const d=require('./lib/exams.json'); console.log(d.length, new Set(d.map(e=>e.profCode)).size, d[0])"
```

Expected: first number ~289, second ~54, third = a valid exam object with all fields.

- [ ] **Step 4: Commit**

```bash
git add scripts/parse-excel.js lib/exams.json
git commit -m "feat: add Excel parser and commit exams.json (289 exams, 54 profs)"
```

---

## Task 3: Storage Abstraction

**Files:**
- Create: `lib/storage.js`
- Create: `tests/storage.test.js`

`writeFileSafe` always archives the current file before overwriting. If the archive write fails, the main write is aborted and an error is thrown — data is preserved.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/storage.test.js
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, rmSync, mkdirSync } from 'fs'
import path from 'path'

// Force local fallback (no blob token in tests)
process.env.BLOB_READ_WRITE_TOKEN = ''
process.env.DATA_DIR_OVERRIDE = path.join(process.cwd(), 'tests', 'tmp-data')

const { read, writeFileSafe, listFiles } = await import('../lib/storage.js')

const TMP = path.join(process.cwd(), 'tests', 'tmp-data')

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
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npm test -- tests/storage.test.js
```

Expected: FAIL (storage.js not found)

- [ ] **Step 3: Create lib/storage.js**

```javascript
import { readFile, writeFile, mkdir, readdir } from 'fs/promises'
import path from 'path'

const DATA_DIR = process.env.DATA_DIR_OVERRIDE || path.join(process.cwd(), 'data')
const USE_BLOB = !!process.env.BLOB_READ_WRITE_TOKEN

async function read(name) {
  if (USE_BLOB) return blobRead(name)
  return localRead(name)
}

async function writeFileSafe(name, data) {
  const existing = await read(name)
  if (existing !== null) {
    const archiveName = name.replace('.json', `-v${Date.now()}.json`)
    // Archive MUST succeed before we overwrite
    await writeRaw(archiveName, existing)
  }
  await writeRaw(name, data)
}

async function listFiles(prefix) {
  if (USE_BLOB) return blobList(prefix)
  return localList(prefix)
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
  const res = await fetch(blob.url)
  if (!res.ok) return null
  return res.json()
}

async function blobWrite(name, data) {
  const { put } = await import('@vercel/blob')
  await put(name, JSON.stringify(data, null, 2), {
    access: 'public',
    addRandomSuffix: false,
  })
}

async function blobList(prefix) {
  const { list } = await import('@vercel/blob')
  const { blobs } = await list({ prefix })
  return blobs.map(b => b.pathname)
}

async function writeRaw(name, data) {
  if (USE_BLOB) return blobWrite(name, data)
  return localWrite(name, data)
}

export { read, writeFileSafe, listFiles }
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npm test -- tests/storage.test.js
```

Expected: all 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/storage.js tests/storage.test.js
git commit -m "feat: add storage abstraction with archive-before-write"
```

---

## Task 4: Auth Layer

**Files:**
- Create: `lib/auth.js`
- Create: `actions/auth.js`
- Create: `tests/auth.test.js`

- [ ] **Step 1: Write failing test for makeToken**

```javascript
// tests/auth.test.js
import { describe, it, expect } from 'vitest'

// We only test the pure token logic — cookie I/O is tested manually
const { makeToken } = await import('../lib/auth.js')

describe('makeToken', () => {
  it('returns a 64-char hex string', () => {
    const t = makeToken('prof', 'secret')
    expect(t).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is deterministic', () => {
    expect(makeToken('prof', 'secret')).toBe(makeToken('prof', 'secret'))
  })

  it('differs by role', () => {
    expect(makeToken('prof', 'secret')).not.toBe(makeToken('admin', 'secret'))
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npm test -- tests/auth.test.js
```

Expected: FAIL (auth.js not found)

- [ ] **Step 3: Create lib/auth.js**

```javascript
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
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npm test -- tests/auth.test.js
```

Expected: 3 tests PASS (makeToken is a pure function, no Next.js deps needed)

- [ ] **Step 5: Create actions/auth.js**

```javascript
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
```

- [ ] **Step 6: Commit**

```bash
git add lib/auth.js actions/auth.js tests/auth.test.js
git commit -m "feat: add auth layer (cookie signing + session helpers)"
```

---

## Task 5: Home Page

**Files:**
- Create: `app/page.js`

Logo URL: `http://cste.be/msg/wp-content/uploads/2021/05/Logo_couleur_CollegeEnBlanc.png`
This is an external URL — render it with a standard `<img>` tag (no Next.js Image component needed).

- [ ] **Step 1: Create app/page.js**

```javascript
import { checkCode } from '@/actions/auth'

export default function HomePage() {
  return (
    <main style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 32,
      padding: 24,
    }}>
      <img
        src="http://cste.be/msg/wp-content/uploads/2021/05/Logo_couleur_CollegeEnBlanc.png"
        alt="Logo école des Hayeffes"
        style={{ maxWidth: 240, height: 'auto' }}
      />
      <h1 style={{ fontSize: 22, margin: 0, textAlign: 'center', color: '#1a1a2e' }}>
        Examens juin 2026
      </h1>
      <form action={checkCode} style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', maxWidth: 320 }}>
        <input
          name="code"
          type="password"
          placeholder="Code d'accès"
          required
          autoComplete="off"
          style={{
            padding: '12px 16px',
            fontSize: 18,
            border: '2px solid #ccc',
            borderRadius: 8,
            outline: 'none',
            textAlign: 'center',
            letterSpacing: 2,
          }}
        />
        <button
          type="submit"
          style={{
            padding: '12px 16px',
            fontSize: 16,
            background: '#1a1a2e',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
          }}
        >
          Accéder
        </button>
      </form>
    </main>
  )
}
```

- [ ] **Step 2: Test manually**

```bash
npm run dev
```

Open http://localhost:3000. Verify:
- Logo appears
- Enter `AIF2026LCK` → redirects to `/prof`
- Enter `AIFADMIN2026LCK` → redirects to `/admin`
- Wrong code → stays on `/` (error display not yet wired — acceptable for now)

Note: `/prof` and `/admin` will 404 until Tasks 6–9.

- [ ] **Step 3: Commit**

```bash
git add app/page.js
git commit -m "feat: add home page with code entry and school logo"
```

---

## Task 6: Prof Selector Page

**Files:**
- Create: `app/prof/page.js`

- [ ] **Step 1: Create app/prof/page.js**

```javascript
import { requireProf } from '@/lib/auth'
import { redirect } from 'next/navigation'
import exams from '@/lib/exams.json'

// Sorted unique prof codes
const PROF_CODES = [...new Set(exams.map(e => e.profCode))].sort()

export default async function ProfSelectPage() {
  await requireProf()

  async function selectProf(formData) {
    'use server'
    const code = formData.get('profCode')
    redirect(`/prof/${code}`)
  }

  return (
    <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24, padding: 24 }}>
      <h1 style={{ fontSize: 20, margin: 0 }}>Sélectionnez votre code prof</h1>
      <form action={selectProf} style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', maxWidth: 320 }}>
        <select
          name="profCode"
          required
          defaultValue=""
          style={{ padding: '10px 14px', fontSize: 16, border: '2px solid #ccc', borderRadius: 8 }}
        >
          <option value="" disabled>-- Votre code --</option>
          {PROF_CODES.map(code => (
            <option key={code} value={code}>{code}</option>
          ))}
        </select>
        <button
          type="submit"
          style={{ padding: '12px 16px', fontSize: 16, background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}
        >
          Continuer →
        </button>
      </form>
    </main>
  )
}
```

- [ ] **Step 2: Test manually**

Log in with `AIF2026LCK`. Verify `/prof` shows the dropdown with all prof codes. Select one → redirects to `/prof/ANM` (404 until Task 7).

- [ ] **Step 3: Commit**

```bash
git add app/prof/page.js
git commit -m "feat: add prof code selector page"
```

---

## Task 7: Prof Form — Actions + Page

**Files:**
- Create: `actions/prof.js`
- Create: `app/prof/[code]/page.js`
- Create: `app/prof/[code]/ProfForm.js`

- [ ] **Step 1: Create actions/prof.js**

```javascript
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

  // Validate payload shape
  if (!Array.isArray(payload?.examens)) return { error: 'Données invalides' }
  for (const ex of payload.examens) {
    if (typeof ex.id !== 'string') return { error: 'Données invalides' }
    if (!Array.isArray(ex.eleves)) return { error: 'Données invalides' }
    for (const el of ex.eleves) {
      if (typeof el.nom !== 'string' || typeof el.prenom !== 'string') return { error: 'Données invalides' }
    }
  }

  const existing = await read(`prof-${profCode}.json`)
  const version = existing ? (existing.version ?? 0) + 1 : 1

  const data = {
    profCode,
    submittedAt: new Date().toISOString(),
    version,
    examens: payload.examens,
  }

  await writeFileSafe(`prof-${profCode}.json`, data)
  return { ok: true }
}
```

- [ ] **Step 2: Create app/prof/[code]/page.js**

```javascript
import { requireProf } from '@/lib/auth'
import { getProfStatus } from '@/actions/prof'
import { read } from '@/lib/storage'
import exams from '@/lib/exams.json'
import ProfForm from './ProfForm'

export default async function ProfPage({ params }) {
  const { code } = await params
  await requireProf()

  const { dejaRempli } = await getProfStatus(code)

  // Load admin locks
  const locksData = await read('admin-locks.json')
  const locked = new Set(locksData?.locked ?? [])

  // Exams for this prof
  const profExams = exams.filter(e => e.profCode === code)

  return (
    <main style={{ maxWidth: 800, margin: '0 auto', padding: 24 }}>
      <h1 style={{ fontSize: 20, marginBottom: 8 }}>Prof : {code}</h1>
      <p style={{ color: '#666', marginBottom: 24 }}>
        Indiquez les élèves présents pour chaque examen. Zéro élève = examen annulé.
      </p>
      <ProfForm
        profCode={code}
        examens={profExams}
        locked={[...locked]}
        dejaRempli={dejaRempli}
      />
    </main>
  )
}
```

- [ ] **Step 3: Create app/prof/[code]/ProfForm.js**

```javascript
'use client'
import { useState, useTransition } from 'react'
import { submitProf } from '@/actions/prof'

const JOURS = { 'Mon':'Lun','Tue':'Mar','Wed':'Mer','Thu':'Jeu','Fri':'Ven','Sat':'Sam','Sun':'Dim' }

function formatJour(iso) {
  const d = new Date(iso)
  return d.toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long' })
}

export default function ProfForm({ profCode, examens, locked, dejaRempli }) {
  const lockedSet = new Set(locked)
  const openExams = examens.filter(e => !lockedSet.has(e.id))

  const [confirmed, setConfirmed] = useState(!dejaRempli)
  const [examState, setExamState] = useState(() =>
    Object.fromEntries(openExams.map(e => [e.id, { eleves: [], surveilleParTitulaire: false }]))
  )
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState(null)

  function addEleve(examId) {
    setExamState(s => ({
      ...s,
      [examId]: { ...s[examId], eleves: [...s[examId].eleves, { nom: '', prenom: '' }] }
    }))
  }

  function removeEleve(examId, idx) {
    setExamState(s => ({
      ...s,
      [examId]: { ...s[examId], eleves: s[examId].eleves.filter((_, i) => i !== idx) }
    }))
  }

  function updateEleve(examId, idx, field, value) {
    setExamState(s => ({
      ...s,
      [examId]: {
        ...s[examId],
        eleves: s[examId].eleves.map((el, i) => i === idx ? { ...el, [field]: value } : el)
      }
    }))
  }

  function handleSubmit(e) {
    e.preventDefault()
    const payload = {
      examens: examens.map(ex => {
        if (lockedSet.has(ex.id)) return { id: ex.id, eleves: [], surveilleParTitulaire: false, locked: true }
        const st = examState[ex.id]
        return { id: ex.id, eleves: st.eleves, surveilleParTitulaire: st.surveilleParTitulaire }
      })
    }
    startTransition(async () => {
      const res = await submitProf(profCode, payload)
      setResult(res)
    })
  }

  if (result?.ok) {
    return (
      <div style={{ padding: 32, textAlign: 'center', background: '#d4edda', borderRadius: 12 }}>
        <h2 style={{ color: '#155724' }}>Réponses enregistrées</h2>
        <p>Merci. Vos réponses ont bien été sauvegardées.</p>
      </div>
    )
  }

  if (!confirmed) {
    return (
      <div style={{ padding: 24, background: '#fff3cd', border: '2px solid #ffc107', borderRadius: 12, marginBottom: 24 }}>
        <h2 style={{ color: '#856404', margin: '0 0 12px' }}>⚠ Déjà rempli</h2>
        <p style={{ margin: '0 0 16px' }}>
          Vous avez déjà soumis vos réponses. En continuant, vous allez <strong>écraser les réponses existantes</strong>.
        </p>
        <button
          onClick={() => setConfirmed(true)}
          style={{ padding: '10px 20px', background: '#856404', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 15 }}
        >
          Je comprends, modifier mes réponses
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit}>
      {examens.map(ex => {
        const isLocked = lockedSet.has(ex.id)
        const st = isLocked ? null : examState[ex.id]
        return (
          <div
            key={ex.id}
            style={{
              background: isLocked ? '#f0f0f0' : '#fff',
              border: '1px solid #ddd',
              borderRadius: 10,
              padding: 20,
              marginBottom: 16,
              opacity: isLocked ? 0.6 : 1,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div>
                <strong style={{ fontSize: 16 }}>{ex.matiere}</strong>
                <span style={{ marginLeft: 8, color: '#666', fontSize: 14 }}>{ex.niveau} — {ex.groupe}</span>
              </div>
              <span style={{ fontSize: 13, color: '#888' }}>
                {formatJour(ex.jour)} · {ex.periode} · {ex.local}
              </span>
            </div>

            {isLocked ? (
              <span style={{ display: 'inline-block', padding: '4px 12px', background: '#6c757d', color: '#fff', borderRadius: 20, fontSize: 13 }}>
                Complet
              </span>
            ) : (
              <>
                <div style={{ marginBottom: 8, fontSize: 13, color: st.eleves.length === 0 ? '#dc3545' : '#28a745', fontWeight: 600 }}>
                  {st.eleves.length === 0 ? '0 élève — examen annulé' : `${st.eleves.length} élève(s)`}
                </div>

                {st.eleves.map((el, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                    <input
                      placeholder="Nom"
                      value={el.nom}
                      onChange={e => updateEleve(ex.id, idx, 'nom', e.target.value)}
                      style={{ flex: 1, padding: '6px 10px', border: '1px solid #ccc', borderRadius: 6, fontSize: 14 }}
                    />
                    <input
                      placeholder="Prénom"
                      value={el.prenom}
                      onChange={e => updateEleve(ex.id, idx, 'prenom', e.target.value)}
                      style={{ flex: 1, padding: '6px 10px', border: '1px solid #ccc', borderRadius: 6, fontSize: 14 }}
                    />
                    <button
                      type="button"
                      onClick={() => removeEleve(ex.id, idx)}
                      style={{ padding: '6px 10px', background: '#dc3545', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
                    >
                      ✕
                    </button>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() => addEleve(ex.id)}
                  style={{ padding: '6px 14px', background: '#007bff', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, marginBottom: 8 }}
                >
                  + Ajouter un élève
                </button>

                <div style={{ marginTop: 8 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={st.surveilleParTitulaire}
                      onChange={e => setExamState(s => ({ ...s, [ex.id]: { ...s[ex.id], surveilleParTitulaire: e.target.checked } }))}
                    />
                    Je surveille moi-même cet examen
                  </label>
                </div>
              </>
            )}
          </div>
        )
      })}

      {result?.error && (
        <p style={{ color: '#dc3545', marginBottom: 12 }}>{result.error}</p>
      )}

      <button
        type="submit"
        disabled={isPending}
        style={{ width: '100%', padding: '14px 0', fontSize: 16, background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 8, cursor: isPending ? 'wait' : 'pointer', marginTop: 8 }}
      >
        {isPending ? 'Envoi en cours…' : 'Envoyer mes réponses'}
      </button>
    </form>
  )
}
```

- [ ] **Step 4: Test manually**

1. Log in → select a prof code → see the form
2. Add some students, check "surveille moi-même", submit
3. Check `data/prof-{CODE}.json` was created
4. Go back, re-select same prof → see the orange warning
5. Confirm → fill again → submit → check `data/prof-{CODE}-v{ts}.json` archive was created

- [ ] **Step 5: Commit**

```bash
git add actions/prof.js app/prof/[code]/page.js app/prof/[code]/ProfForm.js
git commit -m "feat: add prof form with dynamic student list and archive-safe submit"
```

---

## Task 8: Admin Actions

**Files:**
- Create: `actions/admin.js`

- [ ] **Step 1: Create actions/admin.js**

```javascript
'use server'
import { requireAdmin } from '@/lib/auth'
import { read, writeFileSafe, listFiles } from '@/lib/storage'
import exams from '@/lib/exams.json'

export async function toggleLock(examId) {
  await requireAdmin()
  const current = (await read('admin-locks.json')) ?? { locked: [] }
  const set = new Set(current.locked)
  if (set.has(examId)) set.delete(examId)
  else set.add(examId)
  await writeFileSafe('admin-locks.json', { locked: [...set], updatedAt: new Date().toISOString() })
}

export async function lockByNiveau(niveau) {
  await requireAdmin()
  const current = (await read('admin-locks.json')) ?? { locked: [] }
  const set = new Set(current.locked)
  exams.filter(e => e.niveau === niveau).forEach(e => set.add(e.id))
  await writeFileSafe('admin-locks.json', { locked: [...set], updatedAt: new Date().toISOString() })
}

export async function unlockByNiveau(niveau) {
  await requireAdmin()
  const current = (await read('admin-locks.json')) ?? { locked: [] }
  const niveauIds = new Set(exams.filter(e => e.niveau === niveau).map(e => e.id))
  const filtered = current.locked.filter(id => !niveauIds.has(id))
  await writeFileSafe('admin-locks.json', { locked: filtered, updatedAt: new Date().toISOString() })
}

// Returns all prof responses (current files only, no archives)
export async function getAllResponses() {
  await requireAdmin()
  const files = await listFiles('prof-')
  // Only current files (no -vXXX archives)
  const currentFiles = files.filter(f => /^prof-[A-Z]+\.json$/.test(f))
  const results = {}
  for (const f of currentFiles) {
    const data = await read(f)
    if (data) results[data.profCode] = data
  }
  return results
}

export async function getLockedSet() {
  await requireAdmin()
  const data = (await read('admin-locks.json')) ?? { locked: [] }
  return new Set(data.locked)
}
```

- [ ] **Step 2: Commit**

```bash
git add actions/admin.js
git commit -m "feat: add admin actions (lock/unlock by exam or niveau, read all responses)"
```

---

## Task 9: Admin Dashboard

**Files:**
- Create: `app/admin/page.js`

This is a large Server Component. It fetches all data server-side and renders 4 sections: Suivi, Horaire, Élèves, Verrous.

- [ ] **Step 1: Create app/admin/page.js**

```javascript
import { requireAdmin } from '@/lib/auth'
import { getAllResponses, getLockedSet, toggleLock, lockByNiveau, unlockByNiveau } from '@/actions/admin'
import exams from '@/lib/exams.json'

const NIVEAUX = ['1re', '2e', '3e', '4e', '5e', '6e']
const ALL_PROF_CODES = [...new Set(exams.map(e => e.profCode))].sort()

function formatJour(iso) {
  return new Date(iso).toLocaleDateString('fr-BE', { weekday: 'short', day: 'numeric', month: 'short' })
}

export default async function AdminPage({ searchParams }) {
  await requireAdmin()
  const sp = await searchParams
  const tab = sp?.tab ?? 'suivi'

  const responses = await getAllResponses()
  const locked = await getLockedSet()

  const respondedCodes = new Set(Object.keys(responses))
  const missing = ALL_PROF_CODES.filter(c => !respondedCodes.has(c))

  return (
    <main style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Dashboard admin — Examens juin 2026</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <a href="/admin?tab=suivi" style={tabStyle(tab === 'suivi')}>Suivi</a>
          <a href="/admin?tab=horaire" style={tabStyle(tab === 'horaire')}>Horaire</a>
          <a href="/admin?tab=eleves" style={tabStyle(tab === 'eleves')}>Élèves</a>
          <a href="/admin?tab=verrous" style={tabStyle(tab === 'verrous')}>Verrous</a>
        </div>
      </div>

      {tab === 'suivi' && <SuiviView responded={respondedCodes} missing={missing} />}
      {tab === 'horaire' && <HoraireView responses={responses} locked={locked} />}
      {tab === 'eleves' && <ElevesView responses={responses} />}
      {tab === 'verrous' && <VerrousView locked={locked} />}
    </main>
  )
}

function tabStyle(active) {
  return {
    padding: '8px 18px',
    borderRadius: 8,
    textDecoration: 'none',
    background: active ? '#1a1a2e' : '#e9e9e9',
    color: active ? '#fff' : '#333',
    fontSize: 14,
    fontWeight: active ? 600 : 400,
  }
}

function SuiviView({ responded, missing }) {
  return (
    <div>
      <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>
        {responded.size} / {ALL_PROF_CODES.length} profs ont répondu
      </div>
      {missing.length > 0 && (
        <>
          <h2 style={{ fontSize: 16, marginBottom: 8 }}>Codes manquants ({missing.length})</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {missing.map(c => (
              <span key={c} style={{ padding: '4px 12px', background: '#fff3cd', border: '1px solid #ffc107', borderRadius: 20, fontSize: 13 }}>
                {c}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function HoraireView({ responses, locked }) {
  // Build a lookup: examId → badge
  const badge = {}
  for (const ex of exams) {
    if (locked.has(ex.id)) { badge[ex.id] = { label: 'Complet', color: '#6c757d' }; continue }
    const profResp = responses[ex.profCode]
    if (!profResp) { badge[ex.id] = { label: '—', color: '#aaa' }; continue }
    const exResp = profResp.examens?.find(e => e.id === ex.id)
    if (!exResp) { badge[ex.id] = { label: '—', color: '#aaa' }; continue }
    if (exResp.eleves.length === 0) { badge[ex.id] = { label: 'Annulé', color: '#dc3545' }; continue }
    badge[ex.id] = { label: `${exResp.eleves.length} élève(s)`, color: '#28a745' }
  }

  // Group by jour × periode
  const jours = [...new Set(exams.map(e => e.jour))].sort()
  const periodes = ['P1', 'P2', 'P1+P2']

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%' }}>
        <thead>
          <tr>
            <th style={thStyle}>Jour</th>
            <th style={thStyle}>Période</th>
            <th style={thStyle}>Matière</th>
            <th style={thStyle}>Niveau</th>
            <th style={thStyle}>Groupe</th>
            <th style={thStyle}>Prof</th>
            <th style={thStyle}>Local</th>
            <th style={thStyle}>Statut</th>
          </tr>
        </thead>
        <tbody>
          {exams.map(ex => {
            const b = badge[ex.id] ?? { label: '—', color: '#aaa' }
            return (
              <tr key={ex.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={tdStyle}>{formatJour(ex.jour)}</td>
                <td style={tdStyle}>{ex.periode}</td>
                <td style={tdStyle}>{ex.matiere}</td>
                <td style={tdStyle}>{ex.niveau}</td>
                <td style={tdStyle}>{ex.groupe}</td>
                <td style={tdStyle}>{ex.profCode}</td>
                <td style={tdStyle}>{ex.local}</td>
                <td style={tdStyle}>
                  <span style={{ color: b.color, fontWeight: 600 }}>{b.label}</span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function ElevesView({ responses }) {
  const rows = []
  for (const prof of Object.values(responses)) {
    for (const ex of prof.examens ?? []) {
      const meta = exams.find(e => e.id === ex.id)
      if (!meta) continue
      if (ex.eleves.length === 0) continue
      for (const el of ex.eleves) {
        rows.push({ ...meta, nom: el.nom, prenom: el.prenom, surveille: ex.surveilleParTitulaire })
      }
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', gap: 12 }}>
        <a
          href="/api/export?format=csv"
          style={{ padding: '8px 18px', background: '#28a745', color: '#fff', borderRadius: 8, textDecoration: 'none', fontSize: 14 }}
        >
          Export CSV
        </a>
        <a
          href="/api/export?format=xlsx"
          style={{ padding: '8px 18px', background: '#007bff', color: '#fff', borderRadius: 8, textDecoration: 'none', fontSize: 14 }}
        >
          Export XLSX
        </a>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%' }}>
          <thead>
            <tr>
              {['Prof','Jour','Période','Niveau','Groupe','Matière','Local','Nom','Prénom','Surveille'].map(h => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                <td style={tdStyle}>{r.profCode}</td>
                <td style={tdStyle}>{formatJour(r.jour)}</td>
                <td style={tdStyle}>{r.periode}</td>
                <td style={tdStyle}>{r.niveau}</td>
                <td style={tdStyle}>{r.groupe}</td>
                <td style={tdStyle}>{r.matiere}</td>
                <td style={tdStyle}>{r.local}</td>
                <td style={tdStyle}>{r.nom}</td>
                <td style={tdStyle}>{r.prenom}</td>
                <td style={tdStyle}>{r.surveille ? 'Oui' : 'Non'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p style={{ color: '#888', marginTop: 16 }}>Aucune réponse reçue.</p>}
      </div>
    </div>
  )
}

function VerrousView({ locked }) {
  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, marginBottom: 12 }}>Verrouiller par niveau</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {NIVEAUX.map(n => (
            <div key={n} style={{ display: 'flex', gap: 4 }}>
              <form action={lockByNiveau}>
                <input type="hidden" name="niveau" value={n} />
                <button type="submit" style={{ padding: '6px 14px', background: '#6c757d', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
                  🔒 {n}
                </button>
              </form>
              <form action={unlockByNiveau}>
                <input type="hidden" name="niveau" value={n} />
                <button type="submit" style={{ padding: '6px 14px', background: '#fff', color: '#6c757d', border: '1px solid #6c757d', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
                  🔓 {n}
                </button>
              </form>
            </div>
          ))}
        </div>
      </div>

      <h2 style={{ fontSize: 16, marginBottom: 12 }}>Verrous par examen ({locked.size} verrouillé(s))</h2>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%' }}>
          <thead>
            <tr>
              {['Matière','Niveau','Groupe','Prof','Jour','Période','Local','État'].map(h => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {exams.map(ex => (
              <tr key={ex.id} style={{ borderBottom: '1px solid #eee', background: locked.has(ex.id) ? '#f8f9fa' : 'transparent' }}>
                <td style={tdStyle}>{ex.matiere}</td>
                <td style={tdStyle}>{ex.niveau}</td>
                <td style={tdStyle}>{ex.groupe}</td>
                <td style={tdStyle}>{ex.profCode}</td>
                <td style={tdStyle}>{formatJour(ex.jour)}</td>
                <td style={tdStyle}>{ex.periode}</td>
                <td style={tdStyle}>{ex.local}</td>
                <td style={tdStyle}>
                  <form action={toggleLock}>
                    <input type="hidden" name="examId" value={ex.id} />
                    <button type="submit" style={{
                      padding: '3px 10px', fontSize: 12, cursor: 'pointer', borderRadius: 4, border: 'none',
                      background: locked.has(ex.id) ? '#6c757d' : '#e9e9e9',
                      color: locked.has(ex.id) ? '#fff' : '#333',
                    }}>
                      {locked.has(ex.id) ? '🔒 Complet' : '🔓 Ouvrir'}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const thStyle = { padding: '8px 12px', textAlign: 'left', background: '#f0f0f0', fontWeight: 600, borderBottom: '2px solid #ddd', whiteSpace: 'nowrap' }
const tdStyle = { padding: '6px 12px', verticalAlign: 'top' }
```

Note: The `lockByNiveau` and `unlockByNiveau` Server Actions receive `formData` (form submission). Update `actions/admin.js` to accept `formData`:

```javascript
export async function lockByNiveau(formData) {
  await requireAdmin()
  const niveau = formData.get('niveau')
  const current = (await read('admin-locks.json')) ?? { locked: [] }
  const set = new Set(current.locked)
  exams.filter(e => e.niveau === niveau).forEach(e => set.add(e.id))
  await writeFileSafe('admin-locks.json', { locked: [...set], updatedAt: new Date().toISOString() })
}

export async function unlockByNiveau(formData) {
  await requireAdmin()
  const niveau = formData.get('niveau')
  const current = (await read('admin-locks.json')) ?? { locked: [] }
  const niveauIds = new Set(exams.filter(e => e.niveau === niveau).map(e => e.id))
  const filtered = current.locked.filter(id => !niveauIds.has(id))
  await writeFileSafe('admin-locks.json', { locked: filtered, updatedAt: new Date().toISOString() })
}

export async function toggleLock(formData) {
  await requireAdmin()
  const examId = formData.get('examId')
  const current = (await read('admin-locks.json')) ?? { locked: [] }
  const set = new Set(current.locked)
  if (set.has(examId)) set.delete(examId)
  else set.add(examId)
  await writeFileSafe('admin-locks.json', { locked: [...set], updatedAt: new Date().toISOString() })
}
```

Also update `getLockedSet` to not be a Server Action (call directly from Server Component):

```javascript
// In lib/storage-helpers.js or inline in actions/admin.js — make getLockedSet a regular async function
// called from the Server Component, not a 'use server' action
```

- [ ] **Step 2: Test manually**

Log in as admin. Verify all 4 tabs:
- Suivi: shows X/54 and missing list
- Horaire: shows all exams with `—` for no responses
- Élèves: empty table, export buttons visible
- Verrous: all exams shown, lock/unlock buttons work

Submit a prof response, revisit admin → verify counts update.

- [ ] **Step 3: Commit**

```bash
git add app/admin/page.js actions/admin.js
git commit -m "feat: add admin dashboard with suivi, horaire, eleves, and verrous tabs"
```

---

## Task 10: Export Route

**Files:**
- Create: `app/api/export/route.js`

- [ ] **Step 1: Create app/api/export/route.js**

```javascript
import { cookies } from 'next/headers'
import { makeToken } from '@/lib/auth'
import { listFiles, read } from '@/lib/storage'
import exams from '@/lib/exams.json'

export async function GET(request) {
  // Verify admin session
  const jar = await cookies()
  const token = jar.get('sess_admin')?.value
  const expected = makeToken('admin', process.env.ADMIN_KEY)
  if (token !== expected) {
    return new Response('Unauthorized', { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const format = searchParams.get('format') ?? 'csv'

  // Collect all rows
  const files = await listFiles('prof-')
  const currentFiles = files.filter(f => /^prof-[A-Z]+\.json$/.test(f))
  const rows = []

  for (const f of currentFiles) {
    const prof = await read(f)
    if (!prof) continue
    for (const ex of prof.examens ?? []) {
      const meta = exams.find(e => e.id === ex.id)
      if (!meta || ex.eleves.length === 0) continue
      for (const el of ex.eleves) {
        rows.push({
          prof: prof.profCode,
          jour: meta.jour,
          periode: meta.periode,
          niveau: meta.niveau,
          groupe: meta.groupe,
          matiere: meta.matiere,
          local: meta.local,
          nom: el.nom,
          prenom: el.prenom,
          surveilleParTitulaire: ex.surveilleParTitulaire ? 'Oui' : 'Non',
        })
      }
    }
  }

  if (format === 'xlsx') {
    const XLSX = (await import('xlsx')).default
    const wsData = [
      ['Prof','Jour','Période','Niveau','Groupe','Matière','Local','Nom','Prénom','Surveillé par titulaire'],
      ...rows.map(r => [r.prof, r.jour, r.periode, r.niveau, r.groupe, r.matiere, r.local, r.nom, r.prenom, r.surveilleParTitulaire])
    ]
    const ws = XLSX.utils.aoa_to_sheet(wsData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Élèves')
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    return new Response(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="examens-juin2026.xlsx"',
      }
    })
  }

  // CSV with UTF-8 BOM for Excel compatibility
  const COLS = ['prof','jour','periode','niveau','groupe','matiere','local','nom','prenom','surveilleParTitulaire']
  const header = ['Prof','Jour','Période','Niveau','Groupe','Matière','Local','Nom','Prénom','Surveillé par titulaire'].join(';')
  const csvRows = rows.map(r => COLS.map(k => `"${String(r[k] ?? '').replace(/"/g, '""')}"`).join(';'))
  const csv = '﻿' + [header, ...csvRows].join('\r\n')

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="examens-juin2026.csv"',
    }
  })
}
```

- [ ] **Step 2: Test manually**

As admin, click "Export CSV" and "Export XLSX" in the Élèves tab. Verify files download with correct data. Open CSV in Excel — verify accented characters display correctly (BOM ensures this).

- [ ] **Step 3: Commit**

```bash
git add app/api/export/route.js
git commit -m "feat: add CSV and XLSX export route (admin-protected)"
```

---

## Task 11: Deploy to Vercel

- [ ] **Step 1: Push to GitHub**

```bash
git remote add origin <your-private-repo-url>
git push -u origin main
```

- [ ] **Step 2: Create Vercel project**

1. Go to vercel.com → New Project → import your GitHub repo
2. Framework: Next.js (auto-detected)
3. Do NOT deploy yet

- [ ] **Step 3: Add Vercel Blob storage**

In Vercel dashboard: Storage → Create → Blob Store → connect to project.
This adds `BLOB_READ_WRITE_TOKEN` automatically to Vercel env vars.

- [ ] **Step 4: Add remaining env vars in Vercel**

In Vercel → Project Settings → Environment Variables, add:
- `ACCESS_CODE` = `AIF2026LCK`
- `ADMIN_KEY` = `AIFADMIN2026LCK`

- [ ] **Step 5: Deploy**

```bash
vercel --prod
```

Or trigger from GitHub push. Verify the live URL works end-to-end.

- [ ] **Step 6: Smoke test production**

1. Open the live URL → logo visible, code entry works
2. Enter prof code → select prof → form loads with all exams
3. Submit → confirm in Vercel Blob dashboard that `prof-{CODE}.json` was created
4. Enter admin code → all 4 tabs work → export downloads correctly

---

## Verification

End-to-end test sequence (run locally before deploying):

```bash
# 1. Parse Excel
npm run parse

# 2. Run unit tests
npm test

# 3. Start dev server
npm run dev

# 4. Manual test checklist:
# - Home page: wrong code → stays, correct codes → redirect
# - Prof flow: select code, fill form, submit, check data/ dir for prof-XXX.json
# - Re-submit: see orange warning, confirm, new archive created (prof-XXX-vYYYY.json)
# - Admin flow: all 4 tabs render, lock toggles work, exports download
# - Locked exam appears greyed/Complet on prof form
```

---

## Self-Review Notes

- ✅ All spec sections covered: auth, prof form, admin dashboard (3 views + locks), export, archive-before-write
- ✅ `await params` used in `app/prof/[code]/page.js` (Next.js 15 requirement)
- ✅ Server Actions never return raw existing data to prof-side (only `{ dejaRempli: boolean }`)
- ✅ Both codes (ACCESS_CODE, ADMIN_KEY) server-side only, never in client JS
- ✅ Archive write failure aborts main write — data preserved
- ✅ `lockByNiveau`/`unlockByNiveau`/`toggleLock` updated to accept `formData` for form `action=` usage
- ⚠️ Excel parser may need column offset adjustments after first run — check actual output counts vs expected (289 exams, 54 profs)
