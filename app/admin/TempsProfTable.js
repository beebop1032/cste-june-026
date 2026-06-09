'use client'
import { useState, useMemo } from 'react'

const MAINTENU_COPIES = 25

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
  a.href = url
  a.download = 'temps-prof.csv'
  a.click()
  URL.revokeObjectURL(url)
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

function formatJour(iso) {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'short' })
}

export default function TempsProfTable({ rows: initialRows, hints = [] }) {
  const [sortField, setSortField] = useState('copies')
  const [sortDir,   setSortDir]   = useState(-1) // desc par défaut

  function toggleSort(field) {
    if (sortField === field) setSortDir(d => -d)
    else { setSortField(field); setSortDir(field === 'profCode' ? 1 : -1) }
  }

  const rows = useMemo(() => {
    return [...initialRows].sort((a, b) => {
      const va = a[sortField]
      const vb = b[sortField]
      if (typeof va === 'string') return va.localeCompare(vb) * sortDir
      return (va - vb) * sortDir
    })
  }, [initialRows, sortField, sortDir])

  const totalCopies = rows.reduce((s, r) => s + r.copies, 0)
  const totalExams  = rows.reduce((s, r) => s + r.examens, 0)

  const thStyle = (field) => ({
    padding: '7px 10px',
    textAlign: field === 'profCode' ? 'left' : 'right',
    fontSize: 11,
    fontWeight: 700,
    color: 'var(--fg-muted)',
    textTransform: 'uppercase',
    letterSpacing: '.06em',
    background: 'var(--bg)',
    borderBottom: '2px solid var(--border)',
    cursor: 'pointer',
    userSelect: 'none',
    whiteSpace: 'nowrap',
  })

  const tdStyle = (align = 'right') => ({
    padding: '6px 10px',
    fontSize: 13,
    textAlign: align,
    borderBottom: '1px solid var(--border)',
    verticalAlign: 'middle',
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* En-tête avec totaux + export */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 16 }}>
          <div className="card" style={{ padding: '10px 18px', display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 24, fontWeight: 700, color: 'var(--fg)', lineHeight: 1 }}>{totalCopies}</span>
            <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>copies estimées</span>
          </div>
          <div className="card" style={{ padding: '10px 18px', display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 24, fontWeight: 700, color: 'var(--fg)', lineHeight: 1 }}>{rows.length}</span>
            <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>profs · {totalExams} examens</span>
          </div>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => downloadCSV(rows)}>
          <DownloadIcon />
          Export CSV
        </button>
      </div>

      {/* Légende */}
      <div style={{ fontSize: 11, color: 'var(--fg-muted)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <span>Hypothèse : <strong>"Examen maintenu"&nbsp;= {MAINTENU_COPIES}&nbsp;élèves</strong></span>
        <span>·</span>
        <span>"En attente" = formulaire non rempli, copies non comptées</span>
      </div>

      {/* Table */}
      <div className="card" style={{ overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {[
                { field: 'profCode', label: 'Prof',              align: 'left' },
                { field: 'examens',  label: 'Nb examens',        align: 'right' },
                { field: 'copies',   label: 'Copies totales',    align: 'right' },
                { field: 'annules',  label: 'Annulés',           align: 'right' },
                { field: 'maintenu', label: 'Maintenu / Tous',   align: 'right' },
                { field: 'liste',    label: 'Liste nominative',  align: 'right' },
                { field: 'pending',  label: 'En attente',        align: 'right' },
              ].map(({ field, label, align }) => (
                <th key={field} style={{ ...thStyle(field), textAlign: align }} onClick={() => toggleSort(field)}>
                  {label} <SortIcon field={field} sortField={sortField} sortDir={sortDir} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const isEven = i % 2 === 0
              const rowBg  = isEven ? 'transparent' : '#FAFBFC'
              const hasWarning = r.pending > 0
              return (
                <tr key={r.profCode} style={{ background: rowBg }}>
                  <td style={{ ...tdStyle('left') }}>
                    <a
                      href={`/prof/${r.profCode}`}
                      style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13, color: 'var(--primary)', textDecoration: 'none' }}
                    >
                      {r.profCode}
                    </a>
                  </td>
                  <td style={{ ...tdStyle(), color: 'var(--fg-muted)', fontSize: 12 }}>{r.examens}</td>
                  <td style={{ ...tdStyle() }}>
                    {r.copies > 0
                      ? <span style={{ fontWeight: 700, fontSize: 15, color: r.copies >= 50 ? '#DC2626' : r.copies >= 25 ? '#D97706' : 'var(--success)' }}>{r.copies}</span>
                      : <span style={{ color: 'var(--fg-subtle)', fontSize: 12 }}>0</span>
                    }
                  </td>
                  <td style={{ ...tdStyle() }}>
                    {r.annules > 0
                      ? <span style={{ background: '#FEF2F2', color: '#991B1B', padding: '2px 7px', borderRadius: 5, fontSize: 12, fontWeight: 600 }}>{r.annules}</span>
                      : <span style={{ color: 'var(--fg-subtle)', fontSize: 11 }}>–</span>
                    }
                  </td>
                  <td style={{ ...tdStyle() }}>
                    {r.maintenu > 0
                      ? <span>
                          <span style={{ background: '#EFF6FF', color: '#1E40AF', padding: '2px 7px', borderRadius: 5, fontSize: 12, fontWeight: 600 }}>{r.maintenu}</span>
                          <span style={{ fontSize: 11, color: 'var(--fg-muted)', marginLeft: 4 }}>×{MAINTENU_COPIES}&nbsp;copies</span>
                        </span>
                      : <span style={{ color: 'var(--fg-subtle)', fontSize: 11 }}>–</span>
                    }
                  </td>
                  <td style={{ ...tdStyle() }}>
                    {r.liste > 0
                      ? <span>
                          <span style={{ background: '#F0FDF4', color: '#15803D', padding: '2px 7px', borderRadius: 5, fontSize: 12, fontWeight: 600 }}>{r.liste}</span>
                          <span style={{ fontSize: 11, color: 'var(--fg-muted)', marginLeft: 4 }}>{r.copiesListe}&nbsp;élèves</span>
                        </span>
                      : <span style={{ color: 'var(--fg-subtle)', fontSize: 11 }}>–</span>
                    }
                  </td>
                  <td style={{ ...tdStyle() }}>
                    {r.pending > 0
                      ? <span style={{ background: '#FFFBEB', color: '#92400E', padding: '2px 7px', borderRadius: 5, fontSize: 12, fontWeight: 600 }}>{r.pending}</span>
                      : <span style={{ color: 'var(--fg-subtle)', fontSize: 11 }}>–</span>
                    }
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ── Hypothèses de regroupement ─────────────────────────────── */}
      {hints.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#D97706', flexShrink: 0 }}>
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            Hypothèses de regroupement — même prof · même jour · ≤ 10 élèves/examen
            <span style={{ background: '#FFFBEB', color: '#92400E', border: '1px solid #FDE68A', padding: '1px 7px', borderRadius: 99, fontSize: 11, fontWeight: 700 }}>{hints.length}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {hints.map(h => {
              const samePer = h.samePeriode
              const sameRoom = h.sameLocal
              return (
                <div key={`${h.profCode}-${h.jour}`} className="card" style={{ padding: '12px 16px', borderLeft: '3px solid #F59E0B' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                    <a href={`/prof/${h.profCode}`} style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13, color: 'var(--primary)', textDecoration: 'none', background: 'var(--primary-light)', padding: '2px 8px', borderRadius: 5 }}>
                      {h.profCode}
                    </a>
                    <span style={{ fontSize: 13, color: 'var(--fg)', fontWeight: 500 }}>{formatJour(h.jour)}</span>
                    <span style={{ fontSize: 12, color: 'var(--fg-muted)', marginLeft: 'auto' }}>
                      {h.total} élève{h.total > 1 ? 's' : ''} au total
                    </span>
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
                    {samePer
                      ? <span style={{ fontSize: 11, background: '#F0FDF4', color: '#15803D', border: '1px solid #BBF7D0', padding: '2px 8px', borderRadius: 5, fontWeight: 600 }}>
                          Même période ({h.items[0].periode}) — regroupement direct possible
                        </span>
                      : <span style={{ fontSize: 11, background: '#FFFBEB', color: '#92400E', border: '1px solid #FDE68A', padding: '2px 8px', borderRadius: 5, fontWeight: 600 }}>
                          Périodes différentes — à négocier
                        </span>
                    }
                    {sameRoom && (
                      <span style={{ fontSize: 11, background: '#EFF6FF', color: '#1E40AF', border: '1px solid #BFDBFE', padding: '2px 8px', borderRadius: 5, fontWeight: 600 }}>
                        Même local ({h.items[0].local})
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {hints.length === 0 && (
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--fg-subtle)', textAlign: 'center', padding: '12px 0' }}>
          Aucune hypothèse de regroupement détectée (critère : même prof · même jour · liste nominative ≤ 10 élèves).
        </div>
      )}
    </div>
  )
}
