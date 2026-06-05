'use client'
import { useState, useTransition } from 'react'
import { submitProf } from '@/actions/prof'

const JOURS = { lundi: 'Lun', mardi: 'Mar', mercredi: 'Mer', jeudi: 'Jeu', vendredi: 'Ven', samedi: 'Sam' }

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

export default function ProfForm({ profCode, examens, locked, dejaRempli }) {
  const lockedSet = new Set(locked)
  const openExams = examens.filter(e => !lockedSet.has(e.id))

  const [confirmed, setConfirmed] = useState(!dejaRempli)
  const [examState, setExamState] = useState(() =>
    Object.fromEntries(openExams.map(e => [e.id, { eleves: [], surveilleParTitulaire: false, maintenu: false }]))
  )
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState(null)

  function addEleve(examId) {
    setExamState(s => ({
      ...s,
      [examId]: { ...s[examId], eleves: [...s[examId].eleves, { nom: '', prenom: '' }] }
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

  function toggleMaintenu(examId) {
    setExamState(s => ({ ...s, [examId]: { ...s[examId], maintenu: !s[examId].maintenu } }))
  }

  function handleSubmit(e) {
    e.preventDefault()
    const payload = {
      examens: examens.map(ex => {
        if (lockedSet.has(ex.id)) return { id: ex.id, eleves: [], surveilleParTitulaire: false, maintenu: false }
        const st = examState[ex.id]
        return { id: ex.id, eleves: st.eleves, surveilleParTitulaire: st.surveilleParTitulaire, maintenu: st.maintenu }
      })
    }
    startTransition(async () => {
      const res = await submitProf(profCode, payload)
      setResult(res)
    })
  }

  if (result?.ok) {
    return (
      <div className="card alert-success" style={{ padding: '32px 24px', textAlign: 'center', border: '1px solid #BBF7D0' }}>
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
            <h2 style={{ color: 'var(--warning-fg)', margin: '0 0 8px', fontSize: 16, fontWeight: 600 }}>
              Formulaire déjà soumis
            </h2>
            <p style={{ margin: '0 0 16px', color: 'var(--warning-fg)', fontSize: 14, lineHeight: 1.6 }}>
              Vous avez déjà soumis vos réponses. En continuant, vous allez <strong>écraser les réponses existantes</strong>. L'ancienne version sera archivée.
            </p>
            <button
              onClick={() => setConfirmed(true)}
              className="btn btn-sm"
              style={{ background: 'var(--warning-fg)', color: '#fff', border: 'none', fontSize: 13 }}
            >
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
        const isLocked = lockedSet.has(ex.id)
        const st = isLocked ? null : examState[ex.id]
        const nEleves = st?.eleves.length ?? 0
        const isMaintenu = st?.maintenu ?? false
        const isEmpty = !isLocked && nEleves === 0 && !isMaintenu

        return (
          <div
            key={ex.id}
            className="card"
            style={{
              padding: '16px 20px',
              borderColor: isLocked ? 'var(--border)' : isEmpty ? '#FECACA' : '#BBF7D0',
              background: isLocked ? '#F8FAFC' : 'var(--bg-card)',
              opacity: isLocked ? 0.75 : 1,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8, marginBottom: isLocked ? 0 : 12 }}>
              <div>
                <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--fg)' }}>{ex.matiere}</span>
                <span style={{ marginLeft: 8, color: 'var(--fg-muted)', fontSize: 13 }}>{ex.niveau} — {ex.groupe}</span>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <span className="badge badge-gray" style={{ fontSize: 12 }}>{formatJour(ex.jour)}</span>
                <span className="badge badge-gray" style={{ fontSize: 12 }}>{ex.periode}</span>
                <span className="badge badge-blue" style={{ fontSize: 12 }}>{ex.local}</span>
                {isLocked && <span className="badge badge-gray">Verrouillé</span>}
                {!isLocked && isMaintenu && <span className="badge badge-blue">Examen maintenu</span>}
                {!isLocked && !isMaintenu && nEleves === 0 && <span className="badge badge-red">Aucun élève</span>}
                {!isLocked && nEleves > 0 && <span className="badge badge-green">{nEleves} élève{nEleves > 1 ? 's' : ''}</span>}
              </div>
            </div>

            {!isLocked && (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
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

                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: st.eleves.length > 0 ? 10 : 0, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => addEleve(ex.id)}
                    className="btn btn-secondary btn-sm"
                  >
                    <IconPlus /> Ajouter un élève
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleMaintenu(ex.id)}
                    className="btn btn-sm"
                    style={isMaintenu
                      ? { background: '#1D4ED8', color: '#fff' }
                      : { background: 'var(--primary-light)', color: 'var(--primary)', border: '1.5px solid #BFDBFE' }
                    }
                  >
                    {isMaintenu ? '✓ Examen maintenu' : 'Examen maintenu'}
                  </button>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', color: 'var(--fg-muted)', userSelect: 'none' }}>
                    <input
                      type="checkbox"
                      checked={st.surveilleParTitulaire}
                      onChange={e => toggleSurveille(ex.id, e.target.checked)}
                      style={{ accentColor: 'var(--primary)', width: 14, height: 14 }}
                    />
                    Je surveille moi-même
                  </label>
                </div>
              </>
            )}
          </div>
        )
      })}

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
        ) : 'Envoyer mes réponses'}
      </button>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </form>
  )
}
