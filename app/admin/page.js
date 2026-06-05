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
    <>
    {/* ── Top bar ── */}
    <div style={{ background: 'var(--primary)', boxShadow: '0 2px 8px rgba(0,0,0,.18)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 16px', display: 'flex', alignItems: 'center', gap: 16, height: 52, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
          <img src="/logo.png" alt="" width={90} height={36} style={{ height: 30, width: 'auto', filter: 'brightness(0) invert(1)', opacity: .9 }} />
          <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,.2)' }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#fff', letterSpacing: '-.1px' }}>Admin</span>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,.45)', marginLeft: 2 }}>— Examens juin 2026</span>
        </div>
        <nav style={{ display: 'flex', gap: 2 }}>
          {[
            { name: 'suivi',   label: `Suivi ${respondedCodes.size}/${ALL_PROF_CODES.length}` },
            { name: 'horaire', label: 'Horaire' },
            { name: 'eleves',  label: 'Élèves' },
            { name: 'verrous', label: 'Statuts' },
          ].map(t => (
            <a key={t.name} href={`/admin?tab=${t.name}`} style={{
              padding: '6px 13px',
              borderRadius: 6,
              textDecoration: 'none',
              fontSize: 13,
              fontWeight: 500,
              transition: 'background .15s, color .15s',
              background: tab === t.name ? 'rgba(255,255,255,.18)' : 'transparent',
              color: tab === t.name ? '#fff' : 'rgba(255,255,255,.6)',
            }}>
              {t.label}
            </a>
          ))}
        </nav>
        <ResetButton />
      </div>
    </div>

    <main style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 16px 48px' }}>

      {/* Exports bar */}
      <div style={{
        display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18,
        padding: '12px 16px', background: 'var(--bg-card)', borderRadius: 'var(--radius)',
        border: '1px solid var(--border)', boxShadow: 'var(--shadow-xs)',
        alignItems: 'center',
      }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-subtle)', textTransform: 'uppercase', letterSpacing: '.07em', marginRight: 6 }}>Exports</span>
        <a href="/api/export?format=briefing" className="btn btn-secondary btn-sm">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Excel surveillance
        </a>
        <a href="/api/export?format=xlsx" className="btn btn-secondary btn-sm">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Excel élèves
        </a>
        <a href="/api/export?format=csv" className="btn btn-secondary btn-sm">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          CSV
        </a>
        <div style={{ width: 1, height: 18, background: 'var(--border)' }} />
        <a href="/api/export?format=print" target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
          Vue globale
        </a>
        <a href="/admin/print" target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
          Vue par classe / prof / élève
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

      {/* ── Suivi ──────────────────────────────────────────── */}
      {tab === 'suivi' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Progress card */}
          <div className="card" style={{ padding: '20px 24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, gap: 12 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 36, fontWeight: 700, color: 'var(--fg)', lineHeight: 1 }}>{effectiveDone.size}</span>
                  <span style={{ fontSize: 15, color: 'var(--fg-muted)' }}>/ {ALL_PROF_CODES.length} profs</span>
                </div>
                <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--fg-muted)' }}>
                  {missing.length > 0 ? `${missing.length} encore en attente` : 'Tous les profs ont répondu'}
                </p>
              </div>
              <div style={{
                width: 56, height: 56, borderRadius: '50%',
                background: pct === 100 ? 'var(--success-bg)' : 'var(--primary-light)',
                border: `3px solid ${pct === 100 ? 'var(--success)' : 'var(--primary)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: pct === 100 ? 'var(--success)' : 'var(--primary)' }}>{pct}%</span>
              </div>
            </div>
            <div style={{ width: '100%', background: 'var(--border)', borderRadius: 999, height: 7, overflow: 'hidden' }}>
              <div style={{
                width: `${pct}%`, height: '100%', borderRadius: 999,
                background: pct === 100 ? 'var(--success)' : 'var(--primary)',
                transition: 'width 0.4s ease',
              }} />
            </div>
          </div>

          {missing.length > 0 && (
            <div className="card" style={{ padding: '16px 20px' }}>
              <h2 style={{ fontSize: 12, fontWeight: 700, color: 'var(--fg-muted)', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                En attente — {missing.length}
              </h2>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {missing.map(c => <span key={c} className="badge badge-amber">{c}</span>)}
              </div>
            </div>
          )}

          {respondedCodes.size > 0 && (
            <div className="card" style={{ padding: '16px 20px' }}>
              <h2 style={{ fontSize: 12, fontWeight: 700, color: 'var(--fg-muted)', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                Formulaire soumis — {respondedCodes.size}
              </h2>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {[...respondedCodes].sort().map(c => <span key={c} className="badge badge-green">{c}</span>)}
              </div>
            </div>
          )}

          {adminDoneCodes.size > 0 && (
            <div className="card" style={{ padding: '16px 20px' }}>
              <h2 style={{ fontSize: 12, fontWeight: 700, color: 'var(--fg-muted)', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                Traités par l'administration — {adminDoneCodes.size}
                <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginLeft: 6 }}>tous leurs examens sont annulés ou maintenus</span>
              </h2>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
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
    </>
  )
}
