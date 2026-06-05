import { requireAdmin } from '@/lib/auth'
import { getAllResponses, getLocksData, setGroupeStatut, setNiveauStatut } from '@/actions/admin'
import exams from '@/lib/exams.json'
import HoraireTable from './HoraireTable'
import ElevesTable from './ElevesTable'
import ResetButton from './ResetButton'

const NIVEAUX = ['1re', '2e', '3e', '4e', '5e', '6e']
const ALL_PROF_CODES = [...new Set(exams.map(e => e.profCode))].sort()
const ALL_GROUPES    = [...new Set(exams.map(e => e.groupe))].sort()
const NIVEAUX_MAP    = Object.fromEntries(
  NIVEAUX.map(n => [n, [...new Set(exams.filter(e => e.niveau === n).map(e => e.groupe))].sort()])
)

// Status display config
const GS = {
  open:     { label: 'À remplir',         bg: '#FEFCE8', border: '#FDE68A', text: '#92400E', badgeClass: 'badge-amber' },
  annule:   { label: 'Annulé',            bg: '#FEF2F2', border: '#FECACA', text: '#991B1B', badgeClass: 'badge-red'   },
  maintenu: { label: 'Maintenu pour tous', bg: '#EFF6FF', border: '#BFDBFE', text: '#1E40AF', badgeClass: 'badge-blue'  },
}

function formatJour(iso) {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('fr-BE', { weekday: 'short', day: 'numeric', month: 'short' })
}

export default async function AdminPage({ searchParams }) {
  await requireAdmin()
  const sp  = await searchParams
  const tab = sp?.tab ?? 'suivi'

  const [responses, locksData] = await Promise.all([getAllResponses(), getLocksData()])
  const groupeStatuts = locksData.groupeStatuts ?? {}

  const respondedCodes = new Set(Object.keys(responses))
  const missing = ALL_PROF_CODES.filter(c => !respondedCodes.has(c))
  const pct = Math.round((respondedCodes.size / ALL_PROF_CODES.length) * 100)
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
                {respondedCodes.size} <span style={{ fontSize: 16, fontWeight: 400, color: 'var(--fg-muted)' }}>/ {ALL_PROF_CODES.length} profs</span>
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
              <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)', margin: '0 0 10px' }}>Codes manquants ({missing.length})</h2>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {missing.map(c => <span key={c} className="badge badge-amber">{c}</span>)}
              </div>
            </div>
          )}
          {respondedCodes.size > 0 && (
            <div>
              <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)', margin: '0 0 10px' }}>Réponses reçues ({respondedCodes.size})</h2>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {[...respondedCodes].sort().map(c => <span key={c} className="badge badge-green">{c}</span>)}
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

      {/* ── Statuts (verrous par classe) ───────────────────── */}
      {tab === 'verrous' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

          {/* Légende */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>Statuts :</span>
            {Object.entries(GS).map(([k, v]) => (
              <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: v.bg, border: `1.5px solid ${v.border}`, display: 'inline-block' }} />
                <span style={{ color: v.text, fontWeight: 500 }}>{v.label}</span>
              </span>
            ))}
          </div>

          {/* ── Par jour (lecture seule) ── */}
          {(() => {
            const examsParJour = [...exams].sort((a, b) =>
              a.jour.localeCompare(b.jour) || a.periode.localeCompare(b.periode) || a.groupe.localeCompare(b.groupe)
            )
            return (
              <div>
                <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--fg)', margin: '0 0 10px' }}>Par examen — vue par jour</h2>
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  <div style={{ overflowX: 'auto' }}>
                    <table className="table">
                      <thead>
                        <tr>{['Jour','Période','Matière','Niveau','Classe','Prof','Local','Statut classe'].map(h => <th key={h}>{h}</th>)}</tr>
                      </thead>
                      <tbody>
                        {examsParJour.map(ex => {
                          const gs   = groupeStatuts[ex.groupe] ?? 'open'
                          const info = GS[gs]
                          return (
                            <tr key={ex.id} style={{ background: info.bg }}>
                              <td style={{ whiteSpace: 'nowrap' }}>{formatJour(ex.jour)}</td>
                              <td>{ex.periode}</td>
                              <td style={{ fontWeight: 500 }}>{ex.matiere}</td>
                              <td>{ex.niveau}</td>
                              <td style={{ fontWeight: 600 }}>{ex.groupe}</td>
                              <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{ex.profCode}</td>
                              <td>{ex.local}</td>
                              <td><span className={`badge ${info.badgeClass}`} style={{ fontSize: 11 }}>{info.label}</span></td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )
          })()}

          {/* ── Par classe (éditable) ── */}
          <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--fg)', margin: '4px 0 -8px' }}>Par classe</h2>
          {NIVEAUX.map(n => {
            const groupesNiveau = NIVEAUX_MAP[n] ?? []
            const allSameStatut = groupesNiveau.length > 0 && groupesNiveau.every(g => groupeStatuts[g] === groupeStatuts[groupesNiveau[0]])
            const niveauStatut  = allSameStatut ? (groupeStatuts[groupesNiveau[0]] ?? 'open') : null

            return (
              <div key={n}>
                {/* Niveau header + mass actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--fg)', margin: 0 }}>{n}</h2>
                  <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{groupesNiveau.length} classe{groupesNiveau.length !== 1 ? 's' : ''}</span>
                  <div style={{ display: 'flex', gap: 4, marginLeft: 8 }}>
                    {[
                      { statut: 'open',     label: 'Tout ouvrir' },
                      { statut: 'annule',   label: 'Tout annuler' },
                      { statut: 'maintenu', label: 'Tout maintenir' },
                    ].map(({ statut, label }) => (
                      <form key={statut} action={setNiveauStatut}>
                        <input type="hidden" name="niveau" value={n} />
                        <input type="hidden" name="statut" value={statut} />
                        <button type="submit" className="btn btn-xs btn-secondary"
                          style={niveauStatut === statut
                            ? { background: GS[statut].bg, color: GS[statut].text, border: `1.5px solid ${GS[statut].border}`, fontSize: 11 }
                            : { fontSize: 11 }}>
                          {label}
                        </button>
                      </form>
                    ))}
                  </div>
                </div>

                {/* Classe rows */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {groupesNiveau.map(g => {
                    const gs = groupeStatuts[g] ?? 'open'
                    const info = GS[gs]
                    const nExams = exams.filter(e => e.groupe === g).length
                    return (
                      <div key={g} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 14px', borderRadius: 8,
                        background: info.bg, border: `1px solid ${info.border}`,
                        transition: 'background 0.15s',
                      }}>
                        <span style={{ fontWeight: 600, fontSize: 14, color: info.text, minWidth: 60 }}>{g}</span>
                        <span style={{ fontSize: 12, color: info.text, opacity: 0.7, flex: 1 }}>{nExams} exam{nExams !== 1 ? 's' : ''}</span>
                        <span className={`badge ${info.badgeClass}`} style={{ fontSize: 11 }}>{info.label}</span>
                        <div style={{ display: 'flex', gap: 3 }}>
                          {[
                            { statut: 'open',     label: 'À remplir' },
                            { statut: 'annule',   label: 'Annulé' },
                            { statut: 'maintenu', label: 'Maintenu' },
                          ].map(({ statut, label }) => (
                            <form key={statut} action={setGroupeStatut}>
                              <input type="hidden" name="groupe" value={g} />
                              <input type="hidden" name="statut" value={statut} />
                              <button type="submit"
                                className="btn btn-xs"
                                style={gs === statut
                                  ? { background: GS[statut].text, color: '#fff', fontSize: 11, border: 'none' }
                                  : { background: '#fff', color: '#64748B', border: '1px solid #E2E8F0', fontSize: 11 }}
                              >
                                {label}
                              </button>
                            </form>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </main>
  )
}
