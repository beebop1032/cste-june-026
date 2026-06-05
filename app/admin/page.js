import { requireAdmin } from '@/lib/auth'
import { getAllResponses, getLocksData, toggleLock, lockByNiveau, unlockByNiveau } from '@/actions/admin'
import exams from '@/lib/exams.json'

const NIVEAUX = ['1re', '2e', '3e', '4e', '5e', '6e']
const ALL_PROF_CODES = [...new Set(exams.map(e => e.profCode))].sort()

function formatJour(iso) {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('fr-BE', { weekday: 'short', day: 'numeric', month: 'short' })
}

export default async function AdminPage({ searchParams }) {
  await requireAdmin()
  const sp = await searchParams
  const tab = sp?.tab ?? 'suivi'

  const [responses, locksData] = await Promise.all([getAllResponses(), getLocksData()])
  const locked = new Set(locksData.locked)

  const respondedCodes = new Set(Object.keys(responses))
  const missing = ALL_PROF_CODES.filter(c => !respondedCodes.has(c))
  const pct = Math.round((respondedCodes.size / ALL_PROF_CODES.length) * 100)
  const showSuccess = sp?.ok === '1'

  return (
    <main style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 16px 48px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: '0 0 2px', fontSize: 18, fontWeight: 600, color: 'var(--fg)' }}>
            Dashboard admin
          </h1>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--fg-muted)' }}>Examens juin 2026 — Collège des Hayeffes</p>
        </div>

        <nav className="tab-bar">
          {[
            { name: 'suivi', label: `Suivi (${respondedCodes.size}/${ALL_PROF_CODES.length})` },
            { name: 'horaire', label: 'Horaire' },
            { name: 'eleves', label: 'Élèves' },
            { name: 'verrous', label: `Verrous (${locked.size})` },
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
          Verrous mis à jour avec succès.
        </div>
      )}
      <style>{`@keyframes fadeOut { to { opacity: 0; height: 0; padding: 0; margin: 0; overflow: hidden; } }`}</style>

      {/* ── Suivi ─────────────────────────────────────────────── */}
      {tab === 'suivi' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="card" style={{ padding: '24px 28px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
              <span style={{ fontSize: 32, fontWeight: 700, color: 'var(--fg)' }}>
                {respondedCodes.size} <span style={{ fontSize: 16, fontWeight: 400, color: 'var(--fg-muted)' }}>/ {ALL_PROF_CODES.length} profs</span>
              </span>
              <span style={{ fontSize: 20, fontWeight: 600, color: pct === 100 ? 'var(--success)' : 'var(--fg-muted)' }}>
                {pct}%
              </span>
            </div>
            <div style={{ width: '100%', background: 'var(--border)', borderRadius: 999, height: 8, overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, background: pct === 100 ? 'var(--success)' : 'var(--primary)', height: '100%', borderRadius: 999, transition: 'width 0.3s ease' }} />
            </div>
            {pct === 100 && (
              <p style={{ margin: '12px 0 0', color: 'var(--success)', fontWeight: 500, fontSize: 14 }}>
                ✓ Tous les profs ont répondu
              </p>
            )}
          </div>

          {missing.length > 0 && (
            <div>
              <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)', margin: '0 0 10px' }}>
                Codes manquants ({missing.length})
              </h2>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {missing.map(c => (
                  <span key={c} className="badge badge-amber">{c}</span>
                ))}
              </div>
            </div>
          )}

          {respondedCodes.size > 0 && (
            <div>
              <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)', margin: '0 0 10px' }}>
                Réponses reçues ({respondedCodes.size})
              </h2>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {[...respondedCodes].sort().map(c => (
                  <span key={c} className="badge badge-green">{c}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Horaire ────────────────────────────────────────────── */}
      {tab === 'horaire' && (() => {
        const badge = {}
        for (const ex of exams) {
          if (locked.has(ex.id)) { badge[ex.id] = { label: 'Complet', type: 'gray' }; continue }
          const profResp = responses[ex.profCode]
          if (!profResp) { badge[ex.id] = { label: '—', type: 'gray' }; continue }
          const exResp = profResp.examens?.find(e => e.id === ex.id)
          if (!exResp) { badge[ex.id] = { label: '—', type: 'gray' }; continue }
          if (exResp.eleves.length === 0) { badge[ex.id] = { label: 'Annulé', type: 'red' }; continue }
          badge[ex.id] = { label: `${exResp.eleves.length} élève(s)`, type: 'green' }
        }
        return (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    {['Jour', 'Période', 'Matière', 'Niveau', 'Groupe', 'Prof', 'Local', 'Statut'].map(h => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
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

      {/* ── Élèves ─────────────────────────────────────────────── */}
      {tab === 'eleves' && (() => {
        const rows = []
        for (const prof of Object.values(responses)) {
          for (const ex of prof.examens ?? []) {
            const meta = exams.find(e => e.id === ex.id)
            if (!meta || ex.eleves.length === 0) continue
            for (const el of ex.eleves) {
              rows.push({ ...meta, nom: el.nom, prenom: el.prenom, surveille: ex.surveilleParTitulaire })
            }
          }
        }
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <a href="/api/export?format=csv" className="btn btn-sm" style={{ background: 'var(--success)', color: '#fff', textDecoration: 'none' }}>
                Export CSV
              </a>
              <a href="/api/export?format=xlsx" className="btn btn-sm" style={{ background: 'var(--primary)', color: '#fff', textDecoration: 'none' }}>
                Export XLSX
              </a>
              <span style={{ fontSize: 13, color: 'var(--fg-muted)' }}>{rows.length} élève(s) au total</span>
            </div>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table className="table">
                  <thead>
                    <tr>
                      {['Prof', 'Jour', 'Période', 'Niveau', 'Groupe', 'Matière', 'Local', 'Nom', 'Prénom', 'Surveille'].map(h => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
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
                        <td style={{ fontWeight: 500 }}>{r.nom}</td>
                        <td>{r.prenom}</td>
                        <td>
                          <span className={`badge badge-${r.surveille ? 'blue' : 'gray'}`}>
                            {r.surveille ? 'Oui' : 'Non'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length === 0 && (
                <p style={{ color: 'var(--fg-muted)', margin: '24px 20px', fontSize: 14 }}>Aucune réponse reçue.</p>
              )}
            </div>
          </div>
        )
      })()}

      {/* ── Verrous ────────────────────────────────────────────── */}
      {tab === 'verrous' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)', margin: '0 0 12px' }}>Par niveau</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
              {NIVEAUX.map(n => {
                const total = exams.filter(e => e.niveau === n).length
                const nLocked = exams.filter(e => e.niveau === n && locked.has(e.id)).length
                const allLocked = nLocked === total
                return (
                  <div key={n} className="card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10, borderColor: allLocked ? '#BBF7D0' : 'var(--border)', background: allLocked ? '#F0FDF4' : 'var(--bg-card)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <span style={{ fontWeight: 700, fontSize: 18, color: 'var(--fg)' }}>{n}</span>
                      <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{nLocked}/{total}</span>
                    </div>
                    <div style={{ width: '100%', background: 'var(--border)', borderRadius: 999, height: 4, overflow: 'hidden' }}>
                      <div style={{ width: `${(nLocked / total) * 100}%`, background: allLocked ? 'var(--success)' : 'var(--primary)', height: '100%', borderRadius: 999 }} />
                    </div>
                    <form action={allLocked ? unlockByNiveau : lockByNiveau}>
                      <input type="hidden" name="niveau" value={n} />
                      <button type="submit" className={`btn btn-sm${allLocked ? ' btn-secondary' : ''}`} style={{ width: '100%', ...(allLocked ? {} : { background: 'var(--primary)', color: '#fff' }) }}>
                        {allLocked ? 'Déverrouiller' : 'Verrouiller'}
                      </button>
                    </form>
                  </div>
                )
              })}
            </div>
          </div>

          <div>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)', margin: '0 0 10px' }}>
              Par examen <span style={{ color: 'var(--fg-muted)', fontWeight: 400 }}>({locked.size} verrouillé(s) sur {exams.length})</span>
            </h2>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table className="table">
                  <thead>
                    <tr>
                      {['Matière', 'Niveau', 'Groupe', 'Prof', 'Jour', 'Période', 'Local', 'État'].map(h => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {exams.map(ex => (
                      <tr key={ex.id} style={{ background: locked.has(ex.id) ? '#F0FDF4' : undefined }}>
                        <td style={{ fontWeight: 500 }}>{ex.matiere}</td>
                        <td>{ex.niveau}</td>
                        <td>{ex.groupe}</td>
                        <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{ex.profCode}</td>
                        <td>{formatJour(ex.jour)}</td>
                        <td>{ex.periode}</td>
                        <td>{ex.local}</td>
                        <td>
                          <form action={toggleLock}>
                            <input type="hidden" name="examId" value={ex.id} />
                            <button
                              type="submit"
                              className={`btn btn-xs ${locked.has(ex.id) ? 'btn-secondary' : ''}`}
                              style={locked.has(ex.id) ? {} : { background: 'var(--primary)', color: '#fff' }}
                            >
                              {locked.has(ex.id) ? 'Déverrouiller' : 'Verrouiller'}
                            </button>
                          </form>
                        </td>
                      </tr>
                    ))}
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
