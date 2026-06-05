'use client'
import { useState, useMemo } from 'react'

function formatJour(iso) {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('fr-BE', { weekday: 'short', day: 'numeric', month: 'short' })
}

// "3J-N" → "3J"  |  "6H" → "6H"  |  "GR2" → "GR2"  |  "A4-1" → "A4"
function classeBase(groupe) {
  if (/^\d[A-Z]$/.test(groupe)) return groupe
  const m = groupe.match(/^([A-Za-z0-9]+)-/)
  return m ? m[1] : groupe
}

function downloadCSV(rows, filename) {
  const headers = ['Jour', 'Pér.', 'Prof', 'Niveau', 'Groupe', 'Matière', 'Local', 'Nom', 'Prénom', 'Classe élève', 'Participation', 'Surveille par tit.']
  const lines = [
    headers.join(';'),
    ...rows.map(r => [
      r.jour, r.periode, r.prof, r.niveau, r.groupe, r.matiere, r.local ?? '',
      r.nom, r.prenom, r.classe ?? '', r.participation, r.surveilleParTitulaire ? 'Oui' : 'Non',
    ].map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')),
  ].join('\r\n')
  const blob = new Blob(['﻿' + lines], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
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

export default function ElevesTable({ rows, groupes, profs }) {
  const [filterBase,   setFilterBase]   = useState('')
  const [filterGroupe, setFilterGroupe] = useState('')
  const [filterProf,   setFilterProf]   = useState('')
  const [filterPart,   setFilterPart]   = useState('')
  const [search,       setSearch]       = useState('')
  const [sortField, setSortField] = useState('jour')
  const [sortDir,   setSortDir]   = useState(1)

  const bases = useMemo(() => [...new Set(rows.map(r => classeBase(r.groupe)))].sort(), [rows])
  const participations = useMemo(() => [...new Set(rows.map(r => r.participation))].sort(), [rows])
  const groupesForBase = useMemo(() => {
    if (!filterBase) return groupes
    return groupes.filter(g => classeBase(g) === filterBase)
  }, [groupes, filterBase])

  const filtered = useMemo(() => {
    return rows
      .filter(r =>
        (!filterBase   || classeBase(r.groupe) === filterBase) &&
        (!filterGroupe || r.groupe === filterGroupe) &&
        (!filterProf   || r.prof === filterProf) &&
        (!filterPart   || r.participation === filterPart) &&
        (!search       || r.nom.toLowerCase().includes(search.toLowerCase()) || r.prenom.toLowerCase().includes(search.toLowerCase()))
      )
      .sort((a, b) => {
        const va = a[sortField] ?? ''
        const vb = b[sortField] ?? ''
        return va.localeCompare(vb) * sortDir
      })
  }, [rows, filterBase, filterGroupe, filterProf, filterPart, search, sortField, sortDir])

  function toggleSort(field) {
    if (sortField === field) setSortDir(d => -d)
    else { setSortField(field); setSortDir(1) }
  }

  const SortIcon = ({ field }) => {
    if (sortField !== field) return <span style={{ opacity: 0.3, fontSize: 10 }}>↕</span>
    return <span style={{ fontSize: 10 }}>{sortDir === 1 ? '↑' : '↓'}</span>
  }

  const activeFilters = filterBase || filterGroupe || filterProf || filterPart || search

  function buildFilename() {
    const parts = []
    if (filterBase)   parts.push(filterGroupe || filterBase)
    if (filterProf)   parts.push(filterProf)
    if (search)       parts.push(search.replace(/\s+/g, '_'))
    return `eleves${parts.length ? '_' + parts.join('_') : ''}.csv`
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="search" placeholder="Chercher nom / prénom…" value={search}
          onChange={e => setSearch(e.target.value)}
          className="input" style={{ fontSize: 13, padding: '6px 10px', width: 190 }}
        />

        <select value={filterBase} onChange={e => { setFilterBase(e.target.value); setFilterGroupe('') }}
          className="select" style={{ fontSize: 13, padding: '6px 10px', width: 'auto', minWidth: 130 }}>
          <option value="">Toutes classes</option>
          {bases.map(b => <option key={b} value={b}>{b}</option>)}
        </select>

        {filterBase && groupesForBase.length > 1 && (
          <select value={filterGroupe} onChange={e => setFilterGroupe(e.target.value)}
            className="select" style={{ fontSize: 13, padding: '6px 10px', width: 'auto', minWidth: 110 }}>
            <option value="">Tous les groupes</option>
            {groupesForBase.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        )}

        <select value={filterProf} onChange={e => setFilterProf(e.target.value)}
          className="select" style={{ fontSize: 13, padding: '6px 10px', width: 'auto', minWidth: 130 }}>
          <option value="">Tous les profs</option>
          {profs.map(p => <option key={p} value={p}>{p}</option>)}
        </select>

        <select value={filterPart} onChange={e => setFilterPart(e.target.value)}
          className="select" style={{ fontSize: 13, padding: '6px 10px', width: 'auto', minWidth: 140 }}>
          <option value="">Tous types</option>
          {participations.map(p => <option key={p} value={p}>{p}</option>)}
        </select>

        {activeFilters && (
          <button onClick={() => { setFilterBase(''); setFilterGroupe(''); setFilterProf(''); setFilterPart(''); setSearch('') }}
            className="btn btn-ghost btn-sm" style={{ fontSize: 12 }}>
            Réinitialiser
          </button>
        )}

        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--fg-muted)' }}>
          {filtered.length} ligne{filtered.length !== 1 ? 's' : ''}
          {activeFilters ? ` / ${rows.length}` : ''}
        </span>

        <button
          onClick={() => downloadCSV(filtered, buildFilename())}
          className="btn btn-sm"
          style={{ background: 'var(--success)', color: '#fff', display: 'flex', alignItems: 'center', gap: 5 }}
        >
          <DownloadIcon /> {activeFilters ? 'CSV sélection' : 'CSV tout'}
        </button>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                {[
                  { label: 'Jour',       field: 'jour'    },
                  { label: 'Pér.',       field: 'periode' },
                  { label: 'Prof',       field: 'prof'    },
                  { label: 'Niveau',     field: 'niveau'  },
                  { label: 'Groupe',     field: 'groupe'  },
                  { label: 'Matière',    field: 'matiere' },
                  { label: 'Local',      field: 'local'   },
                  { label: 'Nom',        field: 'nom'     },
                  { label: 'Prénom',     field: 'prenom'  },
                  { label: 'Cl. élève',  field: 'classe'  },
                  { label: 'Participation', field: 'participation' },
                  { label: 'Surveille',  field: 'surveilleParTitulaire' },
                ].map(({ label, field }) => (
                  <th key={field} onClick={() => toggleSort(field)}
                    style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
                    {label} <SortIcon field={field} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={i}>
                  <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{formatJour(r.jour)}</td>
                  <td style={{ fontSize: 12 }}>{r.periode}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.prof}</td>
                  <td style={{ fontSize: 12 }}>{r.niveau}</td>
                  <td style={{ fontWeight: 600 }}>{r.groupe}</td>
                  <td style={{ fontWeight: 500 }}>{r.matiere}</td>
                  <td style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{r.local}</td>
                  <td style={{
                    fontWeight: r.participation === 'Liste nominative' ? 500 : 400,
                    fontStyle:  r.participation === 'Liste nominative' ? 'normal' : 'italic',
                    color:      r.participation === 'Liste nominative' ? 'var(--fg)' : 'var(--fg-muted)',
                  }}>{r.nom}</td>
                  <td>{r.prenom}</td>
                  <td style={{ fontSize: 12, color: r.classe ? 'var(--fg)' : 'var(--fg-muted)', fontStyle: r.classe ? 'normal' : 'italic' }}>
                    {r.classe || '—'}
                  </td>
                  <td>
                    <span className={`badge ${
                      r.participation === 'Liste nominative'              ? 'badge-green'  :
                      r.participation === "Annulé par l'administration"   ? 'badge-red'    :
                      r.participation === 'Maintenu pour tous les élèves' ? 'badge-blue'   :
                      r.participation === 'Aucun élève'                   ? 'badge-amber'  :
                      'badge-gray'
                    }`} style={{ fontSize: 11 }}>{r.participation}</span>
                  </td>
                  <td>
                    <span className={`badge badge-${r.surveilleParTitulaire ? 'blue' : 'gray'}`} style={{ fontSize: 11 }}>
                      {r.surveilleParTitulaire ? 'Oui' : 'Non'}
                    </span>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={12} style={{ textAlign: 'center', color: 'var(--fg-muted)', padding: '20px', fontStyle: 'italic' }}>
                    Aucun résultat
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
