'use client'
import { useState, useMemo, useTransition } from 'react'
import { saveFullStateSilent } from '@/actions/admin'

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

function btnStyle(active, statut) {
  return active
    ? { background: GS[statut].text, color: '#fff', fontSize: 10, border: 'none', whiteSpace: 'nowrap', opacity: 1 }
    : { background: '#fff', color: '#64748B', border: '1px solid #E2E8F0', fontSize: 10, whiteSpace: 'nowrap' }
}

export default function ClasseTable({ exams, niveaux, niveauxMap, groupeStatuts: initGS, examStatuts: initES, responses = {} }) {
  const [groupeStatuts, setGroupeStatuts] = useState(initGS)
  const [examStatuts,   setExamStatuts]   = useState(initES)
  const [expanded,  setExpanded]  = useState({})
  const [isPending, startTransition] = useTransition()

  // Case-insensitive lookup for responses by profCode
  const responsesCI = useMemo(() => {
    const m = {}
    for (const [k, v] of Object.entries(responses)) m[k.toLowerCase()] = v
    return m
  }, [responses])

  // Effective statut: exam-level overrides groupe-level
  function effectif(examId, groupe) {
    return examStatuts[examId] ?? groupeStatuts[groupe] ?? 'open'
  }

  function getEleves(examId, profCode) {
    const profResp = responsesCI[profCode.toLowerCase()]
    const exResp = profResp?.examens?.find(e => e.id === examId)
    if (!exResp) return null
    const statut = exResp.statut ?? (exResp.maintenu === true ? 'maintenu' : null)
    if (statut === 'aucun') return { statut: 'aucun', eleves: [] }
    if (statut === 'tous')  return { statut: 'tous',  eleves: [] }
    if (statut === 'maintenu') return { statut: 'maintenu', eleves: [] }
    const eleves = (exResp.eleves ?? []).filter(el => el.nom || el.prenom)
    return eleves.length > 0 ? { statut: 'liste', eleves } : null
  }

  function handleGroupe(groupe, statut) {
    const newGS = { ...groupeStatuts }
    if (statut === 'open') delete newGS[groupe]
    else newGS[groupe] = statut
    const newES = { ...examStatuts }
    for (const ex of exams.filter(e => e.groupe === groupe)) delete newES[ex.id]
    setGroupeStatuts(newGS)
    setExamStatuts(newES)
    startTransition(async () => { await saveFullStateSilent(newGS, newES) })
  }

  function handleNiveau(niveau, statut) {
    const newGS = { ...groupeStatuts }
    for (const g of niveauxMap[niveau] ?? []) {
      if (statut === 'open') delete newGS[g]
      else newGS[g] = statut
    }
    const newES = { ...examStatuts }
    for (const ex of exams.filter(e => e.niveau === niveau)) delete newES[ex.id]
    setGroupeStatuts(newGS)
    setExamStatuts(newES)
    startTransition(async () => { await saveFullStateSilent(newGS, newES) })
  }

  function handleExam(examId, statut) {
    const newES = { ...examStatuts }
    if (statut === 'open') delete newES[examId]
    else newES[examId] = statut
    setExamStatuts(newES)
    startTransition(async () => { await saveFullStateSilent(groupeStatuts, newES) })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {isPending && <span style={{ fontSize: 12, color: 'var(--primary)', fontStyle: 'italic' }}>Sauvegarde…</span>}

      {niveaux.map(n => {
        const groupesNiveau = niveauxMap[n] ?? []
        const allSame = groupesNiveau.length > 0 &&
          groupesNiveau.every(g => (groupeStatuts[g] ?? 'open') === (groupeStatuts[groupesNiveau[0]] ?? 'open'))
        const niveauStatut = allSame ? (groupeStatuts[groupesNiveau[0]] ?? 'open') : null

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
                  <button key={statut} type="button" disabled={false}
                    onClick={() => handleNiveau(n, statut)}
                    className="btn btn-xs btn-secondary"
                    style={niveauStatut === statut
                      ? { background: GS[statut].bg, color: GS[statut].text, border: `1.5px solid ${GS[statut].border}`, fontSize: 11 }
                      : { fontSize: 11 }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Groupes */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {groupesNiveau.map(g => {
                const gs     = groupeStatuts[g] ?? 'open'
                const info   = GS[gs]
                const gExams = exams
                  .filter(e => e.groupe === g)
                  .sort((a, b) => a.jour.localeCompare(b.jour) || a.periode.localeCompare(b.periode))
                const isOpen = expanded[g]

                return (
                  <div key={g} style={{ borderRadius: 8, border: `1px solid ${info.border}`, overflow: 'hidden' }}>
                    {/* Groupe row */}
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', background: info.bg, cursor: 'pointer' }}
                      onClick={() => setExpanded(prev => ({ ...prev, [g]: !prev[g] }))}
                    >
                      <span style={{ fontSize: 11, color: info.text, opacity: 0.6, transform: isOpen ? 'rotate(90deg)' : 'none', display: 'inline-block', userSelect: 'none' }}>▶</span>
                      <span style={{ fontWeight: 600, fontSize: 14, color: info.text, minWidth: 60 }}>{g}</span>
                      <span style={{ fontSize: 12, color: info.text, opacity: 0.7, flex: 1 }}>
                        {gExams.length} exam{gExams.length !== 1 ? 's' : ''}
                      </span>
                      <span className={`badge ${info.badgeClass}`} style={{ fontSize: 11 }}>{info.label}</span>
                      <div style={{ display: 'flex', gap: 3 }} onClick={e => e.stopPropagation()}>
                        {ACTIONS.map(({ statut, label }) => (
                          <button key={statut} type="button" disabled={gs === statut}
                            onClick={() => handleGroupe(g, statut)}
                            className="btn btn-xs"
                            style={btnStyle(gs === statut, statut)}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Exam rows (expanded) */}
                    {isOpen && (
                      <div style={{ borderTop: `1px solid ${info.border}` }}>
                        {gExams.map(ex => {
                          const es   = effectif(ex.id, g)
                          const einfo = GS[es]
                          const hasOverride = !!examStatuts[ex.id]
                          const adminDecided = !!(examStatuts[ex.id] ?? groupeStatuts[g])
                          const elevesData = adminDecided ? null : getEleves(ex.id, ex.profCode)

                          return (
                            <div key={ex.id} style={{
                              background: hasOverride ? einfo.bg : '#fff',
                              borderBottom: '1px solid #F1F5F9',
                            }}>
                              <div style={{
                                display: 'flex', alignItems: 'center', gap: 10,
                                padding: '6px 14px 6px 38px',
                              }}>
                                <span style={{ fontSize: 12, color: 'var(--fg-muted)', minWidth: 90 }}>{formatJour(ex.jour)}</span>
                                <span style={{ fontSize: 12, color: 'var(--fg-muted)', minWidth: 32 }}>{ex.periode}</span>
                                <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--fg)', flex: 1 }}>{ex.matiere}</span>
                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)', minWidth: 40 }}>{ex.profCode}</span>
                                {elevesData?.statut === 'liste' && (
                                  <span className="badge badge-green" style={{ fontSize: 10 }}>{elevesData.eleves.length} élève{elevesData.eleves.length !== 1 ? 's' : ''}</span>
                                )}
                                {elevesData?.statut === 'tous' && (
                                  <span className="badge badge-green" style={{ fontSize: 10 }}>Tous</span>
                                )}
                                {elevesData?.statut === 'aucun' && (
                                  <span className="badge badge-amber" style={{ fontSize: 10 }}>Aucun</span>
                                )}
                                {elevesData?.statut === 'maintenu' && (
                                  <span className="badge badge-blue" style={{ fontSize: 10 }}>Maintenu</span>
                                )}
                                {hasOverride && (
                                  <span className={`badge ${einfo.badgeClass}`} style={{ fontSize: 10 }}>{einfo.label}</span>
                                )}
                                <div style={{ display: 'flex', gap: 3 }}>
                                  {ACTIONS.map(({ statut, label }) => (
                                    <button key={statut} type="button" disabled={es === statut}
                                      onClick={() => handleExam(ex.id, statut)}
                                      className="btn btn-xs"
                                      style={btnStyle(es === statut, statut)}>
                                      {label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              {elevesData?.statut === 'liste' && elevesData.eleves.length > 0 && (
                                <div style={{ padding: '2px 14px 8px 54px', display: 'flex', flexWrap: 'wrap', gap: '2px 8px' }}>
                                  {elevesData.eleves.map((el, i) => (
                                    <span key={i} style={{ fontSize: 11, color: 'var(--fg-muted)' }}>
                                      {el.nom}{el.prenom ? ` ${el.prenom}` : ''}{el.classe ? <span style={{ opacity: 0.6 }}> ({el.classe})</span> : ''}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          )
                        })}
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
