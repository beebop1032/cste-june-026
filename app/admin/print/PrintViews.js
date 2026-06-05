'use client'
import { useState, useMemo } from 'react'

function fmtJour(iso) {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long' })
}
function fmtJourCourt(iso) {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('fr-BE', { weekday: 'short', day: 'numeric', month: 'short' })
}

const PART_LABEL = {
  annule: { txt: 'Annulé',          cls: 'p-an' },
  tous:   { txt: 'Tous les élèves', cls: 'p-to' },
  liste:  { txt: null,              cls: 'p-li' },
}

function PartBadge({ p }) {
  if (!p) return <span className="p-ns">–</span>
  const info = PART_LABEL[p.type]
  const txt  = p.type === 'liste' ? `${p.nEleves} él.` : info.txt
  return <span className={`pbadge ${info.cls}`}>{txt}</span>
}

// ── Styles ────────────────────────────────────────────────────────────────────

const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Source+Sans+3:ital,wght@0,400;0,600;0,700;1,400&family=Playfair+Display:wght@700&family=JetBrains+Mono:wght@400;500&display=swap');

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --navy:         #1a3254;
  --navy-mid:     #243e62;
  --navy-light:   #2d5282;
  --gold:         #b8893a;
  --gold-bg:      #fdf4e3;
  --bg:           #f2f1ed;
  --white:        #ffffff;
  --off-white:    #faf9f6;
  --text:         #1c1c1c;
  --muted:        #64748b;
  --subtle:       #94a3b8;
  --border:       #ddd8ce;
  --border-light: #ebe7df;
  --radius:       8px;
  --shadow:       0 2px 8px rgba(0,0,0,.07), 0 1px 3px rgba(0,0,0,.05);
}

body {
  font-family: 'Source Sans 3', system-ui, sans-serif;
  font-size: 13.5px;
  line-height: 1.5;
  background: var(--bg);
  color: var(--text);
  -webkit-font-smoothing: antialiased;
}

/* ── Top bar ───────────────────────────────────────────── */
.topbar {
  background: var(--navy);
  height: 52px;
  padding: 0 28px;
  display: flex;
  align-items: center;
  gap: 16px;
  box-shadow: 0 2px 12px rgba(0,0,0,.22);
}
.back-link {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 12px; color: rgba(255,255,255,.55); text-decoration: none;
  padding: 4px 9px; border-radius: 5px; transition: background .15s;
}
.back-link:hover { background: rgba(255,255,255,.1); color: #fff; }
.topbar-title { font-size: 15px; font-weight: 600; color: #fff; letter-spacing: -.1px; }
.topbar-sub   { font-size: 11px; color: rgba(255,255,255,.4); margin-top: 1px; }

/* ── Controls bar ──────────────────────────────────────── */
.controls {
  background: var(--white);
  border-bottom: 1px solid var(--border);
  padding: 10px 28px;
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  position: sticky; top: 0; z-index: 40;
  box-shadow: 0 2px 6px rgba(0,0,0,.05);
}
.tab-pill {
  border: 1.5px solid var(--border); background: var(--white); color: var(--muted);
  padding: 5px 15px; border-radius: 20px; font-size: 12px; font-weight: 600;
  cursor: pointer; font-family: inherit; transition: all .15s; letter-spacing: .05px;
}
.tab-pill.active  { background: var(--navy); color: #fff; border-color: var(--navy); }
.tab-pill:hover:not(.active) { border-color: var(--navy); color: var(--navy); }
.ctrl-sep { width: 1px; height: 20px; background: var(--border); flex-shrink: 0; }
.ctrl-select {
  border: 1.5px solid var(--border); background: var(--white); color: var(--text);
  padding: 6px 30px 6px 11px; border-radius: 7px; font-size: 12px; font-family: inherit;
  cursor: pointer; min-width: 210px; appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4 6l4 4 4-4'/%3E%3C/svg%3E");
  background-repeat: no-repeat; background-position: right 8px center;
  transition: border-color .15s, box-shadow .15s;
}
.ctrl-select:focus { outline: none; border-color: var(--navy); box-shadow: 0 0 0 3px rgba(26,50,84,.11); }
.print-btn {
  margin-left: auto; background: var(--navy); color: #fff; border: none;
  padding: 7px 18px; border-radius: 7px; font-family: inherit; font-size: 12px;
  font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 7px;
  transition: background .15s;
}
.print-btn:hover { background: #122640; }

/* ── Content ───────────────────────────────────────────── */
.content { max-width: 880px; margin: 0 auto; padding: 28px 28px 80px; }

/* ── Section wrapper ───────────────────────────────────── */
.section { margin-bottom: 28px; border-radius: var(--radius); overflow: hidden; box-shadow: var(--shadow); }

.section-hdr {
  background: var(--navy);
  padding: 14px 22px;
  display: flex; align-items: baseline; gap: 14px;
}
.section-hdr h2 {
  font-family: 'Playfair Display', Georgia, serif;
  font-size: 17px; font-weight: 700; color: #fff; letter-spacing: -.2px;
}
.section-hdr-sub { font-size: 11px; color: rgba(255,255,255,.4); }

.section-body {
  background: var(--white);
  border: 1px solid var(--border); border-top: none;
  border-radius: 0 0 var(--radius) var(--radius);
}

/* ── Day group ─────────────────────────────────────────── */
.day-group { }
.day-group:not(:last-child) { border-bottom: 1px solid var(--border); }
.day-label {
  padding: 6px 20px;
  background: var(--off-white); border-bottom: 1px solid var(--border-light);
  font-size: 10px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .9px; color: var(--navy-light);
}

/* ── Exam row ──────────────────────────────────────────── */
.exam-row {
  display: grid; grid-template-columns: 50px 1fr auto;
  gap: 14px; align-items: start;
  padding: 11px 20px;
  border-bottom: 1px solid var(--border-light);
  transition: background .1s;
}
.exam-row:last-child { border-bottom: none; }
.exam-row:hover { background: var(--off-white); }
.exam-per {
  font-size: 10px; font-weight: 700; letter-spacing: .3px;
  color: var(--navy-light); text-transform: uppercase; padding-top: 2px;
}
.exam-main { display: flex; flex-direction: column; gap: 3px; }
.exam-title { font-weight: 700; font-size: 13px; color: var(--text); }
.exam-meta {
  font-size: 11px; color: var(--muted);
  display: flex; gap: 12px; flex-wrap: wrap; align-items: center;
}
.exam-meta .mono {
  font-family: 'JetBrains Mono', monospace; font-size: 10px;
  background: var(--bg); padding: 1px 5px; border-radius: 3px; color: var(--muted);
}
.exam-right { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; padding-top: 1px; }
.surv-tag {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 10.5px; font-weight: 600; color: #065f46;
}
.surv-tag::before {
  content: ''; display: inline-block; width: 5px; height: 5px;
  background: #10b981; border-radius: 50%;
}

/* ── Student chips ─────────────────────────────────────── */
.student-grid { display: flex; flex-wrap: wrap; gap: 4px 5px; margin-top: 7px; }
.student-chip {
  background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af;
  border-radius: 4px; padding: 1px 7px; font-size: 11px; font-weight: 600; letter-spacing: .05px;
}

/* ── Participation badges ───────────────────────────────── */
.pbadge {
  display: inline-flex; align-items: center;
  padding: 2px 8px; border-radius: 4px; font-weight: 700; font-size: 11px;
}
.p-an { background: #fde8e8; color: #991b1b; border: 1px solid #fca5a5; }
.p-to { background: #d1fae5; color: #065f46; border: 1px solid #6ee7b7; }
.p-li { background: #dbeafe; color: #1e40af; border: 1px solid #93c5fd; }
.p-ns { color: var(--subtle); font-style: italic; font-size: 11px; }

/* ── Prof table ────────────────────────────────────────── */
.prof-table { width: 100%; border-collapse: collapse; }
.prof-table th {
  padding: 8px 14px; text-align: left; background: var(--off-white);
  font-weight: 700; font-size: 10px; color: var(--navy);
  text-transform: uppercase; letter-spacing: .7px;
  border-bottom: 2px solid var(--border);
  white-space: nowrap;
}
.prof-table td {
  padding: 9px 14px; border-bottom: 1px solid var(--border-light);
  vertical-align: middle; font-size: 12.5px;
}
.prof-table tbody tr:hover td { background: var(--off-white); }
.prof-table tbody tr:last-child td { border-bottom: none; }
.mono { font-family: 'JetBrains Mono', monospace; font-size: 10.5px; color: var(--muted); }
.surv-y { color: #065f46; font-weight: 700; }
.surv-n { color: var(--subtle); }

/* ── Convocation grid ──────────────────────────────────── */
.conv-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 14px; padding: 18px 20px;
}
.conv-card {
  border: 1.5px solid var(--border); border-radius: 8px;
  overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,.06);
}
.conv-card-hdr {
  background: linear-gradient(135deg, var(--navy) 0%, var(--navy-mid) 100%);
  padding: 10px 14px; position: relative; border-bottom: 2px solid var(--gold);
}
.conv-card-hdr .name  { font-weight: 700; font-size: 13.5px; color: #fff; letter-spacing: -.1px; }
.conv-card-hdr .classe { font-size: 10px; color: rgba(255,255,255,.48); margin-top: 2px; text-transform: uppercase; letter-spacing: .5px; }
.conv-card-body { padding: 10px 14px; display: flex; flex-direction: column; gap: 0; background: var(--white); }
.conv-exam {
  display: flex; gap: 8px; align-items: baseline;
  padding: 5px 0; border-bottom: 1px solid var(--border-light);
  font-size: 11.5px;
}
.conv-exam:last-child { border-bottom: none; }
.conv-exam .cdate { color: var(--muted); min-width: 84px; flex-shrink: 0; font-size: 10.5px; }
.conv-exam .cmat  { font-weight: 600; color: var(--text); flex: 1; }
.conv-exam .croom {
  font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--muted);
  background: var(--bg); padding: 1px 5px; border-radius: 3px;
}

/* ── Empty states ──────────────────────────────────────── */
.empty {
  padding: 60px 32px; text-align: center; color: var(--muted);
}
.empty svg { opacity: .3; margin-bottom: 14px; }
.empty p   { font-size: 14px; margin-bottom: 5px; }
.empty small { font-size: 12px; color: var(--subtle); }

/* ── Print media ───────────────────────────────────────── */
@media print {
  @page { size: A4 portrait; margin: 12mm 15mm; }

  .topbar, .controls { display: none !important; }
  .content { padding: 0; max-width: none; }

  body { font-size: 11px; background: #fff; }

  .section { box-shadow: none; border: 1px solid #c8c2b8; break-inside: avoid; margin-bottom: 18px; }
  .section-hdr { -webkit-print-color-adjust: exact; print-color-adjust: exact; padding: 10px 16px; }
  .section-hdr h2 { font-size: 13px; }
  .section-body { border-radius: 0; }

  .day-label  { -webkit-print-color-adjust: exact; print-color-adjust: exact; padding: 4px 14px; }
  .exam-row   { padding: 6px 14px; }
  .exam-row:hover { background: none; }

  .conv-card-hdr { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .conv-grid { gap: 8px; padding: 10px 12px; grid-template-columns: repeat(3, 1fr); }
  .conv-card { break-inside: avoid; }

  .prof-table th, .prof-table td { padding: 4px 10px; }
  .prof-table tbody tr:hover td  { background: none; }
}
`

// ── Helpers ───────────────────────────────────────────────────────────────────

function keep(p) { return p && p.type !== 'annule' }

// ── View: Par Classe ──────────────────────────────────────────────────────────

function ViewClasse({ exams, partData, groupe }) {
  const gExams = useMemo(() =>
    exams
      .filter(e => e.groupe === groupe && keep(partData[e.id]))
      .sort((a, b) => a.jour.localeCompare(b.jour) || a.periode.localeCompare(b.periode)),
    [exams, partData, groupe]
  )

  const byJour = useMemo(() => {
    const m = new Map()
    for (const ex of gExams) {
      if (!m.has(ex.jour)) m.set(ex.jour, [])
      m.get(ex.jour).push(ex)
    }
    return m
  }, [gExams])

  if (!groupe) return (
    <div className="empty">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
      <p>Sélectionne une classe pour afficher ses examens.</p>
    </div>
  )

  if (gExams.length === 0) return (
    <div className="empty">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
      <p>Aucun examen maintenu pour la classe {groupe}.</p>
      <small>Tous les examens sont annulés ou en attente de données.</small>
    </div>
  )

  return (
    <div className="section">
      <div className="section-hdr">
        <h2>Classe {groupe}</h2>
        <span className="section-hdr-sub">{gExams.length} examen{gExams.length !== 1 ? 's' : ''} · Juin 2026</span>
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
                      <span>Prof <span className="mono">{ex.profCode}</span></span>
                      <span>Salle <span className="mono">{ex.local}</span></span>
                      {p?.surveilleParTitulaire && <span className="surv-tag">Surveillé par le titulaire</span>}
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
    </div>
  )
}

// ── View: Par Prof ────────────────────────────────────────────────────────────

function ViewProf({ exams, partData, prof }) {
  const pExams = useMemo(() =>
    exams
      .filter(e => e.profCode === prof && keep(partData[e.id]))
      .sort((a, b) => a.jour.localeCompare(b.jour) || a.periode.localeCompare(b.periode)),
    [exams, partData, prof]
  )

  if (!prof) return (
    <div className="empty">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
      </svg>
      <p>Sélectionne un prof pour afficher son planning de surveillance.</p>
    </div>
  )

  if (pExams.length === 0) return (
    <div className="empty">
      <p>Aucun examen à surveiller pour le prof {prof}.</p>
      <small>Tous ses examens sont annulés ou en attente de données.</small>
    </div>
  )

  return (
    <div className="section">
      <div className="section-hdr">
        <h2>Prof {prof} — Surveillance</h2>
        <span className="section-hdr-sub">{pExams.length} examen{pExams.length !== 1 ? 's' : ''} · Juin 2026</span>
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
              <th>Participation</th>
              <th>Tit.</th>
            </tr>
          </thead>
          <tbody>
            {pExams.map(ex => {
              const p = partData[ex.id]
              return (
                <tr key={ex.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtJourCourt(ex.jour)}</td>
                  <td style={{ fontWeight: 700 }}>{ex.periode}</td>
                  <td style={{ fontWeight: 600 }}>{ex.matiere}</td>
                  <td style={{ fontWeight: 700 }}>{ex.groupe}</td>
                  <td className="mono">{ex.local}</td>
                  <td><PartBadge p={p} /></td>
                  <td className={p?.surveilleParTitulaire ? 'surv-y' : 'surv-n'}>
                    {p?.surveilleParTitulaire ? 'Oui' : '–'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── View: Par Élève ───────────────────────────────────────────────────────────

function ViewEleve({ exams, partData, groupe }) {
  const students = useMemo(() => {
    if (!groupe) return []
    const map = new Map()
    const gExams = exams
      .filter(e => e.groupe === groupe && keep(partData[e.id]))
      .sort((a, b) => a.jour.localeCompare(b.jour) || a.periode.localeCompare(b.periode))

    for (const ex of gExams) {
      const p = partData[ex.id]
      if (!p || p.type === 'annule') continue
      if (p.type === 'tous') {
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

  if (!groupe) return (
    <div className="empty">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
      <p>Sélectionne une classe pour afficher les convocations élèves.</p>
    </div>
  )

  if (students.length === 0) return (
    <div className="empty">
      <p>Aucune donnée élève disponible pour la classe {groupe}.</p>
      <small>En attente des soumissions des professeurs.</small>
    </div>
  )

  return (
    <div className="section">
      <div className="section-hdr">
        <h2>Classe {groupe} — Convocations</h2>
        <span className="section-hdr-sub">{students.length} élève{students.length !== 1 ? 's' : ''} · Juin 2026</span>
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
                    <span className="cdate">{fmtJourCourt(ex.jour)} <strong>{ex.periode}</strong></span>
                    <span className="cmat">{ex.matiere}</span>
                    <span className="croom">{ex.local}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'classe', label: 'Par classe' },
  { id: 'prof',   label: 'Par prof'   },
  { id: 'eleve',  label: 'Par élève'  },
]

const PrintIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 6 2 18 2 18 9"/>
    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
    <rect x="6" y="14" width="12" height="8"/>
  </svg>
)

const BackIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 12H5M12 19l-7-7 7-7"/>
  </svg>
)

export default function PrintViews({ exams, partData, allGroupes, allProfs }) {
  const [tab,    setTab]    = useState('classe')
  const [groupe, setGroupe] = useState('')
  const [prof,   setProf]   = useState('')

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />

      {/* Top bar */}
      <div className="topbar">
        <a href="/admin" className="back-link">
          <BackIcon /> Admin
        </a>
        <img src="/logo.png" alt="Collège des Hayeffes" width={120} height={48} style={{ height: 26, width: 'auto', filter: 'brightness(0) invert(1)', opacity: .85 }} />
        <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,.2)' }} />
        <div>
          <div className="topbar-title">Vues imprimables</div>
          <div className="topbar-sub">Examens juin 2026 — Collège des Hayeffes</div>
        </div>
      </div>

      {/* Controls */}
      <div className="controls">
        {TABS.map(t => (
          <button key={t.id} className={`tab-pill${tab === t.id ? ' active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}

        <div className="ctrl-sep" />

        {tab === 'prof' ? (
          <select className="ctrl-select" value={prof} onChange={e => setProf(e.target.value)}>
            <option value="">— Choisir un professeur —</option>
            {allProfs.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        ) : (
          <select className="ctrl-select" value={groupe} onChange={e => setGroupe(e.target.value)}>
            <option value="">— Choisir une classe —</option>
            {allGroupes.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        )}

        <button className="print-btn" onClick={() => window.print()}>
          <PrintIcon /> Imprimer / PDF
        </button>
      </div>

      {/* Content */}
      <div className="content">
        {tab === 'classe' && <ViewClasse exams={exams} partData={partData} groupe={groupe} />}
        {tab === 'prof'   && <ViewProf   exams={exams} partData={partData} prof={prof}     />}
        {tab === 'eleve'  && <ViewEleve  exams={exams} partData={partData} groupe={groupe} />}
      </div>
    </>
  )
}
