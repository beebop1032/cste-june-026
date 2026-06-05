'use client'
import { useState, useTransition } from 'react'
import { setGroupeStatutSilent, setNiveauStatutSilent } from '@/actions/admin'

function formatJour(iso) {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('fr-BE', { weekday: 'short', day: 'numeric', month: 'short' })
}

const GS = {
  open:     { label: 'À remplir',          bg: '#F8FAFC', border: '#E2E8F0', text: '#475569', badgeClass: 'badge-gray' },
  annule:   { label: 'Annulé',             bg: '#FEF2F2', border: '#FECACA', text: '#991B1B', badgeClass: 'badge-red'  },
  maintenu: { label: 'Maintenu pour tous', bg: '#EFF6FF', border: '#BFDBFE', text: '#1E40AF', badgeClass: 'badge-blue' },
}

const ACTIONS = [
  { statut: 'open',     label: 'À remplir' },
  { statut: 'annule',   label: 'Annulé'    },
  { statut: 'maintenu', label: 'Maintenu'  },
]

export default function ClasseTable({ exams, niveaux, niveauxMap, groupeStatuts: initial }) {
  const [statuts, setStatuts] = useState(initial)
  const [expanded, setExpanded] = useState({})
  const [isPending, startTransition] = useTransition()

  function handleGroupe(groupe, statut) {
    setStatuts(prev => {
      const next = { ...prev }
      if (statut === 'open') delete next[groupe]
      else next[groupe] = statut
      return next
    })
    startTransition(() => setGroupeStatutSilent(groupe, statut))
  }

  function handleNiveau(niveau, statut) {
    const groupes = niveauxMap[niveau] ?? []
    setStatuts(prev => {
      const next = { ...prev }
      for (const g of groupes) {
        if (statut === 'open') delete next[g]
        else next[g] = statut
      }
      return next
    })
    startTransition(() => setNiveauStatutSilent(niveau, statut))
  }

  function toggleGroupe(groupe) {
    setExpanded(prev => ({ ...prev, [groupe]: !prev[groupe] }))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {isPending && (
        <span style={{ fontSize: 12, color: 'var(--primary)', fontStyle: 'italic' }}>Sauvegarde…</span>
      )}

      {niveaux.map(n => {
        const groupesNiveau = niveauxMap[n] ?? []
        const allSame = groupesNiveau.length > 0 &&
          groupesNiveau.every(g => (statuts[g] ?? 'open') === (statuts[groupesNiveau[0]] ?? 'open'))
        const niveauStatut = allSame ? (statuts[groupesNiveau[0]] ?? 'open') : null

        return (
          <div key={n}>
            {/* Niveau header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--fg)', margin: 0 }}>{n}</h2>
              <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
                {groupesNiveau.length} classe{groupesNiveau.length !== 1 ? 's' : ''}
              </span>
              <div style={{ display: 'flex', gap: 4, marginLeft: 8 }}>
                {[
                  { statut: 'open',     label: 'Tout ouvrir'    },
                  { statut: 'annule',   label: 'Tout annuler'   },
                  { statut: 'maintenu', label: 'Tout maintenir' },
                ].map(({ statut, label }) => (
                  <button
                    key={statut}
                    type="button"
                    onClick={() => handleNiveau(n, statut)}
                    disabled={isPending}
                    className="btn btn-xs btn-secondary"
                    style={niveauStatut === statut
                      ? { background: GS[statut].bg, color: GS[statut].text, border: `1.5px solid ${GS[statut].border}`, fontSize: 11 }
                      : { fontSize: 11 }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Groupes */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {groupesNiveau.map(g => {
                const gs       = statuts[g] ?? 'open'
                const info     = GS[gs]
                const gExams   = exams.filter(e => e.groupe === g)
                  .sort((a, b) => a.jour.localeCompare(b.jour) || a.periode.localeCompare(b.periode))
                const isOpen   = expanded[g]

                return (
                  <div key={g} style={{ borderRadius: 8, border: `1px solid ${info.border}`, overflow: 'hidden', transition: 'border-color 0.15s' }}>
                    {/* Groupe row */}
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 14px', background: info.bg, cursor: 'pointer',
                    }}
                      onClick={() => toggleGroupe(g)}
                    >
                      {/* Expand chevron */}
                      <span style={{ fontSize: 11, color: info.text, opacity: 0.6, transition: 'transform 0.15s', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', display: 'inline-block', userSelect: 'none' }}>▶</span>
                      <span style={{ fontWeight: 600, fontSize: 14, color: info.text, minWidth: 60 }}>{g}</span>
                      <span style={{ fontSize: 12, color: info.text, opacity: 0.7, flex: 1 }}>
                        {gExams.length} exam{gExams.length !== 1 ? 's' : ''}
                      </span>
                      <span className={`badge ${info.badgeClass}`} style={{ fontSize: 11 }}>{info.label}</span>
                      <div style={{ display: 'flex', gap: 3 }} onClick={e => e.stopPropagation()}>
                        {ACTIONS.map(({ statut, label }) => (
                          <button
                            key={statut}
                            type="button"
                            onClick={() => handleGroupe(g, statut)}
                            disabled={gs === statut || isPending}
                            className="btn btn-xs"
                            style={gs === statut
                              ? { background: GS[statut].text, color: '#fff', fontSize: 10, border: 'none', whiteSpace: 'nowrap', opacity: 1 }
                              : { background: '#fff', color: '#64748B', border: '1px solid #E2E8F0', fontSize: 10, whiteSpace: 'nowrap' }}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Exam list (expanded) */}
                    {isOpen && (
                      <div style={{ borderTop: `1px solid ${info.border}` }}>
                        {gExams.map(ex => (
                          <div key={ex.id} style={{
                            display: 'flex', alignItems: 'center', gap: 12,
                            padding: '6px 14px 6px 38px',
                            background: '#fff',
                            borderBottom: `1px solid #F1F5F9`,
                            fontSize: 12,
                          }}>
                            <span style={{ color: 'var(--fg-muted)', minWidth: 90 }}>{formatJour(ex.jour)}</span>
                            <span style={{ color: 'var(--fg-muted)', minWidth: 32 }}>{ex.periode}</span>
                            <span style={{ fontWeight: 500, color: 'var(--fg)', flex: 1 }}>{ex.matiere}</span>
                            <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--fg-muted)', minWidth: 40 }}>{ex.profCode}</span>
                            <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{ex.local}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
