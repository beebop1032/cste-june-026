'use client'
import { useState, useTransition } from 'react'
import { submitProf } from '@/actions/prof'

function formatJour(iso) {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long' })
}

const IconPlus = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
)

const IconTrash = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
  </svg>
)

// groupeStatuts: { groupe: 'annule'|'maintenu' }  — open = absent
export default function ProfForm({ profCode, examens, groupeStatuts, dejaRempli }) {
  const allAdminDecided = examens.every(e => groupeStatuts[e.groupe])

  const [confirmed, setConfirmed] = useState(!dejaRempli)
  const [examState, setExamState] = useState(() =>
    Object.fromEntries(
      examens
        .filter(e => !groupeStatuts[e.groupe]) // only open exams
        .map(e => [e.id, { eleves: [], surveilleParTitulaire: false, statut: null }])
    )
  )
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState(null)
  const [submitAttempted, setSubmitAttempted] = useState(false)

  function addEleve(examId) {
    setExamState(s => ({
      ...s,
      [examId]: { ...s[examId], statut: null, eleves: [...s[examId].eleves, { nom: '', prenom: '' }] }
    }))
  }

  function removeEleve(examId, idx) {
    setExamState(s => ({
      ...s,
      [examId]: { ...s[examId], eleves: s[examId].eleves.filter((_, i) => i !== idx) }
    }))
  }

  function updateEleve(examId, idx, field, value) {
    setExamState(s => ({
      ...s,
      [examId]: {
        ...s[examId],
        eleves: s[examId].eleves.map((el, i) => i === idx ? { ...el, [field]: value } : el)
      }
    }))
  }

  function toggleSurveille(examId, checked) {
    setExamState(s => ({ ...s, [examId]: { ...s[examId], surveilleParTitulaire: checked } }))
  }

  function setStatut(examId, statut) {
    setExamState(s => ({
      ...s,
      [examId]: { ...s[examId], statut, eleves: [] }
    }))
  }

  function isResolved(examId) {
    const st = examState[examId]
    if (!st) return true // admin-decided = auto-resolved
    return st.eleves.length > 0 || st.statut !== null
  }

  const openExams = examens.filter(e => !groupeStatuts[e.groupe])
  const unresolvedCount = openExams.filter(e => !isResolved(e.id)).length

  function handleSubmit(e) {
    e.preventDefault()
    setSubmitAttempted(true)
    if (unresolvedCount > 0) return

    const payload = {
      examens: examens.map(ex => {
        const gs = groupeStatuts[ex.groupe]
        if (gs === 'annule')   return { id: ex.id, eleves: [], surveilleParTitulaire: false, statut: 'annule' }
        if (gs === 'maintenu') return { id: ex.id, eleves: [], surveilleParTitulaire: false, statut: 'tous' }
        const st = examState[ex.id]
        return {
          id: ex.id,
          eleves: st.eleves,
          surveilleParTitulaire: st.surveilleParTitulaire,
          statut: st.eleves.length > 0 ? 'liste' : st.statut,
        }
      })
    }
    startTransition(async () => {
      const res = await submitProf(profCode, payload)
      setResult(res)
    })
  }

  if (allAdminDecided) {
    const annules  = examens.filter(e => groupeStatuts[e.groupe] === 'annule')
    const maintenus = examens.filter(e => groupeStatuts[e.groupe] === 'maintenu')
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="card" style={{ padding: '28px 24px', textAlign: 'center', background: '#EFF6FF', border: '1px solid #BFDBFE' }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#1E40AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 10 }}>
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
          <h2 style={{ color: '#1E40AF', margin: '0 0 6px', fontSize: 17, fontWeight: 600 }}>Aucune action requise</h2>
          <p style={{ margin: 0, color: '#1E3A8A', fontSize: 14, lineHeight: 1.6 }}>
            Tous vos examens ont été traités par l'administration. Il n'y a rien à remplir.
          </p>
        </div>
        {annules.length > 0 && (
          <div className="card" style={{ padding: '14px 18px', borderColor: '#FECACA', background: '#FEF2F2' }}>
            <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: '#991B1B' }}>Examens annulés ({annules.length})</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {annules.map(ex => (
                <div key={ex.id} style={{ fontSize: 13, color: '#7F1D1D', display: 'flex', gap: 8 }}>
                  <span style={{ fontWeight: 500 }}>{ex.matiere}</span>
                  <span style={{ color: '#B91C1C' }}>{ex.groupe}</span>
                  <span style={{ color: '#991B1B', opacity: 0.7 }}>{new Date(ex.jour + 'T12:00:00').toLocaleDateString('fr-BE', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {maintenus.length > 0 && (
          <div className="card" style={{ padding: '14px 18px', borderColor: '#BFDBFE', background: '#EFF6FF' }}>
            <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: '#1E40AF' }}>Examens maintenus pour tous les élèves ({maintenus.length})</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {maintenus.map(ex => (
                <div key={ex.id} style={{ fontSize: 13, color: '#1E3A8A', display: 'flex', gap: 8 }}>
                  <span style={{ fontWeight: 500 }}>{ex.matiere}</span>
                  <span style={{ color: '#1D4ED8' }}>{ex.groupe}</span>
                  <span style={{ opacity: 0.7 }}>{new Date(ex.jour + 'T12:00:00').toLocaleDateString('fr-BE', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  if (result?.ok) {
    return (
      <div className="card" style={{ padding: '32px 24px', textAlign: 'center', background: 'var(--success-bg)', border: '1px solid #BBF7D0' }}>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 12 }}>
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
          <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
        <h2 style={{ color: 'var(--success)', margin: '0 0 8px', fontSize: 18, fontWeight: 600 }}>Réponses enregistrées</h2>
        <p style={{ margin: 0, color: '#166534', fontSize: 14 }}>Vos réponses ont bien été sauvegardées. Merci.</p>
      </div>
    )
  }

  if (!confirmed) {
    return (
      <div className="card" style={{ borderColor: 'var(--warning-border)', padding: '24px' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}>
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <div>
            <h2 style={{ color: 'var(--warning-fg)', margin: '0 0 8px', fontSize: 16, fontWeight: 600 }}>Formulaire déjà soumis</h2>
            <p style={{ margin: '0 0 16px', color: 'var(--warning-fg)', fontSize: 14, lineHeight: 1.6 }}>
              Vous avez déjà soumis vos réponses. En continuant, vous allez <strong>écraser les réponses existantes</strong>. L'ancienne version sera archivée.
            </p>
            <button onClick={() => setConfirmed(true)} className="btn btn-sm" style={{ background: 'var(--warning-fg)', color: '#fff', border: 'none' }}>
              Je comprends — modifier mes réponses
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {examens.map(ex => {
        const gs = groupeStatuts[ex.groupe] // 'annule' | 'maintenu' | undefined
        const isBlocked = !!gs
        const st = isBlocked ? null : examState[ex.id]
        const nEleves = st?.eleves.length ?? 0
        const choix = st?.statut ?? null
        const resolved = isResolved(ex.id)
        const showError = submitAttempted && !resolved && !isBlocked

        // Style per status
        const cardStyle = isBlocked
          ? gs === 'annule'
            ? { borderColor: '#FECACA', background: '#FEF2F2', opacity: 0.9 }
            : { borderColor: '#BFDBFE', background: '#EFF6FF', opacity: 0.9 }
          : showError
            ? { borderColor: '#FECACA', background: 'var(--bg-card)' }
            : resolved
              ? { borderColor: '#BBF7D0', background: 'var(--bg-card)' }
              : { background: 'var(--bg-card)' }

        return (
          <div key={ex.id} className="card" style={{ padding: '16px 20px', ...cardStyle }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8, marginBottom: isBlocked ? 0 : 14 }}>
              <div>
                <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--fg)' }}>{ex.matiere}</span>
                <span style={{ marginLeft: 8, color: 'var(--fg-muted)', fontSize: 13 }}>{ex.niveau} — {ex.groupe}</span>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <span className="badge badge-gray" style={{ fontSize: 12 }}>{formatJour(ex.jour)}</span>
                <span className="badge badge-gray" style={{ fontSize: 12 }}>{ex.periode}</span>

                {gs === 'annule'   && <span className="badge badge-red">Annulé par l'administration</span>}
                {gs === 'maintenu' && <span className="badge badge-blue">Maintenu pour tous</span>}
                {!isBlocked && choix === 'aucun' && <span className="badge badge-red">Aucun élève</span>}
                {!isBlocked && choix === 'tous'  && <span className="badge badge-green">Tous les élèves</span>}
                {!isBlocked && nEleves > 0        && <span className="badge badge-green">{nEleves} élève{nEleves > 1 ? 's' : ''}</span>}
                {showError                         && <span className="badge badge-red">À compléter</span>}
              </div>
            </div>

            {/* Blocked messages */}
            {gs === 'annule' && (
              <p style={{ margin: 0, fontSize: 13, color: '#991B1B', fontStyle: 'italic' }}>
                Cet examen a été annulé par l'administration. Aucune action requise.
              </p>
            )}
            {gs === 'maintenu' && (
              <p style={{ margin: 0, fontSize: 13, color: '#1E40AF', fontStyle: 'italic' }}>
                Cet examen est maintenu pour tous les élèves. Aucune action requise.
              </p>
            )}

            {/* Open exam controls */}
            {!isBlocked && (
              <>
                {nEleves > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                    {st.eleves.map((el, idx) => (
                      <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <input
                          placeholder="Nom"
                          value={el.nom}
                          onChange={e => updateEleve(ex.id, idx, 'nom', e.target.value)}
                          className="input"
                          style={{ flex: 1, padding: '7px 10px', fontSize: 13 }}
                        />
                        <input
                          placeholder="Prénom"
                          value={el.prenom}
                          onChange={e => updateEleve(ex.id, idx, 'prenom', e.target.value)}
                          className="input"
                          style={{ flex: 1, padding: '7px 10px', fontSize: 13 }}
                        />
                        <button
                          type="button"
                          onClick={() => removeEleve(ex.id, idx)}
                          className="btn-icon"
                          aria-label="Supprimer cet élève"
                          style={{ color: 'var(--destructive)', flexShrink: 0 }}
                        >
                          <IconTrash />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button type="button" onClick={() => addEleve(ex.id)} className="btn btn-secondary btn-sm">
                    <IconPlus /> Ajouter un élève
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatut(ex.id, choix === 'tous' ? null : 'tous')}
                    className="btn btn-sm"
                    style={choix === 'tous'
                      ? { background: 'var(--success)', color: '#fff' }
                      : { background: '#F0FDF4', color: 'var(--success)', border: '1.5px solid #BBF7D0' }}
                  >
                    {choix === 'tous' ? '✓ ' : ''}Tous les élèves participent
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatut(ex.id, choix === 'aucun' ? null : 'aucun')}
                    className="btn btn-sm"
                    style={choix === 'aucun'
                      ? { background: 'var(--destructive)', color: '#fff' }
                      : { background: '#FEF2F2', color: 'var(--destructive)', border: '1.5px solid #FECACA' }}
                  >
                    {choix === 'aucun' ? '✓ ' : ''}Aucun élève ne doit participer
                  </button>
                </div>

                {(nEleves > 0 || (choix !== null && choix !== 'aucun')) && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', color: 'var(--fg-muted)', userSelect: 'none', marginTop: 8 }}>
                    <input
                      type="checkbox"
                      checked={st.surveilleParTitulaire}
                      onChange={e => toggleSurveille(ex.id, e.target.checked)}
                      style={{ accentColor: 'var(--primary)', width: 14, height: 14 }}
                    />
                    Je souhaite surveiller cet examen
                  </label>
                )}
              </>
            )}
          </div>
        )
      })}

      {submitAttempted && unresolvedCount > 0 && (
        <div className="alert alert-error" role="alert">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          {unresolvedCount} examen{unresolvedCount > 1 ? 's' : ''} sans réponse — veuillez compléter tous les examens avant d'envoyer.
        </div>
      )}

      {result?.error && (
        <div className="alert alert-error" role="alert">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          {result.error}
        </div>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="btn btn-primary"
        style={{ width: '100%', padding: '13px', fontSize: 15, marginTop: 4 }}
      >
        {isPending ? (
          <>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 1s linear infinite' }}>
              <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
            </svg>
            Envoi en cours…
          </>
        ) : unresolvedCount > 0
          ? `${unresolvedCount} examen${unresolvedCount > 1 ? 's' : ''} à compléter`
          : 'Envoyer mes réponses'}
      </button>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </form>
  )
}
