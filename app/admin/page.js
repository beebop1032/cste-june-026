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

  const thStyle = { padding: '8px 12px', textAlign: 'left', background: '#f0f0f0', fontWeight: 600, borderBottom: '2px solid #ddd', whiteSpace: 'nowrap', fontSize: 12 }
  const tdStyle = { padding: '6px 12px', verticalAlign: 'top', fontSize: 12 }

  function TabLink({ name, label }) {
    const active = tab === name
    return (
      <a href={`/admin?tab=${name}`} style={{
        padding: '8px 18px', borderRadius: 8, textDecoration: 'none',
        background: active ? '#1a1a2e' : '#e9e9e9',
        color: active ? '#fff' : '#333',
        fontSize: 14, fontWeight: active ? 600 : 400,
      }}>
        {label}
      </a>
    )
  }

  return (
    <main style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>Dashboard admin — Examens juin 2026</h1>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <TabLink name="suivi" label={`Suivi (${respondedCodes.size}/${ALL_PROF_CODES.length})`} />
          <TabLink name="horaire" label="Horaire" />
          <TabLink name="eleves" label="Élèves" />
          <TabLink name="verrous" label={`Verrous (${locked.size})`} />
        </div>
      </div>

      {tab === 'suivi' && (
        <div>
          <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
            {respondedCodes.size} / {ALL_PROF_CODES.length} profs ont répondu
          </div>
          <div style={{ width: '100%', background: '#e9e9e9', borderRadius: 8, height: 12, marginBottom: 24, overflow: 'hidden' }}>
            <div style={{ width: `${(respondedCodes.size / ALL_PROF_CODES.length) * 100}%`, background: '#28a745', height: '100%', borderRadius: 8 }} />
          </div>
          {missing.length > 0 && (
            <>
              <h2 style={{ fontSize: 16, marginBottom: 12 }}>Codes manquants ({missing.length})</h2>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {missing.map(c => (
                  <span key={c} style={{ padding: '4px 12px', background: '#fff3cd', border: '1px solid #ffc107', borderRadius: 20, fontSize: 13 }}>
                    {c}
                  </span>
                ))}
              </div>
            </>
          )}
          {missing.length === 0 && (
            <p style={{ color: '#28a745', fontWeight: 600 }}>✓ Tous les profs ont répondu !</p>
          )}
        </div>
      )}

      {tab === 'horaire' && (() => {
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
        return (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  {['Jour', 'Période', 'Matière', 'Niveau', 'Groupe', 'Prof', 'Local', 'Statut'].map(h => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
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
                      <td style={{ ...tdStyle, fontWeight: 600, color: b.color }}>{b.label}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      })()}

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
          <div>
            <div style={{ marginBottom: 16, display: 'flex', gap: 12 }}>
              <a href="/api/export?format=csv" style={{ padding: '8px 18px', background: '#28a745', color: '#fff', borderRadius: 8, textDecoration: 'none', fontSize: 14 }}>
                Export CSV
              </a>
              <a href="/api/export?format=xlsx" style={{ padding: '8px 18px', background: '#007bff', color: '#fff', borderRadius: 8, textDecoration: 'none', fontSize: 14 }}>
                Export XLSX
              </a>
              <span style={{ fontSize: 13, color: '#666', alignSelf: 'center' }}>{rows.length} élève(s) au total</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead>
                  <tr>
                    {['Prof', 'Jour', 'Période', 'Niveau', 'Groupe', 'Matière', 'Local', 'Nom', 'Prénom', 'Surveille'].map(h => (
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
      })()}

      {tab === 'verrous' && (
        <div>
          <div style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: 16, marginBottom: 12 }}>Verrouiller par niveau</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {NIVEAUX.map(n => (
                <div key={n} style={{ display: 'flex', gap: 4 }}>
                  <form action={lockByNiveau}>
                    <input type="hidden" name="niveau" value={n} />
                    <button type="submit" style={{ padding: '6px 14px', background: '#6c757d', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
                      🔒 Tout {n}
                    </button>
                  </form>
                  <form action={unlockByNiveau}>
                    <input type="hidden" name="niveau" value={n} />
                    <button type="submit" style={{ padding: '6px 14px', background: '#fff', color: '#6c757d', border: '1px solid #6c757d', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
                      🔓 Tout {n}
                    </button>
                  </form>
                </div>
              ))}
            </div>
          </div>

          <h2 style={{ fontSize: 16, marginBottom: 12 }}>Par examen ({locked.size} verrouillé(s) sur {exams.length})</h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  {['Matière', 'Niveau', 'Groupe', 'Prof', 'Jour', 'Période', 'Local', 'État'].map(h => (
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
                          whiteSpace: 'nowrap',
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
      )}
    </main>
  )
}
