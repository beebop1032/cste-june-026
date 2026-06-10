'use client'
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { replaceStudentName } from '@/actions/admin'

// ── Fuzzy helpers ─────────────────────────────────────────────────────────────

function levenshtein(a, b) {
  if (Math.abs(a.length - b.length) > 4) return 99
  const m = a.length, n = b.length
  let prev = Array.from({ length: n + 1 }, (_, i) => i)
  for (let i = 1; i <= m; i++) {
    const curr = [i]
    for (let j = 1; j <= n; j++) {
      curr[j] = a[i - 1] === b[j - 1] ? prev[j - 1] : 1 + Math.min(prev[j], curr[j - 1], prev[j - 1])
    }
    prev = curr
  }
  return prev[n]
}

function normName(s) {
  return (s || '').toLowerCase().trim()
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/[-]/g, ' ')
    .replace(/\s+/g, ' ')
}

// Prefer mixed case (Title Case) over ALL_CAPS or all_lower
function betterName(nom1, prenom1, nom2, prenom2) {
  const isMixed = s => s.length > 1 && s !== s.toUpperCase() && s !== s.toLowerCase()
  const score1 = (isMixed(nom1) ? 1 : 0) + (isMixed(prenom1) ? 1 : 0)
  const score2 = (isMixed(nom2) ? 1 : 0) + (isMixed(prenom2) ? 1 : 0)
  return score2 > score1
    ? { nom: nom2, prenom: prenom2 }
    : { nom: nom1, prenom: prenom1 }
}

function fmtJour(iso) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('fr-BE', { day: 'numeric', month: 'short' })
}

// ── Build student list ────────────────────────────────────────────────────────

function buildStudents(responses, exams, groupeStatuts, examStatuts) {
  const examMap = Object.fromEntries(exams.map(e => [e.id, e]))
  const map = new Map()

  for (const prof of Object.values(responses)) {
    for (const ex of prof.examens ?? []) {
      const meta = examMap[ex.id]
      if (!meta) continue
      if (examStatuts[ex.id] || groupeStatuts[meta.groupe]) continue
      const statut = ex.statut ?? (ex.maintenu === true ? 'maintenu' : null)
      if (statut === 'aucun' || statut === 'tous' || statut === 'maintenu') continue

      for (const el of ex.eleves ?? []) {
        if (!el.nom && !el.prenom) continue
        const key = `${(el.nom || '').trim().toUpperCase()}|||${(el.prenom || '').trim()}`
        if (!map.has(key)) {
          map.set(key, { key, nom: (el.nom ?? '').trim(), prenom: (el.prenom ?? '').trim(), classe: (el.classe ?? '').trim().toUpperCase(), exams: [] })
        }
        const entry = map.get(key)
        if (!entry.exams.some(e => e.id === ex.id)) {
          entry.exams.push({ id: meta.id, jour: meta.jour, periode: meta.periode, matiere: meta.matiere, groupe: meta.groupe })
        }
        if (!entry.classe && el.classe) entry.classe = el.classe.trim().toUpperCase()
      }
    }
  }

  return [...map.values()]
    .sort((a, b) => normName(a.nom).localeCompare(normName(b.nom)) || normName(a.prenom).localeCompare(normName(b.prenom)))
    .map(st => ({ ...st, exams: [...st.exams].sort((a, b) => a.jour.localeCompare(b.jour) || a.periode.localeCompare(b.periode)) }))
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ExamPill({ ex }) {
  return (
    <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3, whiteSpace: 'nowrap', background: '#EFF6FF', color: '#1E40AF', border: '1px solid #BFDBFE' }}>
      {fmtJour(ex.jour)} {ex.periode} · {ex.matiere} · {ex.groupe}
    </span>
  )
}

function StudentCard({ st, color, onKeep, onKeepLabel, isPending, examBg, examColor, examBorder }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontWeight: 700, fontSize: 13 }}>
        {st.nom.toUpperCase()} {st.prenom}
        {st.classe && <span style={{ fontSize: 11, fontWeight: 400, color, marginLeft: 5 }}>({st.classe})</span>}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
        {st.exams.map(ex => (
          <span key={ex.id} style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3, background: examBg, color: examColor, border: `1px solid ${examBorder}` }}>
            {fmtJour(ex.jour)} · {ex.matiere}
          </span>
        ))}
      </div>
      <button disabled={isPending} onClick={onKeep}
        className="btn btn-xs btn-secondary" style={{ alignSelf: 'flex-start', fontSize: 11 }}>
        {onKeepLabel}
      </button>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function DoublonsView({ responses, exams, groupeStatuts, examStatuts }) {
  const [threshold,    setThreshold]    = useState(2)
  const [filterClasse, setFilterClasse] = useState('')
  const [filterNom,    setFilterNom]    = useState('')
  const [isPending,    startTransition] = useTransition()
  const [feedback,     setFeedback]     = useState(null)
  const router = useRouter()
  const [editingKey,   setEditingKey]   = useState(null)
  const [editNom,      setEditNom]      = useState('')
  const [editPrenom,   setEditPrenom]   = useState('')

  const students = useMemo(
    () => buildStudents(responses, exams, groupeStatuts, examStatuts),
    [responses, exams, groupeStatuts, examStatuts]
  )

  const classes = useMemo(() => {
    const set = new Set(students.map(s => s.classe || '(sans classe)'))
    return [...set].sort()
  }, [students])

  // Three categories of duplicates
  const { obvious, inversions, fuzzy } = useMemo(() => {
    const obvious = [], inversions = [], fuzzy = []
    for (let i = 0; i < students.length; i++) {
      for (let j = i + 1; j < students.length; j++) {
        const a = students[i], b = students[j]
        const normA = normName(`${a.nom} ${a.prenom}`)
        const normB = normName(`${b.nom} ${b.prenom}`)
        const normBInv = normName(`${b.prenom} ${b.nom}`)

        if (normA === normB) {
          obvious.push({ a, b })
        } else if (normA === normBInv) {
          inversions.push({ a, b })
        } else {
          const dist = levenshtein(normA, normB)
          if (dist > 0 && dist <= threshold) fuzzy.push({ a, b, dist })
        }
      }
    }
    return { obvious, inversions, fuzzy: fuzzy.sort((x, y) => x.dist - y.dist) }
  }, [students, threshold])

  const byClasse = useMemo(() => {
    const q = normName(filterNom)
    const filtered = students.filter(st => {
      if (filterClasse && (st.classe || '(sans classe)') !== filterClasse) return false
      if (q && !normName(`${st.nom} ${st.prenom}`).includes(q)) return false
      return true
    })
    const map = new Map()
    for (const st of filtered) {
      const cl = st.classe || '(sans classe)'
      if (!map.has(cl)) map.set(cl, [])
      map.get(cl).push(st)
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [students, filterClasse, filterNom])

  const totalFiltered = byClasse.reduce((acc, [, list]) => acc + list.length, 0)

  function startEdit(st) {
    setEditingKey(st.key)
    setEditNom(st.nom)
    setEditPrenom(st.prenom)
  }

  function handleSaveEdit(st) {
    const newNom    = editNom.trim()
    const newPrenom = editPrenom.trim()
    if (!newNom || (newNom === st.nom && newPrenom === st.prenom)) { setEditingKey(null); return }
    setFeedback(null)
    setEditingKey(null)
    startTransition(async () => {
      const res = await replaceStudentName(st.nom, st.prenom, newNom, newPrenom)
      if (res?.error) setFeedback({ msg: 'Erreur lors du renommage', ok: false })
      else { setFeedback({ msg: `${res.count} occurrence${res.count !== 1 ? 's' : ''} renommée${res.count !== 1 ? 's' : ''} → ${newNom} ${newPrenom}`, ok: true }); router.refresh() }
    })
  }

  function handleKeep(keep, remove) {
    setFeedback(null)
    startTransition(async () => {
      const res = await replaceStudentName(remove.nom, remove.prenom, keep.nom, keep.prenom)
      if (res?.error) setFeedback({ msg: 'Erreur lors du remplacement', ok: false })
      else { setFeedback({ msg: `${res.count} occurrence${res.count !== 1 ? 's' : ''} renommée${res.count !== 1 ? 's' : ''} → ${keep.nom} ${keep.prenom}`, ok: true }); router.refresh() }
    })
  }

return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Feedback ── */}
      {feedback && (
        <div className={`alert ${feedback.ok ? 'alert-success' : 'alert-error'}`} style={{ animation: 'fadeOut 0.4s ease 4s forwards' }}>
          {feedback.msg}
        </div>
      )}

      {/* ── Doublons évidents (casse/accents) ── */}
      <div className="card" style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: obvious.length > 0 ? 12 : 0 }}>
          <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg)', margin: 0 }}>
            {obvious.length > 0
              ? `Doublons évidents — ${obvious.length} paire${obvious.length !== 1 ? 's' : ''} (casse / accents)`
              : '✓ Aucun doublon évident (casse/accents)'}
          </h2>
          {isPending && <span style={{ fontSize: 11, color: 'var(--primary)', fontStyle: 'italic', marginLeft: 'auto' }}>En cours…</span>}
        </div>

        {obvious.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {obvious.map(({ a, b }, i) => {
              const best = betterName(a.nom, a.prenom, b.nom, b.prenom)
              return (
                <div key={i} style={{ padding: '12px 14px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, alignItems: 'start' }}>
                    <StudentCard st={a} color="#166534" isPending={isPending}
                      examBg="#DCFCE7" examColor="#166534" examBorder="#BBF7D0"
                      onKeepLabel="✓ Garder ce nom" onKeep={() => handleKeep(a, b)} />
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, paddingTop: 4 }}>
                      <span style={{ fontSize: 14, color: '#16A34A' }}>≈</span>
                      {best.nom === a.nom && best.prenom === a.prenom
                        ? <span style={{ fontSize: 9, color: '#16A34A', fontWeight: 700, textAlign: 'center' }}>A est mieux</span>
                        : best.nom === b.nom && best.prenom === b.prenom
                          ? <span style={{ fontSize: 9, color: '#16A34A', fontWeight: 700, textAlign: 'center' }}>B est mieux</span>
                          : null}
                    </div>
                    <StudentCard st={b} color="#166534" isPending={isPending}
                      examBg="#DCFCE7" examColor="#166534" examBorder="#BBF7D0"
                      onKeepLabel="✓ Garder ce nom" onKeep={() => handleKeep(b, a)} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Inversions nom/prénom ── */}
      {inversions.length > 0 && (
        <div className="card" style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg)', margin: 0 }}>
              Inversions nom/prénom — {inversions.length} paire{inversions.length !== 1 ? 's' : ''}
            </h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {inversions.map(({ a, b }, i) => (
              <div key={i} style={{ padding: '12px 14px', background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 8 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, alignItems: 'start' }}>
                  <StudentCard st={a} color="#9A3412" isPending={isPending}
                    examBg="#FFEDD5" examColor="#9A3412" examBorder="#FED7AA"
                    onKeepLabel="✓ Garder ce nom" onKeep={() => handleKeep(a, b)} />
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, paddingTop: 4 }}>
                    <span style={{ fontSize: 14, color: '#EA580C' }}>⇄</span>
                    <span style={{ fontSize: 9, color: '#EA580C', fontWeight: 700 }}>inversion</span>
                  </div>
                  <StudentCard st={b} color="#9A3412" isPending={isPending}
                    examBg="#FFEDD5" examColor="#9A3412" examBorder="#FED7AA"
                    onKeepLabel="✓ Garder ce nom" onKeep={() => handleKeep(b, a)} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Doublons potentiels (typos) ── */}
      <div className="card" style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: fuzzy.length > 0 ? 12 : 0 }}>
          <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg)', margin: 0 }}>
            {fuzzy.length > 0
              ? `Doublons potentiels (typos) — ${fuzzy.length} paire${fuzzy.length !== 1 ? 's' : ''}`
              : '✓ Aucun doublon potentiel (typos)'}
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginLeft: 'auto' }}>
            <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>Distance max :</span>
            {[1, 2, 3].map(v => (
              <button key={v} onClick={() => setThreshold(v)} className="btn btn-xs"
                style={threshold === v
                  ? { background: 'var(--primary)', color: '#fff', fontSize: 11, border: 'none' }
                  : { background: '#fff', color: '#64748B', border: '1px solid #E2E8F0', fontSize: 11 }}>
                {v}
              </button>
            ))}
          </div>
        </div>

        {fuzzy.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {fuzzy.map(({ a, b, dist }, i) => (
              <div key={i} style={{ padding: '12px 14px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, alignItems: 'start' }}>
                  <StudentCard st={a} color="#92400E" isPending={isPending}
                    examBg="#FEF3C7" examColor="#92400E" examBorder="#FDE68A"
                    onKeepLabel="✓ Garder ce nom — renommer B" onKeep={() => handleKeep(a, b)} />
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, paddingTop: 4 }}>
                    <span style={{ fontSize: 18, color: '#D97706' }}>↔</span>
                    <span style={{ fontSize: 10, color: '#D97706', fontWeight: 700 }}>dist.{dist}</span>
                  </div>
                  <StudentCard st={b} color="#92400E" isPending={isPending}
                    examBg="#FEF3C7" examColor="#92400E" examBorder="#FDE68A"
                    onKeepLabel="✓ Garder ce nom — renommer A" onKeep={() => handleKeep(b, a)} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Liste complète par classe ── */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg)', margin: 0 }}>
            Élèves manuscrits — {totalFiltered} / {students.length}
          </h2>
          <select value={filterClasse} onChange={e => setFilterClasse(e.target.value)}
            className="select" style={{ fontSize: 12, padding: '4px 8px', width: 'auto', minWidth: 160, marginLeft: 'auto' }}>
            <option value="">Toutes les classes</option>
            {classes.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <input type="text" placeholder="Nom…" value={filterNom} onChange={e => setFilterNom(e.target.value)}
            style={{ fontSize: 12, padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 6, width: 140, outline: 'none', background: 'var(--bg-card)' }} />
        </div>

        {byClasse.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--fg-muted)', fontStyle: 'italic', fontSize: 13 }}>Aucun élève</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Nom</th><th>Prénom</th><th>Classe</th><th>Examens à représenter</th><th></th>
                </tr>
              </thead>
              <tbody>
                {byClasse.map(([classe, list]) => (
                  <>
                    <tr key={`hdr-${classe}`}>
                      <td colSpan={5} style={{ background: 'var(--primary-light)', fontWeight: 700, fontSize: 12, color: 'var(--primary)', letterSpacing: '0.05em', padding: '5px 14px', borderBottom: '1px solid var(--border)' }}>
                        {classe} — {list.length} élève{list.length !== 1 ? 's' : ''}
                      </td>
                    </tr>
                    {list.map(st => {
                      const isEditing = editingKey === st.key
                      return (
                        <tr key={st.key}>
                          <td style={{ fontWeight: 600 }}>
                            {isEditing
                              ? <input autoFocus value={editNom} onChange={e => setEditNom(e.target.value)}
                                  onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(st); if (e.key === 'Escape') setEditingKey(null) }}
                                  style={{ fontSize: 12, padding: '3px 6px', border: '1.5px solid var(--primary)', borderRadius: 5, width: '100%', fontWeight: 600, outline: 'none' }} />
                              : st.nom.toUpperCase()}
                          </td>
                          <td>
                            {isEditing
                              ? <input value={editPrenom} onChange={e => setEditPrenom(e.target.value)}
                                  onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(st); if (e.key === 'Escape') setEditingKey(null) }}
                                  style={{ fontSize: 12, padding: '3px 6px', border: '1.5px solid var(--primary)', borderRadius: 5, width: '100%', outline: 'none' }} />
                              : st.prenom}
                          </td>
                          <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--fg-muted)' }}>{st.classe}</td>
                          <td>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                              {st.exams.map(ex => <ExamPill key={ex.id} ex={ex} />)}
                            </div>
                          </td>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            {isEditing ? (
                              <div style={{ display: 'flex', gap: 4 }}>
                                <button onClick={() => handleSaveEdit(st)} disabled={isPending}
                                  className="btn btn-xs" style={{ background: 'var(--primary)', color: '#fff', fontSize: 11, border: 'none' }}>
                                  ✓
                                </button>
                                <button onClick={() => setEditingKey(null)}
                                  className="btn btn-xs btn-ghost" style={{ fontSize: 11 }}>
                                  ✕
                                </button>
                              </div>
                            ) : (
                              <button onClick={() => startEdit(st)} disabled={isPending}
                                className="btn btn-ghost btn-xs" style={{ fontSize: 10, opacity: 0.55 }}
                                title="Modifier le nom">
                                Modifier
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
