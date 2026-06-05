import { requireAdmin } from '@/lib/auth'
import { getAllResponses, getLocksData } from '@/actions/admin'
import exams from '@/lib/exams.json'
import HoraireTable from './HoraireTable'
import ElevesTable from './ElevesTable'
import ResetButton from './ResetButton'
import VerrousJourTable from './VerrousJourTable'
import ClasseTable from './ClasseTable'

const NIVEAUX = ['1re', '2e', '3e', '4e', '5e', '6e']
const ALL_PROF_CODES = [...new Set(exams.map(e => e.profCode))].sort()
const ALL_GROUPES    = [...new Set(exams.map(e => e.groupe))].sort()
const NIVEAUX_MAP    = Object.fromEntries(
  NIVEAUX.map(n => [n, [...new Set(exams.filter(e => e.niveau === n).map(e => e.groupe))].sort()])
)

// Status display config
const GS = {
  open:     { label: 'À remplir',          bg: '#F8FAFC', border: '#E2E8F0', text: '#475569', badgeClass: 'badge-gray' },
  annule:   { label: 'Annulé',             bg: '#FEF2F2', border: '#FECACA', text: '#991B1B', badgeClass: 'badge-red'  },
  maintenu: { label: 'Maintenu pour tous', bg: '#EFF6FF', border: '#BFDBFE', text: '#1E40AF', badgeClass: 'badge-blue' },
}

function formatJour(iso) {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('fr-BE', { weekday: 'short', day: 'numeric', month: 'short' })
}

export default async function AdminPage({ searchParams }) {
  await requireAdmin()
  const sp  = await searchParams
  const tab = sp?.tab ?? 'suivi'
  const vue = sp?.vue ?? 'jour'

  const [responses, locksData] = await Promise.all([getAllResponses(), getLocksData()])
  const groupeStatuts = locksData.groupeStatuts ?? {}
  const examStatuts   = locksData.examStatuts   ?? {}

  const respondedCodes = new Set(Object.keys(responses))

  // Profs whose ALL exams are admin-decided (annulé/maintenu) count as "done" without submission
  const adminDoneCodes = new Set(
    ALL_PROF_CODES.filter(code => {
      const profExams = exams.filter(e => e.profCode === code)
      return profExams.length > 0 && profExams.every(e => groupeStatuts[e.groupe])
    })
  )
  const effectiveDone = new Set([...respondedCodes, ...adminDoneCodes])
  const missing = ALL_PROF_CODES.filter(c => !effectiveDone.has(c))
  const pct = Math.round((effectiveDone.size / ALL_PROF_CODES.length) * 100)
  const showSuccess = sp?.ok === '1'

  // Build élèves rows (server-side, then pass to client for filter/sort)
  const elevesRows = []
  // First: admin-decided groupes
  for (const ex of exams) {
    const gs = groupeStatuts[ex.groupe]
    if (!gs) continue
    const base = { prof: ex.profCode, jour: ex.jour, periode: ex.periode, niveau: ex.niveau, groupe: ex.groupe, matiere: ex.matiere, local: ex.local, surveilleParTitulaire: false }
    if (gs === 'annule')   elevesRows.push({ ...base, nom: '',                   prenom: '', participation: "Annulé par l'administration" })
    if (gs === 'maintenu') elevesRows.push({ ...base, nom: '(tous les élèves)',   prenom: '', participation: 'Maintenu pour tous les élèves' })
  }
  // Then: prof-submitted for open groupes
  const coveredByAdmin = new Set(exams.filter(e => groupeStatuts[e.groupe]).map(e => e.id))
  for (const prof of Object.values(responses)) {
    for (const ex of prof.examens ?? []) {
      if (coveredByAdmin.has(ex.id)) continue
      const meta = exams.find(e => e.id === ex.id)
      if (!meta) continue
      const base = { prof: prof.profCode, jour: meta.jour, periode: meta.periode, niveau: meta.niveau, groupe: meta.groupe, matiere: meta.matiere, local: meta.local, surveilleParTitulaire: ex.surveilleParTitulaire ?? false }
      const statut = ex.statut ?? (ex.maintenu === true ? 'maintenu' : null)
      if (statut === 'aucun') {
        elevesRows.push({ ...base, nom: '', prenom: '', participation: 'Aucun élève' })
      } else if (statut === 'tous') {
        elevesRows.push({ ...base, nom: '(tous les élèves)', prenom: '', participation: 'Tous les élèves' })
      } else if (statut === 'maintenu') {
        elevesRows.push({ ...base, nom: '(examen maintenu)', prenom: '', participation: 'Examen maintenu' })
      } else {
        for (const el of ex.eleves ?? []) {
          if (!el.nom && !el.prenom) continue
          elevesRows.push({ ...base, nom: el.nom, prenom: el.prenom, participation: 'Liste nominative' })
        }
      }
    }
  }
  const elevesGroupes = [...new Set(elevesRows.map(r => r.groupe))].sort()
  const elevesProfs   = [...new Set(elevesRows.map(r => r.prof))].sort()

  return (
    <main style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 16px 48px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: '0 0 2px', fontSize: 18, fontWeight: 600, color: 'var(--fg)' }}>Dashboard admin</h1>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--fg-muted)' }}>Examens juin 2026 — Collège des Hayeffes</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <nav className="tab-bar">
            {[
              { name: 'suivi',   label: `Suivi (${respondedCodes.size}/${ALL_PROF_CODES.length})` },
              { name: 'horaire', label: 'Horaire' },
              { name: 'eleves',  label: 'Élèves' },
              { name: 'verrous', label: 'Statuts' },
            ].map(t => (
              <a key={t.name} href={`/admin?tab=${t.name}`} className={`tab${tab === t.name ? ' active' : ''}`}>
                {t.label}
              </a>
            ))}
          </nav>
          <ResetButton />
        </div>
      </div>

      {/* Exports */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <a href="/api/export?format=briefing" className="btn btn-secondary" style={{ fontSize: 12 }}>
          ⬇ Excel surveillance
        </a>
        <a href="/api/export?format=print" target="_blank" rel="noopener noreferrer" className="btn btn-secondary" style={{ fontSize: 12 }}>
          🖨 Vue globale
        </a>
        <a href="/admin/print" target="_blank" rel="noopener noreferrer" className="btn btn-secondary" style={{ fontSize: 12 }}>
          🖨 Vues par classe / prof / élève
        </a>
        <a href="/api/export?format=xlsx" className="btn btn-secondary" style={{ fontSize: 12 }}>
          ⬇ Excel liste élèves
        </a>
        <a href="/api/export?format=csv" className="btn btn-secondary" style={{ fontSize: 12 }}>
          ⬇ CSV liste élèves
        </a>
      </div>

      {showSuccess && (
        <div className="alert alert-success" role="status" style={{ marginBottom: 16, animation: 'fadeOut 0.4s ease 3s forwards' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
          Statuts mis à jour avec succès.
        </div>
      )}
      <style>{`@keyframes fadeOut { to { opacity:0; height:0; padding:0; margin:0; overflow:hidden; } }`}</style>

      {/* ── Suivi ──────────────────────────────────────────── */}
      {tab === 'suivi' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="card" style={{ padding: '24px 28px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
              <span style={{ fontSize: 32, fontWeight: 700, color: 'var(--fg)' }}>
                {effectiveDone.size} <span style={{ fontSize: 16, fontWeight: 400, color: 'var(--fg-muted)' }}>/ {ALL_PROF_CODES.length} profs</span>
              </span>
              <span style={{ fontSize: 20, fontWeight: 600, color: pct === 100 ? 'var(--success)' : 'var(--fg-muted)' }}>{pct}%</span>
            </div>
            <div style={{ width: '100%', background: 'var(--border)', borderRadius: 999, height: 8, overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, background: pct === 100 ? 'var(--success)' : 'var(--primary)', height: '100%', borderRadius: 999 }} />
            </div>
            {pct === 100 && <p style={{ margin: '12px 0 0', color: 'var(--success)', fontWeight: 500, fontSize: 14 }}>✓ Tous les profs ont répondu</p>}
          </div>
          {missing.length > 0 && (
            <div>
              <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)', margin: '0 0 10px' }}>En attente ({missing.length})</h2>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {missing.map(c => <span key={c} className="badge badge-amber">{c}</span>)}
              </div>
            </div>
          )}
          {respondedCodes.size > 0 && (
            <div>
              <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)', margin: '0 0 10px' }}>Formulaire soumis ({respondedCodes.size})</h2>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {[...respondedCodes].sort().map(c => <span key={c} className="badge badge-green">{c}</span>)}
              </div>
            </div>
          )}
          {adminDoneCodes.size > 0 && (
            <div>
              <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)', margin: '0 0 10px' }}>
                Traités par l'administration ({adminDoneCodes.size})
                <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--fg-muted)', marginLeft: 6 }}>tous leurs examens sont annulés ou maintenus</span>
              </h2>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {[...adminDoneCodes].sort().map(c => <span key={c} className="badge badge-blue">{c}</span>)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Horaire ────────────────────────────────────────── */}
      {tab === 'horaire' && (
        <HoraireTable exams={exams} responses={responses} groupeStatuts={groupeStatuts} />
      )}

      {/* ── Élèves ─────────────────────────────────────────── */}
      {tab === 'eleves' && (
        <ElevesTable rows={elevesRows} groupes={elevesGroupes} profs={elevesProfs} />
      )}

      {/* ── Statuts ────────────────────────────────────────── */}
      {tab === 'verrous' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Sous-onglets + légende */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <nav className="tab-bar">
              <a href="/admin?tab=verrous&vue=jour"    className={`tab${vue === 'jour'    ? ' active' : ''}`}>Par jour</a>
              <a href="/admin?tab=verrous&vue=classe"  className={`tab${vue === 'classe'  ? ' active' : ''}`}>Par classe</a>
            </nav>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {Object.entries(GS).map(([k, v]) => (
                <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 3, background: v.bg, border: `1.5px solid ${v.border}`, display: 'inline-block' }} />
                  <span style={{ color: v.text, fontWeight: 500 }}>{v.label}</span>
                </span>
              ))}
            </div>
          </div>

          {/* ── Vue par jour (client, filtrable) ── */}
          {vue === 'jour' && (
            <VerrousJourTable exams={exams} groupeStatuts={groupeStatuts} examStatuts={examStatuts} />
          )}

          {/* ── Vue par classe ── */}
          {vue === 'classe' && (
            <ClasseTable
              exams={exams}
              niveaux={NIVEAUX}
              niveauxMap={NIVEAUX_MAP}
              groupeStatuts={groupeStatuts}
              examStatuts={examStatuts}
            />
          )}
        </div>
      )}
    </main>
  )
}
