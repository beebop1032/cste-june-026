'use client'
import { useState, useMemo } from 'react'

function formatJour(iso) {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('fr-BE', { weekday: 'short', day: 'numeric', month: 'short' })
}

const GS_INFO = {
  annule:   { label: "Annulé (admin)", badgeClass: 'badge-red' },
  maintenu: { label: 'Maintenu (admin)', badgeClass: 'badge-blue' },
}

export default function HoraireTable({ exams, responses, groupeStatuts }) {
  const [filterNiveau, setFilterNiveau] = useState('')
  const [filterGroupe, setFilterGroupe] = useState('')
  const [filterProf,   setFilterProf]   = useState('')
  const [filterStatut, setFilterStatut] = useState('')
  const [sortField, setSortField] = useState('jour')
  const [sortDir,   setSortDir]   = useState(1)

  const niveaux = useMemo(() => [...new Set(exams.map(e => e.niveau))].sort(), [exams])
  const groupes = useMemo(() => [...new Set(exams.map(e => e.groupe))].sort(), [exams])
  const profs   = useMemo(() => [...new Set(exams.map(e => e.profCode))].sort(), [exams])

  const rows = useMemo(() => {
    return exams
      .map(ex => {
        const gs = groupeStatuts[ex.groupe]
        let statut, badgeLabel, badgeClass
        if (gs === 'annule') {
          statut = 'annule_admin'; badgeLabel = 'Annulé (admin)'; badgeClass = 'badge-red'
        } else if (gs === 'maintenu') {
          statut = 'maintenu_admin'; badgeLabel = 'Maintenu (admin)'; badgeClass = 'badge-blue'
        } else {
          const profResp = responses[ex.profCode]
          const exResp   = profResp?.examens?.find(e => e.id === ex.id)
          if (!exResp) {
            statut = 'attente'; badgeLabel = '—'; badgeClass = 'badge-gray'
          } else if (exResp.statut === 'tous') {
            statut = 'tous'; badgeLabel = 'Tous les élèves'; badgeClass = 'badge-green'
          } else if (exResp.statut === 'aucun' || exResp.eleves?.length === 0) {
            statut = 'aucun'; badgeLabel = 'Aucun élève'; badgeClass = 'badge-amber'
          } else {
            statut = 'liste'; badgeLabel = `${exResp.eleves.length} élève(s)`; badgeClass = 'badge-green'
          }
        }
        return { ...ex, statut, badgeLabel, badgeClass }
      })
      .filter(r =>
        (!filterNiveau || r.niveau === filterNiveau) &&
        (!filterGroupe || r.groupe === filterGroupe) &&
        (!filterProf   || r.profCode === filterProf) &&
        (!filterStatut || r.statut === filterStatut)
      )
      .sort((a, b) => {
        const va = a[sortField] ?? ''
        const vb = b[sortField] ?? ''
        return va.localeCompare(vb) * sortDir
      })
  }, [exams, responses, groupeStatuts, filterNiveau, filterGroupe, filterProf, filterStatut, sortField, sortDir])

  function toggleSort(field) {
    if (sortField === field) setSortDir(d => -d)
    else { setSortField(field); setSortDir(1) }
  }

  const SortIcon = ({ field }) => {
    if (sortField !== field) return <span style={{ opacity: 0.3, fontSize: 10 }}>↕</span>
    return <span style={{ fontSize: 10 }}>{sortDir === 1 ? '↑' : '↓'}</span>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={filterNiveau} onChange={e => setFilterNiveau(e.target.value)} className="select" style={{ fontSize: 13, paddingTop: '6px', paddingBottom: '6px', paddingLeft: '10px', width: 'auto', minWidth: 150 }}>
          <option value="">Tous les niveaux</option>
          {niveaux.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <select value={filterGroupe} onChange={e => setFilterGroupe(e.target.value)} className="select" style={{ fontSize: 13, paddingTop: '6px', paddingBottom: '6px', paddingLeft: '10px', width: 'auto', minWidth: 150 }}>
          <option value="">Toutes les classes</option>
          {groupes.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
        <select value={filterProf} onChange={e => setFilterProf(e.target.value)} className="select" style={{ fontSize: 13, paddingTop: '6px', paddingBottom: '6px', paddingLeft: '10px', width: 'auto', minWidth: 150 }}>
          <option value="">Tous les profs</option>
          {profs.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={filterStatut} onChange={e => setFilterStatut(e.target.value)} className="select" style={{ fontSize: 13, paddingTop: '6px', paddingBottom: '6px', paddingLeft: '10px', width: 'auto', minWidth: 150 }}>
          <option value="">Tous les statuts</option>
          <option value="annule_admin">Annulé (admin)</option>
          <option value="maintenu_admin">Maintenu (admin)</option>
          <option value="tous">Tous les élèves</option>
          <option value="liste">Liste nominative</option>
          <option value="aucun">Aucun élève</option>
          <option value="attente">En attente</option>
        </select>
        {(filterNiveau || filterGroupe || filterProf || filterStatut) && (
          <button onClick={() => { setFilterNiveau(''); setFilterGroupe(''); setFilterProf(''); setFilterStatut('') }}
            className="btn btn-ghost btn-sm" style={{ fontSize: 12 }}>
            Réinitialiser filtres
          </button>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--fg-muted)' }}>{rows.length} ligne{rows.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                {[
                  { label: 'Jour',    field: 'jour' },
                  { label: 'Période', field: 'periode' },
                  { label: 'Matière', field: 'matiere' },
                  { label: 'Niveau',  field: 'niveau' },
                  { label: 'Classe',  field: 'groupe' },
                  { label: 'Prof',    field: 'profCode' },
                  { label: 'Statut',  field: 'statut' },
                ].map(({ label, field }) => (
                  <th key={field} onClick={() => toggleSort(field)}
                    style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
                    {label} <SortIcon field={field} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatJour(r.jour)}</td>
                  <td>{r.periode}</td>
                  <td style={{ fontWeight: 500 }}>{r.matiere}</td>
                  <td>{r.niveau}</td>
                  <td>{r.groupe}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.profCode}</td>
                  <td><span className={`badge ${r.badgeClass}`}>{r.badgeLabel}</span></td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--fg-muted)', padding: '20px' }}>Aucun résultat</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
