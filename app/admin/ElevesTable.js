'use client'
import { useState, useMemo } from 'react'

function formatJour(iso) {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('fr-BE', { weekday: 'short', day: 'numeric', month: 'short' })
}

export default function ElevesTable({ rows, groupes, profs }) {
  const [filterGroupe, setFilterGroupe] = useState('')
  const [filterProf,   setFilterProf]   = useState('')
  const [filterPart,   setFilterPart]   = useState('')
  const [search,       setSearch]       = useState('')
  const [sortField, setSortField] = useState('jour')
  const [sortDir,   setSortDir]   = useState(1)

  const participations = useMemo(() => [...new Set(rows.map(r => r.participation))].sort(), [rows])

  const filtered = useMemo(() => {
    return rows
      .filter(r =>
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
  }, [rows, filterGroupe, filterProf, filterPart, search, sortField, sortDir])

  function toggleSort(field) {
    if (sortField === field) setSortDir(d => -d)
    else { setSortField(field); setSortDir(1) }
  }

  const SortIcon = ({ field }) => {
    if (sortField !== field) return <span style={{ opacity: 0.3, fontSize: 10 }}>↕</span>
    return <span style={{ fontSize: 10 }}>{sortDir === 1 ? '↑' : '↓'}</span>
  }

  const activeFilters = filterGroupe || filterProf || filterPart || search

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Export buttons */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>Export global :</span>
        <a href="/api/export?format=csv"  className="btn btn-sm" style={{ background: 'var(--success)', color: '#fff', textDecoration: 'none' }}>CSV</a>
        <a href="/api/export?format=xlsx" className="btn btn-sm" style={{ background: 'var(--primary)', color: '#fff', textDecoration: 'none' }}>XLSX</a>
        <span style={{ fontSize: 13, color: 'var(--fg-muted)', marginLeft: 4 }}>{rows.length} ligne(s) total</span>
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

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>Filtrer :</span>
        <input
          type="search" placeholder="Chercher nom/prénom…" value={search}
          onChange={e => setSearch(e.target.value)}
          className="input" style={{ fontSize: 13, padding: '6px 10px', width: 180 }}
        />
        <select value={filterGroupe} onChange={e => setFilterGroupe(e.target.value)} className="select" style={{ fontSize: 13, paddingTop: '6px', paddingBottom: '6px', paddingLeft: '10px', width: 'auto', minWidth: 150 }}>
          <option value="">Toutes les classes</option>
          {groupes.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
        <select value={filterProf} onChange={e => setFilterProf(e.target.value)} className="select" style={{ fontSize: 13, paddingTop: '6px', paddingBottom: '6px', paddingLeft: '10px', width: 'auto', minWidth: 150 }}>
          <option value="">Tous les profs</option>
          {profs.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={filterPart} onChange={e => setFilterPart(e.target.value)} className="select" style={{ fontSize: 13, paddingTop: '6px', paddingBottom: '6px', paddingLeft: '10px', width: 'auto', minWidth: 150 }}>
          <option value="">Tous types</option>
          {participations.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        {activeFilters && (
          <button onClick={() => { setFilterGroupe(''); setFilterProf(''); setFilterPart(''); setSearch('') }}
            className="btn btn-ghost btn-sm" style={{ fontSize: 12 }}>
            Réinitialiser
          </button>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--fg-muted)' }}>
          {filtered.length} ligne{filtered.length !== 1 ? 's' : ''}
          {activeFilters ? ` (sur ${rows.length})` : ''}
        </span>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                {[
                  { label: 'Prof',    field: 'prof' },
                  { label: 'Jour',    field: 'jour' },
                  { label: 'Période', field: 'periode' },
                  { label: 'Niveau',  field: 'niveau' },
                  { label: 'Classe',  field: 'groupe' },
                  { label: 'Matière', field: 'matiere' },
                  { label: 'Local',   field: 'local' },
                  { label: 'Nom',     field: 'nom' },
                  { label: 'Prénom',  field: 'prenom' },
                  { label: 'Participation', field: 'participation' },
                  { label: 'Surveille', field: 'surveilleParTitulaire' },
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
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.prof}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatJour(r.jour)}</td>
                  <td>{r.periode}</td>
                  <td>{r.niveau}</td>
                  <td>{r.groupe}</td>
                  <td style={{ fontWeight: 500 }}>{r.matiere}</td>
                  <td>{r.local}</td>
                  <td style={{
                    fontWeight: r.participation === 'Liste nominative' ? 500 : 400,
                    fontStyle:  r.participation === 'Liste nominative' ? 'normal' : 'italic',
                    color:      r.participation === 'Liste nominative' ? 'var(--fg)' : 'var(--fg-muted)',
                  }}>{r.nom}</td>
                  <td>{r.prenom}</td>
                  <td>
                    <span className={`badge ${
                      r.participation === 'Liste nominative' ? 'badge-green' :
                      r.participation === 'Annulé par l\'administration' ? 'badge-red' :
                      r.participation === 'Maintenu pour tous les élèves' ? 'badge-blue' :
                      r.participation === 'Aucun élève' ? 'badge-amber' :
                      'badge-gray'
                    }`} style={{ fontSize: 11 }}>{r.participation}</span>
                  </td>
                  <td><span className={`badge badge-${r.surveilleParTitulaire ? 'blue' : 'gray'}`}>{r.surveilleParTitulaire ? 'Oui' : 'Non'}</span></td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={11} style={{ textAlign: 'center', color: 'var(--fg-muted)', padding: '20px' }}>Aucun résultat</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
