import { requireAdmin } from '@/lib/auth'
import { getAllResponses, getLocksData, setExamStatut, setNiveauStatut } from '@/actions/admin'
import exams from '@/lib/exams.json'

const NIVEAUX = ['1re', '2e', '3e', '4e', '5e', '6e']
const ALL_PROF_CODES = [...new Set(exams.map(e => e.profCode))].sort()
const GROUPES = [...new Set(exams.map(e => e.groupe))].sort()

function formatJour(iso) {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('fr-BE', { weekday: 'short', day: 'numeric', month: 'short' })
}

const STATUT_INFO = {
  open:     { label: 'Ouvert',   badgeClass: 'badge-green',  bg: 'transparent' },
  locked:   { label: 'Verrouillé', badgeClass: 'badge-gray', bg: '#F8FAFC' },
  annule:   { label: 'Annulé',   badgeClass: 'badge-amber',  bg: '#FFFBEB' },
  supprime: { label: 'Supprimé', badgeClass: 'badge-red',    bg: '#FEF2F2' },
}

export default async function AdminPage({ searchParams }) {
  await requireAdmin()
  const sp = await searchParams
  const tab = sp?.tab ?? 'suivi'

  const [responses, locksData] = await Promise.all([getAllResponses(), getLocksData()])
  const statuts = locksData.statuts ?? {}

  const respondedCodes = new Set(Object.keys(responses))
  const missing = ALL_PROF_CODES.filter(c => !respondedCodes.has(c))
  const pct = Math.round((respondedCodes.size / ALL_PROF_CODES.length) * 100)
  const showSuccess = sp?.ok === '1'

  function examStatut(examId) { return statuts[examId] ?? 'open' }

  return (
    <main style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 16px 48px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: '0 0 2px', fontSize: 18, fontWeight: 600, color: 'var(--fg)' }}>Dashboard admin</h1>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--fg-muted)' }}>Examens juin 2026 — Collège des Hayeffes</p>
        </div>
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
      {tab === 'horaire' && (() => {
        const badge = {}
        for (const ex of exams) {
          const st = examStatut(ex.id)
          if (st === 'supprime') { badge[ex.id] = { label: 'Supprimé', type: 'red' }; continue }
          if (st === 'annule')   { badge[ex.id] = { label: 'Annulé',   type: 'amber' }; continue }
          if (st === 'locked')   { badge[ex.id] = { label: 'Verrouillé', type: 'gray' }; continue }
          const profResp = responses[ex.profCode]
          if (!profResp) { badge[ex.id] = { label: '—', type: 'gray' }; continue }
          const exResp = profResp.examens?.find(e => e.id === ex.id)
          if (!exResp) { badge[ex.id] = { label: '—', type: 'gray' }; continue }
          if (exResp.statut === 'tous')     { badge[ex.id] = { label: 'Tous les élèves', type: 'green' }; continue }
          if (exResp.statut === 'maintenu') { badge[ex.id] = { label: 'Maintenu', type: 'blue' }; continue }
          if (exResp.statut === 'aucun' || exResp.eleves?.length === 0) { badge[ex.id] = { label: 'Annulé', type: 'red' }; continue }
          badge[ex.id] = { label: `${exResp.eleves.length} élève(s)`, type: 'green' }
        }
        return (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>{['Jour','Période','Matière','Niveau','Groupe','Prof','Local','Statut'].map(h => <th key={h}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {exams.map(ex => {
                    const b = badge[ex.id] ?? { label: '—', type: 'gray' }
                    return (
                      <tr key={ex.id}>
                        <td>{formatJour(ex.jour)}</td>
                        <td>{ex.periode}</td>
                        <td style={{ fontWeight: 500 }}>{ex.matiere}</td>
                        <td>{ex.niveau}</td>
                        <td>{ex.groupe}</td>
                        <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{ex.profCode}</td>
                        <td>{ex.local}</td>
                        <td><span className={`badge badge-${b.type}`}>{b.label}</span></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      })()}

      {/* ── Élèves ─────────────────────────────────────────── */}
      {tab === 'eleves' && (() => {
        const rows = []
        for (const prof of Object.values(responses)) {
          for (const ex of prof.examens ?? []) {
            const meta = exams.find(e => e.id === ex.id)
            if (!meta) continue
            if (ex.statut === 'tous') {
              rows.push({ ...meta, nom: '(tous les élèves)', prenom: '', surveille: ex.surveilleParTitulaire, statut: 'tous' })
            } else if (ex.statut === 'maintenu') {
              rows.push({ ...meta, nom: '(examen maintenu)', prenom: '', surveille: ex.surveilleParTitulaire, statut: 'maintenu' })
            } else {
              for (const el of ex.eleves ?? []) {
                rows.push({ ...meta, nom: el.nom, prenom: el.prenom, surveille: ex.surveilleParTitulaire, statut: 'liste' })
              }
            }
          }
        }

        const groupes = [...new Set(rows.map(r => r.groupe))].sort()
        const profs   = [...new Set(rows.map(r => r.profCode))].sort()

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>Export global :</span>
              <a href="/api/export?format=csv"  className="btn btn-sm" style={{ background: 'var(--success)', color: '#fff', textDecoration: 'none' }}>CSV</a>
              <a href="/api/export?format=xlsx" className="btn btn-sm" style={{ background: 'var(--primary)', color: '#fff', textDecoration: 'none' }}>XLSX</a>
              <span style={{ fontSize: 13, color: 'var(--fg-muted)', marginLeft: 4 }}>{rows.length} ligne(s)</span>
            </div>

            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <div>
                <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>Par classe :</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {groupes.map(g => (
                    <a key={g} href={`/api/export?format=csv&groupe=${encodeURIComponent(g)}`}
                       className="btn btn-secondary btn-xs" style={{ textDecoration: 'none' }}>
                      {g}
                    </a>
                  ))}
                </div>
              </div>
              <div>
                <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>Par prof :</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {profs.map(p => (
                    <a key={p} href={`/api/export?format=csv&prof=${encodeURIComponent(p)}`}
                       className="btn btn-secondary btn-xs" style={{ textDecoration: 'none', fontFamily: 'monospace', fontSize: 11 }}>
                      {p}
                    </a>
                  ))}
                </div>
              </div>
            </div>

            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table className="table">
                  <thead>
                    <tr>{['Prof','Jour','Période','Niveau','Groupe','Matière','Local','Nom','Prénom','Surveille'].map(h => <th key={h}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i}>
                        <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.profCode}</td>
                        <td>{formatJour(r.jour)}</td>
                        <td>{r.periode}</td>
                        <td>{r.niveau}</td>
                        <td>{r.groupe}</td>
                        <td style={{ fontWeight: 500 }}>{r.matiere}</td>
                        <td>{r.local}</td>
                        <td style={{ fontWeight: r.statut !== 'liste' ? 400 : 500, fontStyle: r.statut !== 'liste' ? 'italic' : 'normal', color: r.statut !== 'liste' ? 'var(--fg-muted)' : 'var(--fg)' }}>{r.nom}</td>
                        <td>{r.prenom}</td>
                        <td><span className={`badge badge-${r.surveille ? 'blue' : 'gray'}`}>{r.surveille ? 'Oui' : 'Non'}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length === 0 && <p style={{ color: 'var(--fg-muted)', margin: '24px 20px', fontSize: 14 }}>Aucune réponse reçue.</p>}
            </div>
          </div>
        )
      })()}

      {/* ── Statuts (verrous) ──────────────────────────────── */}
      {tab === 'verrous' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* Par niveau */}
          <div>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)', margin: '0 0 12px' }}>Par niveau</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
              {NIVEAUX.map(n => {
                const nExams  = exams.filter(e => e.niveau === n)
                const counts  = { open: 0, locked: 0, annule: 0, supprime: 0 }
                nExams.forEach(e => { counts[examStatut(e.id)] = (counts[examStatut(e.id)] ?? 0) + 1 })
                const total   = nExams.length
                const nOpen   = counts.open ?? 0
                return (
                  <div key={n} className="card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <span style={{ fontWeight: 700, fontSize: 18, color: 'var(--fg)' }}>{n}</span>
                      <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{nOpen} ouvert{nOpen !== 1 ? 's' : ''}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                      {counts.locked   > 0 && <span className="badge badge-gray"   style={{ fontSize: 11 }}>{counts.locked} verr.</span>}
                      {counts.annule   > 0 && <span className="badge badge-amber"  style={{ fontSize: 11 }}>{counts.annule} ann.</span>}
                      {counts.supprime > 0 && <span className="badge badge-red"    style={{ fontSize: 11 }}>{counts.supprime} supp.</span>}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {[
                        { statut: 'locked',   label: 'Verrouiller tout' },
                        { statut: 'annule',   label: 'Annuler tout' },
                        { statut: 'supprime', label: 'Supprimer tout' },
                        { statut: 'open',     label: 'Tout ouvrir' },
                      ].map(({ statut, label }) => (
                        <form key={statut} action={setNiveauStatut}>
                          <input type="hidden" name="niveau" value={n} />
                          <input type="hidden" name="statut" value={statut} />
                          <button type="submit" className="btn btn-xs btn-secondary" style={{ width: '100%', fontSize: 11 }}>
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

          {/* Par examen */}
          <div>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)', margin: '0 0 10px' }}>Par examen</h2>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table className="table">
                  <thead>
                    <tr>{['Matière','Niveau','Groupe','Prof','Jour','Période','Local','Statut actuel','Action'].map(h => <th key={h}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {exams.map(ex => {
                      const st = examStatut(ex.id)
                      const info = STATUT_INFO[st] ?? STATUT_INFO.open
                      return (
                        <tr key={ex.id} style={{ background: info.bg }}>
                          <td style={{ fontWeight: 500 }}>{ex.matiere}</td>
                          <td>{ex.niveau}</td>
                          <td>{ex.groupe}</td>
                          <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{ex.profCode}</td>
                          <td>{formatJour(ex.jour)}</td>
                          <td>{ex.periode}</td>
                          <td>{ex.local}</td>
                          <td><span className={`badge ${info.badgeClass}`}>{info.label}</span></td>
                          <td>
                            <form action={setExamStatut} style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                              <input type="hidden" name="examId" value={ex.id} />
                              {[
                                { statut: 'open',     label: 'Ouvert',    cls: 'btn-secondary' },
                                { statut: 'locked',   label: 'Verr.',     cls: '' },
                                { statut: 'annule',   label: 'Annulé',    cls: '' },
                                { statut: 'supprime', label: 'Supprimé',  cls: '' },
                              ].map(({ statut, label, cls }) => (
                                <button
                                  key={statut}
                                  type="submit"
                                  name="statut"
                                  value={statut}
                                  className={`btn btn-xs ${st === statut ? 'btn-primary' : cls || 'btn-secondary'}`}
                                  style={st === statut ? { background: 'var(--primary)', color: '#fff' } : {}}
                                >
                                  {label}
                                </button>
                              ))}
                            </form>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
