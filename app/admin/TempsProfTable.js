'use client'
import { useState, useMemo } from 'react'

const MAINTENU_COPIES = 25
const FEW_THRESHOLD   = 10

function downloadCSV(rows) {
  const headers = ['Prof', 'Examens', 'Copies totales', 'Annulés', 'Maintenus/Tous (×25)', 'Liste (nb exam)', 'Copies liste', 'En attente']
  const lines = [
    headers.join(';'),
    ...rows.map(r => [
      r.profCode, r.examens, r.copies, r.annules, r.maintenu, r.liste, r.copiesListe, r.pending,
    ].map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')),
  ].join('\r\n')
  const blob = new Blob(['﻿' + lines], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = 'temps-prof.csv'; a.click()
  URL.revokeObjectURL(url)
}

function formatJour(iso) {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'short' })
}

function formatJourShort(iso) {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('fr-BE', { weekday: 'short', day: 'numeric', month: 'short' })
}

const DownloadIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/>
    <line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
)

const SortIcon = ({ field, sortField, sortDir }) => {
  if (sortField !== field) return <span style={{ opacity: 0.3, fontSize: 10 }}>↕</span>
  return <span style={{ fontSize: 10 }}>{sortDir === 1 ? '↑' : '↓'}</span>
}

export default function TempsProfTable({ rows: initialRows, hints = [], examDetails = [] }) {
  const [view,      setView]      = useState('prof')
  const [sortField, setSortField] = useState('copies')
  const [sortDir,   setSortDir]   = useState(-1)
  const [fusionOnly, setFusionOnly] = useState(false)

  // ── Par prof: sort ──────────────────────────────────────────────────────────
  function toggleSort(field) {
    if (sortField === field) setSortDir(d => -d)
    else { setSortField(field); setSortDir(field === 'profCode' ? 1 : -1) }
  }

  const profRows = useMemo(() => {
    return [...initialRows].sort((a, b) => {
      const va = a[sortField], vb = b[sortField]
      if (typeof va === 'string') return va.localeCompare(vb) * sortDir
      return (va - vb) * sortDir
    })
  }, [initialRows, sortField, sortDir])

  const totalCopies = profRows.reduce((s, r) => s + r.copies, 0)
  const totalExams  = profRows.reduce((s, r) => s + r.examens, 0)

  // ── Vue globale: fusion lookup ─────────────────────────────────────────────
  // Key: profCode|jour|periode|matiere|groupe → { others, total }
  const fusionByKey = useMemo(() => {
    const map = new Map()
    for (const h of hints) {
      for (const item of h.items) {
        const k = `${item.profCode}|${item.jour}|${item.periode}|${item.matiere}|${item.groupe}`
        const others = h.items.filter(o => !(o.matiere === item.matiere && o.groupe === item.groupe))
        map.set(k, { others, total: h.total })
      }
    }
    return map
  }, [hints])

  const globalRows = useMemo(() => {
    let rows = [...examDetails].sort((a, b) =>
      a.jour.localeCompare(b.jour) || a.profCode.localeCompare(b.profCode) || a.periode.localeCompare(b.periode)
    )
    if (fusionOnly) {
      rows = rows.filter(r => fusionByKey.has(`${r.profCode}|${r.jour}|${r.periode}|${r.matiere}|${r.groupe}`))
    }
    return rows
  }, [examDetails, fusionByKey, fusionOnly])

  // ── Styles helpers ──────────────────────────────────────────────────────────
  const thS = (align = 'right') => ({
    padding: '7px 10px', textAlign: align, fontSize: 11, fontWeight: 700,
    color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '.06em',
    background: 'var(--bg)', borderBottom: '2px solid var(--border)',
    cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
  })
  const tdS = (align = 'right', extra = {}) => ({
    padding: '5px 10px', fontSize: 12.5, textAlign: align,
    borderBottom: '1px solid var(--border)', verticalAlign: 'middle', ...extra,
  })

  // ── Type badge for global view ──────────────────────────────────────────────
  function copiesBadge(row) {
    if (row.type === 'annule')   return <span style={{ color: '#B91C1C', fontStyle: 'italic', fontSize: 11 }}>Annulé</span>
    if (row.type === 'pending')  return <span style={{ background: '#FFFBEB', color: '#92400E', padding: '1px 6px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>?</span>
    if (row.type === 'maintenu') return <span style={{ background: '#EFF6FF', color: '#1E40AF', padding: '1px 6px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>~{MAINTENU_COPIES}</span>
    if (row.copies === 0)        return <span style={{ color: 'var(--fg-subtle)', fontSize: 11 }}>0</span>
    return <span style={{ background: '#F0FDF4', color: '#15803D', padding: '1px 6px', borderRadius: 4, fontSize: 12, fontWeight: 700 }}>{row.copies}</span>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* ── Sous-onglets ───────────────────────────────────────────────────── */}
      <nav className="tab-bar">
        <button className={`tab${view === 'prof'   ? ' active' : ''}`} onClick={() => setView('prof')}>
          Par prof
        </button>
        <button className={`tab${view === 'global' ? ' active' : ''}`} onClick={() => setView('global')}>
          Vue globale proposition
          {hints.length > 0 && (
            <span style={{ marginLeft: 6, background: '#FFFBEB', color: '#92400E', border: '1px solid #FDE68A', padding: '0px 6px', borderRadius: 99, fontSize: 11, fontWeight: 700 }}>
              {hints.length}
            </span>
          )}
        </button>
      </nav>

      {/* ══════════════════════════════════════════════════════════════════════
          VUE PAR PROF
      ══════════════════════════════════════════════════════════════════════ */}
      {view === 'prof' && (
        <>
          {/* En-tête totaux + export */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', gap: 12 }}>
              <div className="card" style={{ padding: '10px 18px', display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontSize: 24, fontWeight: 700, color: 'var(--fg)', lineHeight: 1 }}>{totalCopies}</span>
                <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>copies estimées</span>
              </div>
              <div className="card" style={{ padding: '10px 18px', display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontSize: 24, fontWeight: 700, color: 'var(--fg)', lineHeight: 1 }}>{profRows.length}</span>
                <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>profs · {totalExams} examens</span>
              </div>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => downloadCSV(profRows)}>
              <DownloadIcon /> Export CSV
            </button>
          </div>
          <div style={{ fontSize: 11, color: 'var(--fg-muted)', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <span>Hypothèse : <strong>"Examen maintenu"&nbsp;= {MAINTENU_COPIES}&nbsp;élèves</strong></span>
            <span>·</span>
            <span>"En attente" = formulaire non rempli, copies non comptées</span>
          </div>

          {/* Tableau par prof */}
          <div className="card" style={{ overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {[
                    { field: 'profCode', label: 'Prof',             align: 'left'  },
                    { field: 'examens',  label: 'Nb examens',       align: 'right' },
                    { field: 'copies',   label: 'Copies totales',   align: 'right' },
                    { field: 'annules',  label: 'Annulés',          align: 'right' },
                    { field: 'maintenu', label: 'Maintenu / Tous',  align: 'right' },
                    { field: 'liste',    label: 'Liste nominative', align: 'right' },
                    { field: 'pending',  label: 'En attente',       align: 'right' },
                  ].map(({ field, label, align }) => (
                    <th key={field} style={{ ...thS(align) }} onClick={() => toggleSort(field)}>
                      {label} <SortIcon field={field} sortField={sortField} sortDir={sortDir} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {profRows.map((r, i) => (
                  <tr key={r.profCode} style={{ background: i % 2 === 0 ? 'transparent' : '#FAFBFC' }}>
                    <td style={tdS('left')}>
                      <a href={`/prof/${r.profCode}`} style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13, color: 'var(--primary)', textDecoration: 'none' }}>
                        {r.profCode}
                      </a>
                    </td>
                    <td style={tdS()}><span style={{ color: 'var(--fg-muted)', fontSize: 12 }}>{r.examens}</span></td>
                    <td style={tdS()}>
                      {r.copies > 0
                        ? <span style={{ fontWeight: 700, fontSize: 15, color: r.copies >= 50 ? '#DC2626' : r.copies >= 25 ? '#D97706' : 'var(--success)' }}>{r.copies}</span>
                        : <span style={{ color: 'var(--fg-subtle)', fontSize: 12 }}>0</span>
                      }
                    </td>
                    <td style={tdS()}>
                      {r.annules > 0
                        ? <span style={{ background: '#FEF2F2', color: '#991B1B', padding: '2px 7px', borderRadius: 5, fontSize: 12, fontWeight: 600 }}>{r.annules}</span>
                        : <span style={{ color: 'var(--fg-subtle)', fontSize: 11 }}>–</span>
                      }
                    </td>
                    <td style={tdS()}>
                      {r.maintenu > 0
                        ? <span>
                            <span style={{ background: '#EFF6FF', color: '#1E40AF', padding: '2px 7px', borderRadius: 5, fontSize: 12, fontWeight: 600 }}>{r.maintenu}</span>
                            <span style={{ fontSize: 11, color: 'var(--fg-muted)', marginLeft: 4 }}>×{MAINTENU_COPIES}</span>
                          </span>
                        : <span style={{ color: 'var(--fg-subtle)', fontSize: 11 }}>–</span>
                      }
                    </td>
                    <td style={tdS()}>
                      {r.liste > 0
                        ? <span>
                            <span style={{ background: '#F0FDF4', color: '#15803D', padding: '2px 7px', borderRadius: 5, fontSize: 12, fontWeight: 600 }}>{r.liste}</span>
                            <span style={{ fontSize: 11, color: 'var(--fg-muted)', marginLeft: 4 }}>{r.copiesListe} él.</span>
                          </span>
                        : <span style={{ color: 'var(--fg-subtle)', fontSize: 11 }}>–</span>
                      }
                    </td>
                    <td style={tdS()}>
                      {r.pending > 0
                        ? <span style={{ background: '#FFFBEB', color: '#92400E', padding: '2px 7px', borderRadius: 5, fontSize: 12, fontWeight: 600 }}>{r.pending}</span>
                        : <span style={{ color: 'var(--fg-subtle)', fontSize: 11 }}>–</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Hypothèses sous le tableau */}
          {hints.length > 0 && (
            <div style={{ marginTop: 4 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#D97706' }}>
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                Hypothèses de regroupement — même prof · même jour (P1+P2 = identique) · ≤ {FEW_THRESHOLD} élèves/examen
                <span style={{ background: '#FFFBEB', color: '#92400E', border: '1px solid #FDE68A', padding: '1px 7px', borderRadius: 99, fontSize: 11, fontWeight: 700 }}>{hints.length}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {hints.map(h => (
                  <div key={`${h.profCode}-${h.jour}`} className="card" style={{ padding: '12px 16px', borderLeft: '3px solid #F59E0B' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                      <a href={`/prof/${h.profCode}`} style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13, color: 'var(--primary)', textDecoration: 'none', background: 'var(--primary-light)', padding: '2px 8px', borderRadius: 5 }}>
                        {h.profCode}
                      </a>
                      <span style={{ fontSize: 13, color: 'var(--fg)', fontWeight: 500 }}>{formatJour(h.jour)}</span>
                      <span style={{ fontSize: 12, color: 'var(--fg-muted)', marginLeft: 'auto' }}>{h.total} élève{h.total > 1 ? 's' : ''} au total</span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                      {h.items.map((item, i) => (
                        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#F8FAFC', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', fontSize: 12 }}>
                          <span style={{ fontWeight: 700, color: 'var(--fg)' }}>{item.matiere}</span>
                          <span style={{ color: 'var(--fg-muted)' }}>{item.groupe}</span>
                          <span style={{ color: 'var(--fg-subtle)', fontSize: 11 }}>({item.periode})</span>
                          <span style={{ background: '#F0FDF4', color: '#15803D', fontWeight: 700, padding: '1px 5px', borderRadius: 4, fontSize: 11 }}>{item.copies} él.</span>
                          <span style={{ color: 'var(--fg-subtle)', fontSize: 11 }}>{item.local}</span>
                        </span>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, background: '#F0FDF4', color: '#15803D', border: '1px solid #BBF7D0', padding: '2px 8px', borderRadius: 5, fontWeight: 600 }}>
                        Regroupement possible — P1 et P2 équivalents
                      </span>
                      {h.sameLocal && (
                        <span style={{ fontSize: 11, background: '#EFF6FF', color: '#1E40AF', border: '1px solid #BFDBFE', padding: '2px 8px', borderRadius: 5, fontWeight: 600 }}>
                          Même local ({h.items[0].local})
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {hints.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--fg-subtle)', textAlign: 'center', padding: '10px 0' }}>
              Aucune hypothèse détectée (critère : même prof · même jour · liste ≤ {FEW_THRESHOLD} élèves).
            </div>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          VUE GLOBALE PROPOSITION
      ══════════════════════════════════════════════════════════════════════ */}
      {view === 'global' && (
        <>
          {/* Barre de contrôle */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ fontSize: 11, color: 'var(--fg-muted)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <span>{examDetails.length} examens au total</span>
              <span>·</span>
              <span><strong style={{ color: '#92400E' }}>{fusionByKey.size}</strong> examens concernés par une fusion</span>
              <span>·</span>
              <span>P1 et P2 traités comme identiques</span>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--fg-muted)', cursor: 'pointer', userSelect: 'none' }}>
              <input
                type="checkbox"
                checked={fusionOnly}
                onChange={e => setFusionOnly(e.target.checked)}
                style={{ accentColor: '#F59E0B' }}
              />
              Fusions seulement
            </label>
          </div>

          <div className="card" style={{ overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {[
                    { label: 'Prof',         align: 'left'  },
                    { label: 'Jour',         align: 'left'  },
                    { label: 'Pér.',         align: 'center'},
                    { label: 'Matière',      align: 'left'  },
                    { label: 'Groupe',       align: 'left'  },
                    { label: 'Local',        align: 'left'  },
                    { label: 'Élèves',       align: 'right' },
                    { label: 'Fusion proposée', align: 'left' },
                  ].map(({ label, align }) => (
                    <th key={label} style={{ ...thS(align), cursor: 'default' }}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {globalRows.map((row, i) => {
                  const fk      = `${row.profCode}|${row.jour}|${row.periode}|${row.matiere}|${row.groupe}`
                  const fusion  = fusionByKey.get(fk)
                  const isAnnu  = row.type === 'annule'
                  const rowBg   = fusion
                    ? 'rgba(245,158,11,.06)'
                    : isAnnu
                      ? '#FFFAFA'
                      : i % 2 === 0 ? 'transparent' : '#FAFBFC'
                  const textMuted = isAnnu ? 'var(--fg-subtle)' : 'var(--fg)'
                  return (
                    <tr key={row.id ?? i} style={{ background: rowBg, borderLeft: fusion ? '3px solid #F59E0B' : '3px solid transparent' }}>
                      <td style={tdS('left')}>
                        <a href={`/prof/${row.profCode}`} style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 12, color: isAnnu ? 'var(--fg-subtle)' : 'var(--primary)', textDecoration: 'none' }}>
                          {row.profCode}
                        </a>
                      </td>
                      <td style={tdS('left', { color: textMuted, fontSize: 12 })}>{formatJourShort(row.jour)}</td>
                      <td style={tdS('center')}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', background: 'var(--bg)', padding: '1px 6px', borderRadius: 4 }}>{row.periode}</span>
                      </td>
                      <td style={tdS('left', { fontWeight: 600, color: textMuted })}>{row.matiere}</td>
                      <td style={tdS('left', { color: textMuted })}>{row.groupe}</td>
                      <td style={tdS('left', { fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)' })}>{row.local}</td>
                      <td style={tdS('right')}>{copiesBadge(row)}</td>
                      <td style={tdS('left', { maxWidth: 300 })}>
                        {fusion ? (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                            <span style={{ fontSize: 11, color: '#92400E', fontWeight: 700, marginRight: 2 }}>↔</span>
                            {fusion.others.map((o, j) => (
                              <span key={j} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: '#FEF3C7', border: '1px solid #FDE68A', color: '#92400E', padding: '1px 7px', borderRadius: 5, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>
                                {o.matiere} {o.groupe}
                                <span style={{ fontWeight: 400, opacity: .8 }}>({o.periode}, {o.copies} él.)</span>
                              </span>
                            ))}
                            <span style={{ fontSize: 11, color: 'var(--fg-muted)', marginLeft: 2 }}>= {fusion.total} él. total</span>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--fg-subtle)', fontSize: 11 }}>–</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
