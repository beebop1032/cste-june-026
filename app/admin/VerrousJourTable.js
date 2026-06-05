'use client'
import { useState, useMemo, useTransition } from 'react'
import { setExamStatutSilent } from '@/actions/admin'

function formatJour(iso) {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('fr-BE', { weekday: 'short', day: 'numeric', month: 'short' })
}

const GS = {
  open:     { label: 'À remplir',          bg: '#F8FAFC', border: '#E2E8F0', text: '#475569', badgeClass: 'badge-gray' },
  annule:   { label: 'Annulé',             bg: '#FEF2F2', border: '#FECACA', text: '#991B1B', badgeClass: 'badge-red'  },
  maintenu: { label: 'Maintenu pour tous', bg: '#EFF6FF', border: '#BFDBFE', text: '#1E40AF', badgeClass: 'badge-blue' },
}

const SEL = {
  fontSize: 11, padding: '3px 4px', borderRadius: 4,
  border: '1px solid #CBD5E1', background: '#fff', width: '100%', cursor: 'pointer',
}

export default function VerrousJourTable({ exams, groupeStatuts, examStatuts: initialES }) {
  // Per-exam statuts (exam-level overrides groupe-level)
  const [examStatuts, setExamStatuts] = useState(initialES)
  const [isPending, startTransition] = useTransition()

  const [filterNiveau, setFilterNiveau] = useState('')
  const [filterGroupe, setFilterGroupe] = useState('')
  const [filterProf,   setFilterProf]   = useState('')
  const [filterStatut, setFilterStatut] = useState('')

  const niveaux = useMemo(() => [...new Set(exams.map(e => e.niveau))].sort(), [exams])
  const groupes = useMemo(() => [...new Set(exams.map(e => e.groupe))].sort(), [exams])
  const profs   = useMemo(() => [...new Set(exams.map(e => e.profCode))].sort(), [exams])

  function effectif(examId, groupe) {
    return examStatuts[examId] ?? groupeStatuts[groupe] ?? 'open'
  }

  const rows = useMemo(() => {
    const sorted = [...exams].sort((a, b) =>
      a.jour.localeCompare(b.jour) || a.periode.localeCompare(b.periode) || a.groupe.localeCompare(b.groupe)
    )
    return sorted.filter(ex => {
      const s = examStatuts[ex.id] ?? groupeStatuts[ex.groupe] ?? 'open'
      return (
        (!filterNiveau || ex.niveau   === filterNiveau) &&
        (!filterGroupe || ex.groupe   === filterGroupe) &&
        (!filterProf   || ex.profCode === filterProf)   &&
        (!filterStatut || s           === filterStatut)
      )
    })
  }, [exams, examStatuts, groupeStatuts, filterNiveau, filterGroupe, filterProf, filterStatut])

  function handleStatut(examId, statut) {
    setExamStatuts(prev => {
      const next = { ...prev }
      if (statut === 'open') delete next[examId]
      else next[examId] = statut
      return next
    })
    startTransition(() => setExamStatutSilent(examId, statut))
  }

  const hasFilter = filterNiveau || filterGroupe || filterProf || filterStatut

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
          {rows.length} examen{rows.length !== 1 ? 's' : ''}
          {hasFilter ? ` (filtré sur ${exams.length})` : ''}
          {isPending && <span style={{ marginLeft: 8, color: 'var(--primary)', fontStyle: 'italic' }}>Sauvegarde…</span>}
        </span>
        {hasFilter && (
          <button
            onClick={() => { setFilterNiveau(''); setFilterGroupe(''); setFilterProf(''); setFilterStatut('') }}
            className="btn btn-ghost btn-xs" style={{ fontSize: 11 }}>
            Effacer les filtres
          </button>
        )}
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Jour</th>
                <th>Pér.</th>
                <th>Matière</th>
                <th>Niveau</th>
                <th>Classe</th>
                <th>Prof</th>
                <th>Local</th>
                <th>Statut</th>
                <th>Action</th>
              </tr>
              {/* Filter row */}
              <tr style={{ background: '#F1F5F9' }}>
                <th colSpan={3} />
                <th style={{ padding: '4px 6px' }}>
                  <select value={filterNiveau} onChange={e => setFilterNiveau(e.target.value)} style={SEL}>
                    <option value="">Tous</option>
                    {niveaux.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </th>
                <th style={{ padding: '4px 6px' }}>
                  <select value={filterGroupe} onChange={e => setFilterGroupe(e.target.value)} style={SEL}>
                    <option value="">Toutes</option>
                    {groupes.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </th>
                <th style={{ padding: '4px 6px' }}>
                  <select value={filterProf} onChange={e => setFilterProf(e.target.value)} style={SEL}>
                    <option value="">Tous</option>
                    {profs.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </th>
                <th />
                <th style={{ padding: '4px 6px' }}>
                  <select value={filterStatut} onChange={e => setFilterStatut(e.target.value)} style={SEL}>
                    <option value="">Tous</option>
                    <option value="open">À remplir</option>
                    <option value="annule">Annulé</option>
                    <option value="maintenu">Maintenu</option>
                  </select>
                </th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map(ex => {
                const es         = effectif(ex.id, ex.groupe)
                const info       = GS[es]
                const hasOverride = !!examStatuts[ex.id]
                const fromGroupe  = !hasOverride && !!(groupeStatuts[ex.groupe])
                return (
                  <tr key={ex.id} style={{ background: info.bg, transition: 'background 0.15s' }}>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{formatJour(ex.jour)}</td>
                    <td style={{ fontSize: 12 }}>{ex.periode}</td>
                    <td style={{ fontWeight: 500 }}>{ex.matiere}</td>
                    <td>{ex.niveau}</td>
                    <td style={{ fontWeight: 600 }}>{ex.groupe}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{ex.profCode}</td>
                    <td style={{ fontSize: 12 }}>{ex.local}</td>
                    <td>
                      <span className={`badge ${info.badgeClass}`} style={{ fontSize: 11 }}>
                        {info.label}
                      </span>
                      {fromGroupe && (
                        <span style={{ fontSize: 9, color: 'var(--fg-muted)', marginLeft: 4, fontStyle: 'italic' }}>
                          (classe)
                        </span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 3 }}>
                        {[
                          { statut: 'open',     label: 'À remplir' },
                          { statut: 'annule',   label: 'Annulé' },
                          { statut: 'maintenu', label: 'Maintenu' },
                        ].map(({ statut, label }) => (
                          <button
                            key={statut}
                            type="button"
                            onClick={() => handleStatut(ex.id, statut)}
                            disabled={es === statut || isPending}
                            className="btn btn-xs"
                            style={es === statut
                              ? { background: GS[statut].text, color: '#fff', fontSize: 10, border: 'none', whiteSpace: 'nowrap', opacity: 1 }
                              : { background: '#fff', color: '#64748B', border: '1px solid #E2E8F0', fontSize: 10, whiteSpace: 'nowrap' }}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', color: 'var(--fg-muted)', padding: '20px', fontStyle: 'italic' }}>
                    Aucun résultat pour ces filtres
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
