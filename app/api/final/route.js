import { verifySession } from '@/lib/auth'
import { read, write } from '@/lib/storage'

// Données du Tableau Final (surveillants + locaux saisis), partagées avec les vues imprimables
const FILE = 'final-locaux.json'

export async function GET() {
  if (!(await verifySession('admin'))) return new Response('Unauthorized', { status: 401 })
  const data = await read(FILE)
  return Response.json(data ?? { locaux: {}, surveillants: {}, liaisons: {}, reservistes: {} })
}

export async function POST(request) {
  if (!(await verifySession('admin'))) return new Response('Unauthorized', { status: 401 })
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return new Response('Bad Request', { status: 400 })

  const clean = (obj) => {
    const out = {}
    for (const [k, v] of Object.entries(obj ?? {})) {
      if (typeof k === 'string' && typeof v === 'string' && v.trim()) out[k] = v.trim().toUpperCase()
    }
    return out
  }

  await write(FILE, {
    locaux: clean(body.locaux),
    surveillants: clean(body.surveillants),
    liaisons: clean(body.liaisons),
    reservistes: clean(body.reservistes),
    updatedAt: new Date().toISOString(),
  })
  return Response.json({ ok: true })
}
