import { requireAdmin } from '@/lib/auth'
import { getAllResponses, getLocksData } from '@/actions/admin'
import { read } from '@/lib/storage'
import exams from '@/lib/exams.json'
import PrintViews from './PrintViews'

export default async function PrintPage() {
  await requireAdmin()

  const [responses, locksData, finalData] = await Promise.all([
    getAllResponses(),
    getLocksData(),
    read('final-locaux.json'),
  ])
  // Locaux saisis dans le Tableau Final — priorité sur le local d'origine de l'horaire
  const locauxFinal = finalData?.locaux ?? {}
  const groupeStatuts = locksData.groupeStatuts ?? {}
  const examStatuts   = locksData.examStatuts   ?? {}

  // Build participation map: examId → { type, eleves, nEleves, surveilleParTitulaire }
  const partData = {}

  for (const ex of exams) {
    const s = examStatuts[ex.id] ?? groupeStatuts[ex.groupe]
    if (s === 'annule')   partData[ex.id] = { type: 'annule', eleves: [], nEleves: 0,    surveilleParTitulaire: false }
    if (s === 'maintenu') partData[ex.id] = { type: 'tous',   eleves: [], nEleves: null, surveilleParTitulaire: false }
  }

  for (const prof of Object.values(responses)) {
    for (const ex of prof.examens ?? []) {
      if (partData[ex.id]) continue
      const statut = ex.statut ?? (ex.maintenu === true ? 'maintenu' : null)
      const eleves = (ex.eleves ?? []).filter(e => e.nom || e.prenom)
      if (statut === 'aucun') {
        partData[ex.id] = { type: 'annule', eleves: [], nEleves: 0, surveilleParTitulaire: ex.surveilleParTitulaire ?? false }
      } else if (statut === 'tous' || statut === 'maintenu') {
        partData[ex.id] = { type: 'tous', eleves: [], nEleves: null, surveilleParTitulaire: ex.surveilleParTitulaire ?? false }
      } else if (eleves.length > 0) {
        partData[ex.id] = { type: 'liste', eleves, nEleves: eleves.length, surveilleParTitulaire: ex.surveilleParTitulaire ?? false }
      }
    }
  }

  const allGroupes = [...new Set(exams.map(e => e.groupe))].sort()
  const allProfs   = [...new Set(exams.map(e => e.profCode))].sort()

  // Collect manuscript classes from student el.classe fields not already in official groups
  const officialGroupSetUpper = new Set(allGroupes.map(g => g.toUpperCase()))
  const manuscriptGroupSet = new Set()
  for (const p of Object.values(partData)) {
    if (p.type !== 'liste') continue
    for (const el of p.eleves) {
      if (!el.classe) continue
      const norm = el.classe.trim().toUpperCase()
      if (!officialGroupSetUpper.has(norm)) manuscriptGroupSet.add(norm)
    }
  }
  const manuscriptGroupes = [...manuscriptGroupSet].sort()

  return (
    <>
      {/* Classic admin nav — hidden on print */}
      <div className="no-print" style={{ position: 'sticky', top: 0, zIndex: 50, background: 'var(--primary)', boxShadow: '0 2px 8px rgba(0,0,0,.18)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 16px', display: 'flex', alignItems: 'center', gap: 16, height: 52 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
            <img src="/logo.png" alt="Collège des Hayeffes" style={{ height: 38, width: 'auto', filter: 'brightness(0) invert(1)', flexShrink: 0 }} />
            <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,.2)', flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: '#fff', letterSpacing: '-.1px', flexShrink: 0 }}>Admin</span>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,.4)', marginLeft: 2 }}>— Juin 2026</span>
          </div>
          <nav style={{ display: 'flex', gap: 1, flexShrink: 0 }}>
            {[
              { href: '/admin?tab=suivi',   label: 'Suivi'    },
              { href: '/admin?tab=horaire', label: 'Horaire'  },
              { href: '/admin?tab=eleves',  label: 'Élèves'   },
              { href: '/admin?tab=verrous', label: 'Statuts'  },
              { href: '/admin/print',       label: 'Vues imprimables', active: true },
            ].map(({ href, label, active }) => (
              <a key={href} href={href} style={{
                padding: '6px 12px', borderRadius: 6, textDecoration: 'none',
                fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap',
                background: active ? 'rgba(255,255,255,.18)' : 'transparent',
                color: active ? '#fff' : 'rgba(255,255,255,.6)',
              }}>
                {label}
              </a>
            ))}
          </nav>
        </div>
      </div>
      <PrintViews exams={exams} partData={partData} allGroupes={allGroupes} allProfs={allProfs} manuscriptGroupes={manuscriptGroupes} locaux={locauxFinal} />
    </>
  )
}
