'use client'
import { useState, useMemo } from 'react'

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtJour(iso) {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long' })
}

function fmtJourCourt(iso) {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('fr-BE', { weekday: 'short', day: 'numeric', month: 'short' })
}

const PART_LABEL = {
  annule: { txt: 'Annulé',           cls: 'p-an' },
  tous:   { txt: 'Tous les élèves',  cls: 'p-to' },
  liste:  { txt: null,               cls: 'p-li' },
}

function PartBadge({ p }) {
  if (!p) return <span className="p-ns">–</span>
  const info = PART_LABEL[p.type]
  const txt  = p.type === 'liste' ? `${p.nEleves} élève${p.nEleves !== 1 ? 's' : ''}` : info.txt
  return <span className={`badge ${info.cls}`}>{txt}</span>
}

// ── CSS ──────────────────────────────────────────────────────────────────────

const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600;700&family=Playfair+Display:wght@700&family=JetBrains+Mono:wght@500&display=swap');
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0 }
:root {
  --navy: #1a3254; --navy2: #2a4a72; --gold: #b8893a;
  --bg: #f4f3ef; --white: #fff; --text: #1c1c1c; --muted: #6b7280;
  --border: #d6d2c8; --radius: 6px;
}
body { font-family: 'Source Sans 3', sans-serif; font-size: 13px; background: var(--bg); color: var(--text) }

/* ── Top bar ── */
.topbar { background: var(--navy); color: #fff; padding: 16px 28px; display: flex; align-items: center; gap: 16px; flex-wrap: wrap }
.topbar-title { font-family: 'Playfair Display', Georgia, serif; font-size: 18px; flex: 1 }
.topbar-title span { font-family: 'Source Sans 3', sans-serif; font-size: 12px; color: rgba(255,255,255,.5); margin-left: 8px }
.back-link { font-size: 12px; color: rgba(255,255,255,.6); text-decoration: none; display: flex; align-items: center; gap: 4px }
.back-link:hover { color: #fff }

/* ── Controls ── */
.controls { background: var(--white); border-bottom: 1px solid var(--border); padding: 12px 28px; display: flex; align-items: center; gap: 12px; flex-wrap: wrap }
.tab-pill { border: 1.5px solid var(--border); background: var(--white); color: var(--muted); padding: 6px 14px; border-radius: 20px; font-size: 12px; font-weight: 600; cursor: pointer; font-family: inherit; transition: all .15s }
.tab-pill.active { background: var(--navy); color: #fff; border-color: var(--navy) }
.tab-pill:hover:not(.active) { border-color: var(--navy); color: var(--navy) }
.ctrl-sep { width: 1px; height: 24px; background: var(--border); margin: 0 4px }
.ctrl-select { border: 1.5px solid var(--border); background: var(--white); color: var(--text); padding: 6px 10px; border-radius: 6px; font-size: 12px; font-family: inherit; cursor: pointer; min-width: 160px }
.ctrl-select:focus { outline: none; border-color: var(--navy) }
.print-btn { background: var(--gold); color: #fff; border: none; padding: 7px 18px; border-radius: 6px; font-family: inherit; font-size: 12px; font-weight: 700; cursor: pointer; margin-left: auto; letter-spacing: .3px }
.print-btn:hover { opacity: .88 }

/* ── Content ── */
.content { max-width: 900px; margin: 0 auto; padding: 24px 28px 60px }

/* ── Section header ── */
.section-hdr { background: var(--navy); color: #fff; padding: 14px 20px; border-radius: var(--radius) var(--radius) 0 0; margin-top: 20px }
.section-hdr h2 { font-family: 'Playfair Display', Georgia, serif; font-size: 17px; font-weight: 700 }
.section-hdr p  { font-size: 11px; color: rgba(255,255,255,.55); margin-top: 2px }
.section-body { background: var(--white); border: 1px solid var(--border); border-top: none; border-radius: 0 0 var(--radius) var(--radius); margin-bottom: 24px }

/* ── Day group ── */
.day-group { border-bottom: 1px solid var(--border) }
.day-group:last-child { border-bottom: none }
.day-label { font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: .8px; color: var(--navy); padding: 8px 16px; background: #f8f6f1; border-bottom: 1px solid var(--border) }

/* ── Exam row ── */
.exam-row { display: grid; grid-template-columns: 60px 1fr auto; gap: 12px; align-items: start; padding: 10px 16px; border-bottom: 1px solid #f0ede6 }
.exam-row:last-child { border-bottom: none }
.exam-per { font-weight: 700; font-size: 11px; color: var(--navy2); padding-top: 1px }
.exam-main { display: flex; flex-direction: column; gap: 3px }
.exam-title { font-weight: 700; font-size: 13px; color: var(--text) }
.exam-meta  { font-size: 11px; color: var(--muted); display: flex; gap: 10px; flex-wrap: wrap }
.exam-meta .mono { font-family: 'JetBrains Mono', monospace; font-size: 10px }
.exam-right { display: flex; flex-direction: column; align-items: flex-end; gap: 4px }

/* ── Student list ── */
.student-grid { display: flex; flex-wrap: wrap; gap: 3px 8px; margin-top: 6px }
.student-chip { background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af; border-radius: 3px; padding: 1px 6px; font-size: 11px; font-weight: 600 }

/* ── Prof table ── */
.prof-table { width: 100%; border-collapse: collapse; font-size: 12px }
.prof-table th { background: #f0ede6; border: 1px solid var(--border); padding: 6px 10px; text-align: left; font-weight: 700; font-size: 11px; color: var(--navy); text-transform: uppercase; letter-spacing: .3px }
.prof-table td { border: 1px solid #e8e4db; padding: 7px 10px; vertical-align: middle }
.prof-table tr:nth-child(even) td { background: #faf9f6 }
.prof-table .mono { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--muted) }
.surv-oui { color: #065f46; font-weight: 700 }
.surv-non { color: var(--muted) }

/* ── Student convocation ── */
.conv-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; padding: 16px }
.conv-card { border: 1.5px solid var(--border); border-radius: 6px; overflow: hidden }
.conv-card-hdr { background: var(--navy); color: #fff; padding: 8px 12px }
.conv-card-hdr .name { font-weight: 700; font-size: 13px }
.conv-card-hdr .classe { font-size: 10px; color: rgba(255,255,255,.55); margin-top: 1px }
.conv-card-body { padding: 8px 12px; display: flex; flex-direction: column; gap: 5px }
.conv-exam { font-size: 11px; display: flex; gap: 6px; align-items: baseline }
.conv-exam .cdate { color: var(--muted); min-width: 72px; flex-shrink: 0 }
.conv-exam .cmat  { font-weight: 600; color: var(--text) }
.conv-exam .croom { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--muted) }

/* ── Badges ── */
.badge { display: inline-block; padding: 2px 7px; border-radius: 4px; font-weight: 700; font-size: 11px }
.p-an { background: #fde8e8; color: #991b1b; border: 1px solid #fca5a5 }
.p-to { background: #d1fae5; color: #065f46; border: 1px solid #6ee7b7 }
.p-li { background: #dbeafe; color: #1e40af; border: 1px solid #93c5fd }
.p-ns { color: #9ca3af; font-style: italic; font-size: 11px }

/* ── Empty state ── */
.empty { padding: 40px; text-align: center; color: var(--muted); font-style: italic; font-size: 13px }

/* ── Print ── */
@media print {
  @page { size: A4 portrait; margin: 10mm 12mm }
  .topbar, .controls { display: none !important }
  .content { padding: 0; max-width: none }
  .section-hdr { border-radius: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact }
  .section-body { border-radius: 0 }
  .section-hdr h2 { font-size: 14px }
  body { font-size: 11px; background: #fff }
  .exam-row { padding: 6px 12px }
  .exam-title { font-size: 12px }
  .conv-card { page-break-inside: avoid }
  .prof-table { font-size: 10px }
  .prof-table th, .prof-table td { padding: 4px 7px }
  .day-label { padding: 4px 12px }
  .badge { font-size: 10px }
}
`

// ── View: Par Classe ──────────────────────────────────────────────────────────

function ViewClasse({ exams, partData, groupe }) {
  const gExams = useMemo(() =>
    exams.filter(e => e.groupe === groupe)
      .sort((a, b) => a.jour.localeCompare(b.jour) || a.periode.localeCompare(b.periode)),
    [exams, groupe]
  )

  const byJour = useMemo(() => {
    const m = new Map()
    for (const ex of gExams) {
      if (!m.has(ex.jour)) m.set(ex.jour, [])
      m.get(ex.jour).push(ex)
    }
    return m
  }, [gExams])

  if (!groupe) return <div className="empty">Sélectionne une classe pour afficher ses examens.</div>

  return (
    <>
      <div className="section-hdr">
        <h2>Classe {groupe}</h2>
        <p>Examens juin 2026 · {gExams.length} examen{gExams.length !== 1 ? 's' : ''}</p>
      </div>
      <div className="section-body">
        {[...byJour.entries()].map(([jour, jExams]) => (
          <div key={jour} className="day-group">
            <div className="day-label">{fmtJour(jour)}</div>
            {jExams.map(ex => {
              const p = partData[ex.id]
              return (
                <div key={ex.id} className="exam-row">
                  <div className="exam-per">{ex.periode}</div>
                  <div className="exam-main">
                    <div className="exam-title">{ex.matiere}</div>
                    <div className="exam-meta">
                      <span>Prof : <span className="mono">{ex.profCode}</span></span>
                      <span>Salle : <span className="mono">{ex.local}</span></span>
                      {p?.surveilleParTitulaire && <span className="surv-oui">✓ Surveillé par le titulaire</span>}
                    </div>
                    {p?.type === 'liste' && p.eleves.length > 0 && (
                      <div className="student-grid">
                        {p.eleves.map((el, i) => (
                          <span key={i} className="student-chip">{el.prenom} {el.nom}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="exam-right">
                    <PartBadge p={p} />
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </>
  )
}

// ── View: Par Prof ────────────────────────────────────────────────────────────

function ViewProf({ exams, partData, prof }) {
  const pExams = useMemo(() =>
    exams.filter(e => e.profCode === prof)
      .sort((a, b) => a.jour.localeCompare(b.jour) || a.periode.localeCompare(b.periode)),
    [exams, prof]
  )

  if (!prof) return <div className="empty">Sélectionne un prof pour afficher son planning de surveillance.</div>

  return (
    <>
      <div className="section-hdr">
        <h2>Prof {prof} — Planning surveillance</h2>
        <p>Examens juin 2026 · {pExams.length} examen{pExams.length !== 1 ? 's' : ''} à surveiller</p>
      </div>
      <div className="section-body">
        <table className="prof-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Pér.</th>
              <th>Matière</th>
              <th>Classe</th>
              <th>Salle</th>
              <th>Statut</th>
              <th>Tit.</th>
            </tr>
          </thead>
          <tbody>
            {pExams.map(ex => {
              const p = partData[ex.id]
              return (
                <tr key={ex.id}>
                  <td>{fmtJourCourt(ex.jour)}</td>
                  <td style={{ fontWeight: 700 }}>{ex.periode}</td>
                  <td style={{ fontWeight: 600 }}>{ex.matiere}</td>
                  <td style={{ fontWeight: 700 }}>{ex.groupe}</td>
                  <td className="mono">{ex.local}</td>
                  <td><PartBadge p={p} /></td>
                  <td className={p?.surveilleParTitulaire ? 'surv-oui' : 'surv-non'}>
                    {p?.surveilleParTitulaire ? 'Oui' : '–'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}

// ── View: Par Élève ───────────────────────────────────────────────────────────

function ViewEleve({ exams, partData, groupe }) {
  const students = useMemo(() => {
    if (!groupe) return []
    const map = new Map() // key "NOM PRENOM" → { nom, prenom, exams[] }
    const gExams = exams.filter(e => e.groupe === groupe)
      .sort((a, b) => a.jour.localeCompare(b.jour) || a.periode.localeCompare(b.periode))

    for (const ex of gExams) {
      const p = partData[ex.id]
      if (!p || p.type === 'annule') continue
      if (p.type === 'tous') {
        // "tous" → représenté par une entrée générique si pas de liste connue
        const key = '__tous__'
        if (!map.has(key)) map.set(key, { nom: '(tous les élèves)', prenom: '', exams: [] })
        map.get(key).exams.push(ex)
      } else if (p.type === 'liste' && p.eleves.length > 0) {
        for (const el of p.eleves) {
          const key = `${(el.nom || '').toUpperCase()}|${(el.prenom || '').toLowerCase()}`
          if (!map.has(key)) map.set(key, { nom: el.nom ?? '', prenom: el.prenom ?? '', exams: [] })
          map.get(key).exams.push(ex)
        }
      }
    }
    return [...map.values()].sort((a, b) => a.nom.localeCompare(b.nom) || a.prenom.localeCompare(b.prenom))
  }, [exams, partData, groupe])

  if (!groupe) return <div className="empty">Sélectionne une classe pour afficher les convocations élèves.</div>
  if (students.length === 0) return <div className="empty">Aucune donnée élève disponible pour cette classe — en attente des soumissions profs.</div>

  return (
    <>
      <div className="section-hdr">
        <h2>Classe {groupe} — Convocations élèves</h2>
        <p>{students.length} élève{students.length !== 1 ? 's' : ''} · Examens juin 2026</p>
      </div>
      <div className="section-body">
        <div className="conv-grid">
          {students.map((st, i) => (
            <div key={i} className="conv-card">
              <div className="conv-card-hdr">
                <div className="name">{st.prenom} {st.nom}</div>
                <div className="classe">Classe {groupe}</div>
              </div>
              <div className="conv-card-body">
                {st.exams.map(ex => (
                  <div key={ex.id} className="conv-exam">
                    <span className="cdate">{fmtJourCourt(ex.jour)} {ex.periode}</span>
                    <span className="cmat">{ex.matiere}</span>
                    <span className="croom">{ex.local}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

const TABS = [
  { id: 'classe', label: 'Par classe' },
  { id: 'prof',   label: 'Par prof'   },
  { id: 'eleve',  label: 'Par élève'  },
]

export default function PrintViews({ exams, partData, allGroupes, allProfs }) {
  const [tab,    setTab]    = useState('classe')
  const [groupe, setGroupe] = useState('')
  const [prof,   setProf]   = useState('')

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />

      <div className="topbar">
        <a href="/admin" className="back-link">← Admin</a>
        <div className="topbar-title">
          Vues imprimables
          <span>Examens juin 2026</span>
        </div>
      </div>

      <div className="controls">
        {TABS.map(t => (
          <button key={t.id} className={`tab-pill${tab === t.id ? ' active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}

        <div className="ctrl-sep" />

        {tab === 'prof' ? (
          <select className="ctrl-select" value={prof} onChange={e => setProf(e.target.value)}>
            <option value="">— Choisir un prof —</option>
            {allProfs.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        ) : (
          <select className="ctrl-select" value={groupe} onChange={e => setGroupe(e.target.value)}>
            <option value="">— Choisir une classe —</option>
            {allGroupes.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        )}

        <button className="print-btn" onClick={() => window.print()}>
          Imprimer / PDF
        </button>
      </div>

      <div className="content">
        {tab === 'classe' && <ViewClasse exams={exams} partData={partData} groupe={groupe} />}
        {tab === 'prof'   && <ViewProf   exams={exams} partData={partData} prof={prof}     />}
        {tab === 'eleve'  && <ViewEleve  exams={exams} partData={partData} groupe={groupe} />}
      </div>
    </>
  )
}
