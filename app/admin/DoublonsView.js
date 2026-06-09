'use client'
import { useMemo, useState, useTransition } from 'react'
import { saveMerge, deleteMerge } from '@/actions/admin'

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
    .replace(/\s+/g, ' ')
}

function fmtJour(iso) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('fr-BE', { day: 'numeric', month: 'short' })
}

function stKey(nom, prenom) {
  return `${(nom || '').trim().toUpperCase()}|||${(prenom || '').trim()}`
}

// ── Build student list (with merges applied) ──────────────────────────────────

function buildStudents(responses, exams, groupeStatuts, examStatuts, merges) {
  const examMap = Object.fromEntries(exams.map(e => [e.id, e]))

  // Build merge lookup: aliasKey -> { key: canonicalKey, nom, prenom }
  const mergeMap = new Map()
  for (const { keep, aliases = [] } of merges) {
    const keepKey = stKey(keep.nom, keep.prenom)
    for (const alias of aliases) {
      mergeMap.set(stKey(alias.nom, alias.prenom), { key: keepKey, nom: keep.nom, prenom: keep.prenom })
    }
  }

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
        const rawKey = stKey(el.nom, el.prenom)
        const merged = mergeMap.get(rawKey)
        const key    = merged?.key ?? rawKey
        const nom    = merged?.nom    ?? (el.nom   ?? '').trim()
        const prenom = merged?.prenom ?? (el.prenom ?? '').trim()

        if (!map.has(key)) {
          map.set(key, { key, nom, prenom, classe: (el.classe ?? '').trim().toUpperCase(), exams: [] })
        }
        const entry = map.get(key)
        if (!entry.exams.some(e => e.id === ex.id)) {
          entry.exams.push({ id: meta.id, jour: meta.jour, periode: meta.periode, matiere: meta.matiere, groupe: meta.groupe })
        }
        if (!entry.classe && el.classe) entry.classe = el.classe.trim().toUpperCase()
      }
    }
  }

  return [...map.values()].sort(
    (a, b) => normName(a.nom).localeCompare(normName(b.nom)) || normName(a.prenom).localeCompare(normName(b.prenom))
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ExamPill({ ex }) {
  return (
    <span style={{
      fontSize: 10, padding: '1px 6px', borderRadius: 3, whiteSpace: 'nowrap',
      background: '#EFF6FF', color: '#1E40AF', border: '1px solid #BFDBFE',
    }}>
      {fmtJour(ex.jour)} {ex.periode} · {ex.matiere} · {ex.groupe}
    </span>
  )
}

function PairCard({ st, onKeep, isPending }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontWeight: 700, fontSize: 13 }}>
        {st.nom.toUpperCase()} {st.prenom}
        {st.classe && <span style={{ fontSize: 11, fontWeight: 400, color: '#92400E', marginLeft: 5 }}>({st.classe})</span>}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 4 }}>
        {st.exams.map(ex => (
          <span key={ex.id} style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3, background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A' }}>
            {fmtJour(ex.jour)} · {ex.matiere}
          </span>
        ))}
        {st.exams.length === 0 && <span style={{ fontSize: 10, color: '#94a3b8', fontStyle: 'italic' }}>Aucun examen</span>}
      </div>
      <button
        onClick={onKeep}
        disabled={isPending}
        className="btn btn-xs btn-secondary"
        style={{ alignSelf: 'flex-start', fontSize: 11 }}
      >
        ✓ Garder ce nom
      </button>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function DoublonsView({ responses, exams, groupeStatuts, examStatuts, initialMerges = [] }) {
  const [merges,       setMerges]       = useState(initialMerges)
  const [threshold,    setThreshold]    = useState(2)
  const [filterClasse, setFilterClasse] = useState('')
  const [filterNom,    setFilterNom]    = useState('')
  const [isPending,    startTransition] = useTransition()
  const [error,        setError]        = useState(null)

  const students = useMemo(
    () => buildStudents(responses, exams, groupeStatuts, examStatuts, merges),
    [responses, exams, groupeStatuts, examStatuts, merges]
  )

  const classes = useMemo(() => {
    const set = new Set(students.map(s => s.classe || '(sans classe)'))
    return [...set].sort()
  }, [students])

  const duplicates = useMemo(() => {
    const pairs = []
    for (let i = 0; i < students.length; i++) {
      for (let j = i + 1; j < students.length; j++) {
        const a = normName(`${students[i].nom} ${students[i].prenom}`)
        const b = normName(`${students[j].nom} ${students[j].prenom}`)
        const dist = levenshtein(a, b)
        if (dist > 0 && dist <= threshold) pairs.push({ a: students[i], b: students[j], dist })
      }
    }
    return pairs.sort((x, y) => x.dist - y.dist)
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

  // All active aliases (flat) for the "Fusions actives" section
  const activeMerges = useMemo(() =>
    merges.flatMap(({ keep, aliases = [] }) => aliases.map(alias => ({ keep, alias }))),
    [merges]
  )

  function handleMerge(keep, remove) {
    setError(null)
    const newMerges = merges.map(m => ({ ...m, aliases: [...(m.aliases ?? [])] }))
    // Remove any existing alias entry
    for (const m of newMerges) m.aliases = m.aliases.filter(a => !(a.nom === remove.nom && a.prenom === remove.prenom))
    // Add under canonical
    const idx = newMerges.findIndex(m => m.keep.nom === keep.nom && m.keep.prenom === keep.prenom)
    if (idx >= 0) newMerges[idx].aliases.push(remove)
    else newMerges.push({ keep, aliases: [remove] })
    setMerges(newMerges.filter(m => (m.aliases ?? []).length > 0))
    startTransition(async () => {
      const res = await saveMerge(keep, remove)
      if (res?.error) setError('Sauvegarde échouée')
    })
  }

  function handleDeleteMerge(alias) {
    setError(null)
    const newMerges = merges
      .map(m => ({ ...m, aliases: (m.aliases ?? []).filter(a => !(a.nom === alias.nom && a.prenom === alias.prenom)) }))
      .filter(m => (m.aliases ?? []).length > 0)
    setMerges(newMerges)
    startTransition(async () => {
      const res = await deleteMerge(alias.nom, alias.prenom)
      if (res?.error) setError('Sauvegarde échouée')
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Doublons potentiels ── */}
      <div className="card" style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: duplicates.length > 0 ? 12 : 0 }}>
          <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg)', margin: 0 }}>
            {duplicates.length > 0
              ? `⚠ Doublons potentiels — ${duplicates.length} paire${duplicates.length !== 1 ? 's' : ''}`
              : '✓ Aucun doublon potentiel'}
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginLeft: 'auto' }}>
            {isPending && <span style={{ fontSize: 11, color: 'var(--primary)', fontStyle: 'italic' }}>Sauvegarde…</span>}
            {error   && <span style={{ fontSize: 11, color: 'var(--destructive)' }}>{error}</span>}
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

        {duplicates.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {duplicates.map(({ a, b, dist }, i) => (
              <div key={i} style={{
                padding: '12px 14px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8,
              }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, alignItems: 'start' }}>
                  <PairCard st={a} isPending={isPending} onKeep={() => handleMerge({ nom: a.nom, prenom: a.prenom }, { nom: b.nom, prenom: b.prenom })} />
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, paddingTop: 4 }}>
                    <span style={{ fontSize: 18, color: '#D97706' }}>↔</span>
                    <span style={{ fontSize: 10, color: '#D97706', fontWeight: 700 }}>dist.{dist}</span>
                  </div>
                  <PairCard st={b} isPending={isPending} onKeep={() => handleMerge({ nom: b.nom, prenom: b.prenom }, { nom: a.nom, prenom: a.prenom })} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Fusions actives ── */}
      {activeMerges.length > 0 && (
        <div className="card" style={{ padding: '12px 16px' }}>
          <h2 style={{ fontSize: 12, fontWeight: 700, color: 'var(--fg-muted)', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '.06em' }}>
            Fusions actives — {activeMerges.length}
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {activeMerges.map(({ keep, alias }, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                <span style={{ color: 'var(--fg-muted)', fontFamily: 'monospace' }}>
                  {alias.nom.toUpperCase()} {alias.prenom}
                </span>
                <span style={{ color: 'var(--fg-subtle)' }}>→</span>
                <span style={{ fontWeight: 600 }}>
                  {keep.nom.toUpperCase()} {keep.prenom}
                </span>
                <button
                  onClick={() => handleDeleteMerge(alias)}
                  disabled={isPending}
                  className="btn btn-ghost btn-xs"
                  style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--destructive)' }}
                >
                  Annuler
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

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
          <input
            type="text"
            placeholder="Nom…"
            value={filterNom}
            onChange={e => setFilterNom(e.target.value)}
            style={{ fontSize: 12, padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 6, width: 140, outline: 'none', background: 'var(--bg-card)' }}
          />
        </div>

        {byClasse.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--fg-muted)', fontStyle: 'italic', fontSize: 13 }}>
            Aucun élève
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>Prénom</th>
                  <th>Classe</th>
                  <th>Examens à représenter</th>
                </tr>
              </thead>
              <tbody>
                {byClasse.map(([classe, list]) => (
                  <>
                    <tr key={`hdr-${classe}`}>
                      <td colSpan={4} style={{
                        background: 'var(--primary-light)', fontWeight: 700, fontSize: 12,
                        color: 'var(--primary)', letterSpacing: '0.05em', padding: '5px 14px',
                        borderBottom: '1px solid var(--border)',
                      }}>
                        {classe} — {list.length} élève{list.length !== 1 ? 's' : ''}
                      </td>
                    </tr>
                    {list.map(st => (
                      <tr key={st.key}>
                        <td style={{ fontWeight: 600 }}>{st.nom.toUpperCase()}</td>
                        <td>{st.prenom}</td>
                        <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--fg-muted)' }}>{st.classe}</td>
                        <td>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                            {st.exams.map(ex => <ExamPill key={ex.id} ex={ex} />)}
                          </div>
                        </td>
                      </tr>
                    ))}
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
