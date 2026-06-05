'use client'
import { useState, useTransition } from 'react'
import { submitProf } from '@/actions/prof'

function formatJour(iso) {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long' })
}

export default function ProfForm({ profCode, examens, locked, dejaRempli }) {
  const lockedSet = new Set(locked)
  const openExams = examens.filter(e => !lockedSet.has(e.id))

  const [confirmed, setConfirmed] = useState(!dejaRempli)
  const [examState, setExamState] = useState(() =>
    Object.fromEntries(openExams.map(e => [e.id, { eleves: [], surveilleParTitulaire: false }]))
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

  function handleSubmit(e) {
    e.preventDefault()
    const payload = {
      examens: examens.map(ex => {
        if (lockedSet.has(ex.id)) return { id: ex.id, eleves: [], surveilleParTitulaire: false }
        const st = examState[ex.id]
        return { id: ex.id, eleves: st.eleves, surveilleParTitulaire: st.surveilleParTitulaire }
      })
    }
    startTransition(async () => {
      const res = await submitProf(profCode, payload)
      setResult(res)
    })
  }

  if (result?.ok) {
    return (
      <div style={{ padding: 32, textAlign: 'center', background: '#d4edda', borderRadius: 12 }}>
        <h2 style={{ color: '#155724', margin: '0 0 8px' }}>Réponses enregistrées ✓</h2>
        <p style={{ margin: 0, color: '#155724' }}>Merci. Vos réponses ont bien été sauvegardées.</p>
      </div>
    )
  }

  if (!confirmed) {
    return (
      <div style={{ padding: 24, background: '#fff3cd', border: '2px solid #ffc107', borderRadius: 12 }}>
        <h2 style={{ color: '#856404', margin: '0 0 12px', fontSize: 18 }}>⚠ Formulaire déjà soumis</h2>
        <p style={{ margin: '0 0 16px', color: '#856404' }}>
          Vous avez déjà soumis vos réponses. En continuant, vous allez{' '}
          <strong>écraser les réponses existantes</strong>. L'ancienne version sera archivée mais ne sera plus affichée.
        </p>
        <button
          onClick={() => setConfirmed(true)}
          style={{ padding: '10px 20px', background: '#856404', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 15 }}
        >
          Je comprends — modifier mes réponses
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit}>
      {examens.map(ex => {
        const isLocked = lockedSet.has(ex.id)
        const st = isLocked ? null : examState[ex.id]
        const nEleves = st?.eleves.length ?? 0

        return (
          <div
            key={ex.id}
            style={{
              background: isLocked ? '#f0f0f0' : '#fff',
              border: '1px solid #ddd',
              borderRadius: 10,
              padding: 20,
              marginBottom: 16,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              <div>
                <strong style={{ fontSize: 16 }}>{ex.matiere}</strong>
                <span style={{ marginLeft: 8, color: '#666', fontSize: 14 }}>{ex.niveau} — {ex.groupe}</span>
              </div>
              <span style={{ fontSize: 13, color: '#888', whiteSpace: 'nowrap' }}>
                {formatJour(ex.jour)} · {ex.periode} · {ex.local}
              </span>
            </div>

            {isLocked ? (
              <span style={{ display: 'inline-block', padding: '4px 12px', background: '#6c757d', color: '#fff', borderRadius: 20, fontSize: 13 }}>
                Complet — maintenu tel quel
              </span>
            ) : (
              <>
                <div style={{ marginBottom: 10, fontSize: 13, fontWeight: 600, color: nEleves === 0 ? '#dc3545' : '#28a745' }}>
                  {nEleves === 0 ? '⚠ 0 élève — cet examen sera annulé' : `${nEleves} élève(s)`}
                </div>

                {st.eleves.map((el, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                    <input
                      placeholder="Nom"
                      value={el.nom}
                      onChange={e => updateEleve(ex.id, idx, 'nom', e.target.value)}
                      style={{ flex: 1, padding: '6px 10px', border: '1px solid #ccc', borderRadius: 6, fontSize: 14 }}
                    />
                    <input
                      placeholder="Prénom"
                      value={el.prenom}
                      onChange={e => updateEleve(ex.id, idx, 'prenom', e.target.value)}
                      style={{ flex: 1, padding: '6px 10px', border: '1px solid #ccc', borderRadius: 6, fontSize: 14 }}
                    />
                    <button
                      type="button"
                      onClick={() => removeEleve(ex.id, idx)}
                      aria-label="Supprimer cet élève"
                      style={{ padding: '6px 10px', background: '#dc3545', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 700 }}
                    >
                      ✕
                    </button>
                  </div>
                ))}

                <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginTop: 4 }}>
                  <button
                    type="button"
                    onClick={() => addEleve(ex.id)}
                    style={{ padding: '6px 14px', background: '#007bff', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}
                  >
                    + Ajouter un élève
                  </button>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={st.surveilleParTitulaire}
                      onChange={e => toggleSurveille(ex.id, e.target.checked)}
                    />
                    Je surveille moi-même cet examen
                  </label>
                </div>
              </>
            )}
          </div>
        )
      })}

      {result?.error && (
        <p style={{ color: '#dc3545', marginBottom: 12, padding: '10px 16px', background: '#f8d7da', borderRadius: 8 }}>
          {result.error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        style={{
          width: '100%',
          padding: '14px 0',
          fontSize: 16,
          background: isPending ? '#6c757d' : '#1a1a2e',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          cursor: isPending ? 'wait' : 'pointer',
          marginTop: 8,
        }}
      >
        {isPending ? 'Envoi en cours…' : 'Envoyer mes réponses'}
      </button>
    </form>
  )
}
