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

/* ── Élève sidebar ─────────────────────────────────────── */
.eleve-layout { display: flex; }
.eleve-sidebar {
  width: 210px; flex-shrink: 0;
  border-right: 1px solid var(--border);
  background: var(--off-white);
  max-height: calc(100vh - 104px); overflow-y: auto;
  position: sticky; top: 52px; align-self: flex-start;
}
.eleve-sidebar-hdr {
  padding: 8px 14px; font-size: 10px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .8px; color: var(--navy); border-bottom: 1px solid var(--border);
  background: var(--off-white); position: sticky; top: 0; z-index: 1;
}
.eleve-sidebar-item {
  display: block; width: 100%; text-align: left;
  padding: 7px 14px; font-size: 12px; font-family: inherit;
  color: var(--text); background: none; border: none; cursor: pointer;
  border-bottom: 1px solid var(--border-light); transition: background .1s;
}
.eleve-sidebar-item:hover:not(.active) { background: var(--border-light); }
.eleve-sidebar-item.active { background: var(--navy); color: #fff; font-weight: 600; }
.eleve-content { flex: 1; min-width: 0; }

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

/* ── PDF Page (A4 preview) ─────────────────────────────── */
.pdf-wrap { background: var(--bg); padding: 24px 0 80px; }

.pdf-page {
  width: 210mm; min-height: 297mm;
  margin: 0 auto 32px;
  padding: 22mm 22mm 18mm;
  background: #fff;
  box-shadow: 0 4px 20px rgba(0,0,0,.13), 0 1px 4px rgba(0,0,0,.07);
  display: flex; flex-direction: column; position: relative;
}

.pdf-school-hdr {
  display: flex; align-items: flex-start; justify-content: space-between;
  border-bottom: 2.5px solid var(--navy); padding-bottom: 10px; margin-bottom: 20px;
}
.pdf-school-name { font-size: 15px; font-weight: 700; color: var(--navy); letter-spacing: -.3px; }
.pdf-school-sub  { font-size: 10px; color: var(--muted); margin-top: 2px; }
.pdf-school-date { font-size: 10px; color: var(--muted); text-align: right; padding-top: 2px; }

.pdf-subject { margin-bottom: 14px; }
.pdf-subject-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.2px; color: var(--muted); margin-bottom: 4px; }
.pdf-subject-value { font-size: 24px; font-weight: 700; color: var(--navy); font-family: 'Playfair Display', Georgia, serif; line-height: 1.15; }
.pdf-subject-meta  { font-size: 11px; color: var(--muted); margin-top: 4px; }

.pdf-notice {
  background: #fdfaf4; border-left: 3px solid var(--gold);
  padding: 9px 13px; border-radius: 0 4px 4px 0;
  font-size: 11.5px; color: var(--muted); margin-bottom: 18px; line-height: 1.65; font-style: italic;
}

.pdf-table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
.pdf-table th {
  padding: 7px 10px; text-align: left; background: var(--navy);
  color: #fff; font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .6px;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.pdf-table td { padding: 8px 10px; border-bottom: 1px solid var(--border-light); font-size: 12px; vertical-align: top; }
.pdf-table tbody tr:nth-child(even) td { background: #fafaf8; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

.pdf-students { display: flex; flex-wrap: wrap; gap: 3px 4px; margin-top: 5px; }
.pdf-student-chip {
  font-size: 9.5px; background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af;
  border-radius: 3px; padding: 1px 5px;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}

.pdf-signature {
  display: flex; justify-content: space-between; align-items: flex-end;
  margin-top: 28px; padding-top: 16px;
}
.pdf-signature-block { font-size: 10.5px; color: var(--muted); }
.pdf-signature-line {
  width: 130px; border-bottom: 1px solid #aaa;
  margin-top: 28px; font-size: 9px; color: var(--subtle); text-align: center; padding-top: 3px;
}

.pdf-footer {
  margin-top: auto; padding-top: 14px;
  border-top: 1px solid var(--border); font-size: 9.5px; color: var(--subtle); line-height: 1.5;
}

.pdf-count-badge {
  background: var(--navy); color: #fff; border-radius: 20px;
  padding: 3px 12px; font-size: 11px; font-weight: 600;
}

/* ── Print media ───────────────────────────────────────── */
@media print {
  @page { size: A4 portrait; margin: 12mm 15mm; }

  .no-print, .topbar, .controls { display: none !important; }
  .content { padding: 0; max-width: none; }

  body { font-size: 11px; background: #fff; }

  .section { box-shadow: none; border: 1px solid #c8c2b8; break-inside: avoid; margin-bottom: 18px; }
  .section-hdr { -webkit-print-color-adjust: exact; print-color-adjust: exact; padding: 10px 16px; }
  .section-hdr h2 { font-size: 13px; }
  .section-body { border-radius: 0; }

  .day-label  { -webkit-print-color-adjust: exact; print-color-adjust: exact; padding: 4px 14px; }
  .exam-row   { padding: 6px 14px; }
  .exam-row:hover { background: none; }

  .eleve-sidebar { display: none !important; }
  .eleve-layout { display: block; }
  .conv-card-hdr { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .conv-grid { gap: 8px; padding: 10px 12px; grid-template-columns: repeat(3, 1fr); }
  .conv-card { break-inside: avoid; }

  .prof-table th, .prof-table td { padding: 4px 10px; }
  .prof-table tbody tr:hover td  { background: none; }

  /* PDF pages */
  .pdf-wrap { background: none; padding: 0; }
  .pdf-page {
    width: 100%; min-height: 0; margin: 0; padding: 0;
    box-shadow: none; break-after: page; page-break-after: always;
  }
  .pdf-page:last-child { break-after: avoid; page-break-after: avoid; }
}
`

// ── Helpers ───────────────────────────────────────────────────────────────────

function keep(p) { return p && p.type !== 'annule' }

// ── View: Par Classe ──────────────────────────────────────────────────────────

function ViewClasse({ exams, partData, groupe, manuscriptGroupes = [] }) {
  // Build entries: official groupe match (case-insensitive) + cross-match via el.classe
  const gEntries = useMemo(() => {
    if (!groupe) return []
    const upper = groupe.toUpperCase()
    const seen = new Set()
    const result = []
    for (const ex of exams) {
      const p = partData[ex.id]
      if (!keep(p)) continue
      if (ex.groupe.toUpperCase() === upper) {
        if (!seen.has(ex.id)) { result.push({ ex, p }); seen.add(ex.id) }
      } else if (p?.type === 'liste') {
        const matching = p.eleves.filter(el => el.classe?.trim().toUpperCase() === upper)
        if (matching.length > 0 && !seen.has(ex.id)) {
          result.push({ ex, p: { ...p, eleves: matching, nEleves: matching.length }, fromOtherGroupe: ex.groupe })
          seen.add(ex.id)
        }
      }
    }
    return result.sort((a, b) => a.ex.jour.localeCompare(b.ex.jour) || a.ex.periode.localeCompare(b.ex.periode))
  }, [exams, partData, groupe])

  const byJour = useMemo(() => {
    const m = new Map()
    for (const entry of gEntries) {
      if (!m.has(entry.ex.jour)) m.set(entry.ex.jour, [])
      m.get(entry.ex.jour).push(entry)
    }
    return m
  }, [gEntries])

  if (!groupe) return (
    <div className="empty">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
      <p>Sélectionne une classe pour afficher ses examens.</p>
    </div>
  )

  if (gEntries.length === 0) return (
    <div className="empty">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
      <p>Aucun examen maintenu pour la classe {groupe}.</p>
      <small>Tous les examens sont annulés ou en attente de données.</small>
    </div>
  )

  const isManuscript = manuscriptGroupes.includes(groupe)

  return (
    <div className="section">
      <div className="section-hdr">
        <h2>Classe {groupe}{isManuscript ? ' — manuscrit' : ''}</h2>
        <span className="section-hdr-sub">{gEntries.length} examen{gEntries.length !== 1 ? 's' : ''} · Juin 2026</span>
      </div>
      <div className="section-body">
        {[...byJour.entries()].map(([jour, jEntries]) => (
          <div key={jour} className="day-group">
            <div className="day-label">{fmtJour(jour)}</div>
            {jEntries.map(({ ex, p, fromOtherGroupe }) => (
              <div key={ex.id} className="exam-row">
                <div className="exam-per">{ex.periode}</div>
                <div className="exam-main">
                  <div className="exam-title">{ex.matiere}</div>
                  <div className="exam-meta">
                    <span>Prof <span className="mono">{ex.profCode}</span></span>
                    {fromOtherGroupe && <span className="mono" style={{ color: 'var(--gold)' }}>→ {fromOtherGroupe}</span>}
                    {p?.surveilleParTitulaire && <span className="surv-tag">Surveillé par le titulaire</span>}
                  </div>
                  {p?.type === 'liste' && p.eleves.length > 0 && (
                    <div className="student-grid">
                      {p.eleves.map((el, i) => (
                        <span key={i} className="student-chip">
                          {el.prenom} {el.nom}
                          {el.classe && el.classe.trim().toUpperCase() !== groupe.toUpperCase() && (
                            <span style={{ fontSize: 9, fontWeight: 400, opacity: 0.55, marginLeft: 3 }}>{el.classe}</span>
                          )}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="exam-right">
                  <PartBadge p={p} />
                </div>
              </div>
            ))}
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

function ViewEleve({ exams, partData, groupe, selectedEleve, onSelectEleve }) {
  const allStudents = useMemo(() => {
    if (!groupe) return []
    const upper = groupe.toUpperCase()
    const map = new Map()
    const seen = new Set()
    const sortedExams = [...exams].sort((a, b) => a.jour.localeCompare(b.jour) || a.periode.localeCompare(b.periode))
    for (const ex of sortedExams) {
      const p = partData[ex.id]
      if (!p || p.type === 'annule') continue
      const isOfficialMatch = ex.groupe.toUpperCase() === upper
      if (isOfficialMatch) {
        if (p.type === 'tous') {
          const key = '__tous__'
          if (!map.has(key)) map.set(key, { key, nom: '(tous les élèves)', prenom: '', exams: [] })
          if (!seen.has(ex.id + '__tous__')) { map.get(key).exams.push(ex); seen.add(ex.id + '__tous__') }
        } else if (p.type === 'liste' && p.eleves.length > 0) {
          for (const el of p.eleves) {
            const key = `${(el.nom || '').toUpperCase()}|${(el.prenom || '').toLowerCase()}`
            if (!map.has(key)) map.set(key, { key, nom: el.nom ?? '', prenom: el.prenom ?? '', exams: [] })
            if (!seen.has(ex.id + key)) { map.get(key).exams.push(ex); seen.add(ex.id + key) }
          }
        }
      } else if (p.type === 'liste') {
        // Cross-match: include students from other groups whose el.classe matches
        for (const el of p.eleves) {
          if (el.classe?.trim().toUpperCase() !== upper) continue
          const key = `${(el.nom || '').toUpperCase()}|${(el.prenom || '').toLowerCase()}`
          if (!map.has(key)) map.set(key, { key, nom: el.nom ?? '', prenom: el.prenom ?? '', exams: [] })
          if (!seen.has(ex.id + key)) { map.get(key).exams.push(ex); seen.add(ex.id + key) }
        }
      }
    }
    return [...map.values()].sort((a, b) => a.nom.localeCompare(b.nom) || a.prenom.localeCompare(b.prenom))
  }, [exams, partData, groupe])

  const displayed = selectedEleve
    ? allStudents.filter(st => st.key === selectedEleve)
    : allStudents

  if (!groupe) return (
    <div className="empty">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
      <p>Sélectionne une classe pour afficher les convocations élèves.</p>
    </div>
  )

  if (allStudents.length === 0) return (
    <div className="empty">
      <p>Aucune donnée élève disponible pour la classe {groupe}.</p>
      <small>En attente des soumissions des professeurs.</small>
    </div>
  )

  const single = displayed.length === 1 ? displayed[0] : null

  return (
    <div className="section">
      <div className="section-hdr">
        <h2>{single ? `${single.prenom} ${single.nom}` : `Classe ${groupe} — Convocations`}</h2>
        <span className="section-hdr-sub">
          {single ? `1 / ${allStudents.length} élève${allStudents.length !== 1 ? 's' : ''}` : `${allStudents.length} élève${allStudents.length !== 1 ? 's' : ''}`}
          {' · Juin 2026'}
        </span>
      </div>
      <div className="section-body">
        <div className="eleve-layout">
          {/* Sidebar: alphabetical student list — hidden in print */}
          <div className="eleve-sidebar">
            <div className="eleve-sidebar-hdr">Élèves ({allStudents.length})</div>
            {allStudents.map(st => (
              <button
                key={st.key}
                className={`eleve-sidebar-item${selectedEleve === st.key ? ' active' : ''}`}
                onClick={() => onSelectEleve(selectedEleve === st.key ? '' : st.key)}
              >
                {st.nom} {st.prenom}
              </button>
            ))}
          </div>
          {/* Main content */}
          <div className="eleve-content">
            <div className="conv-grid">
              {displayed.map((st, i) => (
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
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── View: PDF par Classe ──────────────────────────────────────────────────────

const PDF_DATE = new Date().toLocaleDateString('fr-BE', { day: 'numeric', month: 'long', year: 'numeric' })

function ViewPdfClasses({ exams, partData, allGroupes, manuscriptGroupes = [] }) {
  const pages = useMemo(() => {
    const allGroups = [...allGroupes, ...manuscriptGroupes]
    return allGroups.map(groupe => {
      const upper = groupe.toUpperCase()
      const gExams = []
      for (const ex of exams) {
        const p = partData[ex.id]
        if (!keep(p)) continue
        if (ex.groupe.toUpperCase() !== upper) continue
        gExams.push({ ex, p })
      }
      gExams.sort((a, b) => a.ex.jour.localeCompare(b.ex.jour) || a.ex.periode.localeCompare(b.ex.periode))
      return { groupe, exams: gExams }
    }).filter(g => g.exams.length > 0)
  }, [exams, partData, allGroupes, manuscriptGroupes])

  if (pages.length === 0) return (
    <div className="empty"><p>Aucune donnée disponible.</p><small>En attente des soumissions.</small></div>
  )

  return (
    <div className="pdf-wrap">
      {pages.map(({ groupe, exams: gExams }) => (
        <div key={groupe} className="pdf-page">
          <div className="pdf-school-hdr">
            <div>
              <div className="pdf-school-name">Collège des Hayeffes</div>
              <div className="pdf-school-sub">Session d'examens — Juin 2026</div>
            </div>
            <div className="pdf-school-date">{PDF_DATE}</div>
          </div>

          <div className="pdf-subject">
            <div className="pdf-subject-label">Examens maintenus</div>
            <div className="pdf-subject-value">Classe {groupe}</div>
            <div className="pdf-subject-meta">{gExams.length} examen{gExams.length !== 1 ? 's' : ''} lors de la session de juin 2026</div>
          </div>

          <div className="pdf-notice">
            Vous trouverez ci-dessous la liste des examens maintenus pour votre classe lors de la session de juin 2026.
            Prière de vous présenter à l'heure indiquée. Toute absence doit être signalée préalablement.
            <br /><em>[Texte à compléter — instructions spécifiques, remarques générales, etc.]</em>
          </div>

          <table className="pdf-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Pér.</th>
                <th>Matière</th>
                <th>Prof</th>
                <th>Élèves concernés</th>
              </tr>
            </thead>
            <tbody>
              {gExams.map(({ ex, p }) => (
                <tr key={ex.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtJour(ex.jour)}</td>
                  <td style={{ fontWeight: 700 }}>{ex.periode}</td>
                  <td style={{ fontWeight: 600 }}>{ex.matiere}</td>
                  <td><span className="mono">{ex.profCode}</span></td>
                  <td>
                    {p.type === 'tous' ? (
                      <span style={{ color: '#065f46', fontWeight: 600 }}>Toute la classe</span>
                    ) : (
                      <>
                        <span style={{ color: '#1e40af', fontWeight: 600 }}>{p.nEleves} élève{p.nEleves !== 1 ? 's' : ''}</span>
                        {p.eleves?.length > 0 && (
                          <div className="pdf-students">
                            {p.eleves.map((el, i) => (
                              <span key={i} className="pdf-student-chip">{el.prenom} {el.nom}</span>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="pdf-footer">
            Collège des Hayeffes — Session de juin 2026 — Document réservé à usage interne
          </div>
        </div>
      ))}
    </div>
  )
}

// ── View: PDF par Élève ───────────────────────────────────────────────────────

function ViewPdfEleves({ exams, partData, allGroupes, manuscriptGroupes = [] }) {
  const pages = useMemo(() => {
    const students = []
    const studentMap = new Map()

    const sortedExams = [...exams].sort((a, b) => a.jour.localeCompare(b.jour) || a.periode.localeCompare(b.periode))

    for (const ex of sortedExams) {
      const p = partData[ex.id]
      if (!p || p.type === 'annule' || p.type !== 'liste') continue
      if (!p.eleves?.length) continue

      for (const el of p.eleves) {
        const classe = (el.classe?.trim().toUpperCase()) || ex.groupe.toUpperCase()
        const key = `${(el.nom || '').toUpperCase()}||${(el.prenom || '').toLowerCase()}||${classe}`
        if (!studentMap.has(key)) {
          studentMap.set(key, students.length)
          students.push({ nom: el.nom ?? '', prenom: el.prenom ?? '', classe, exams: [] })
        }
        students[studentMap.get(key)].exams.push(ex)
      }
    }

    return students.sort((a, b) => a.classe.localeCompare(b.classe) || a.nom.localeCompare(b.nom) || a.prenom.localeCompare(b.prenom))
  }, [exams, partData])

  if (pages.length === 0) return (
    <div className="empty">
      <p>Aucune liste nominative disponible.</p>
      <small>Les convocations individuelles nécessitent des examens avec liste nominative d'élèves.</small>
    </div>
  )

  return (
    <div className="pdf-wrap">
      {pages.map((st, i) => (
        <div key={i} className="pdf-page">
          <div className="pdf-school-hdr">
            <div>
              <div className="pdf-school-name">Collège des Hayeffes</div>
              <div className="pdf-school-sub">Convocation individuelle — Session de juin 2026</div>
            </div>
            <div className="pdf-school-date">{PDF_DATE}</div>
          </div>

          <div className="pdf-subject">
            <div className="pdf-subject-label">Convocation individuelle</div>
            <div className="pdf-subject-value">{st.prenom} {st.nom}</div>
            <div className="pdf-subject-meta">Classe {st.classe} — {st.exams.length} examen{st.exams.length !== 1 ? 's' : ''} à repasser</div>
          </div>

          <div className="pdf-notice">
            Cher(ère) élève, vous êtes convoqué(e) aux examens suivants lors de la session de juin 2026.
            Prière de vous présenter ponctuellement, muni(e) de votre matériel scolaire habituel.
            <br /><em>[Texte à compléter — consignes spécifiques, local, etc.]</em>
          </div>

          <table className="pdf-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Période</th>
                <th>Matière</th>
                <th>Professeur</th>
              </tr>
            </thead>
            <tbody>
              {st.exams.map(ex => (
                <tr key={ex.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtJour(ex.jour)}</td>
                  <td style={{ fontWeight: 700 }}>{ex.periode}</td>
                  <td style={{ fontWeight: 600 }}>{ex.matiere}</td>
                  <td><span className="mono">{ex.profCode}</span></td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="pdf-signature">
            <div className="pdf-signature-block">
              <div>La Direction</div>
              <div className="pdf-signature-line">Signature</div>
            </div>
            <div className="pdf-signature-block" style={{ textAlign: 'right' }}>
              <div>Lu et approuvé</div>
              <div className="pdf-signature-line">Élève / Parent</div>
            </div>
          </div>

          <div className="pdf-footer">
            Collège des Hayeffes — Session de juin 2026 — Convocation individuelle confidentielle
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'classe',      label: 'Par classe'   },
  { id: 'prof',        label: 'Par prof'     },
  { id: 'eleve',       label: 'Par élève'    },
  { id: 'pdf-classes', label: 'PDF — Classes' },
  { id: 'pdf-eleves',  label: 'PDF — Élèves'  },
]

const PrintIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 6 2 18 2 18 9"/>
    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
    <rect x="6" y="14" width="12" height="8"/>
  </svg>
)
const DownloadIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/>
    <line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
)
const BackIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 12H5M12 19l-7-7 7-7"/>
  </svg>
)

function fmtJourCsv(iso) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('fr-BE', { weekday: 'short', day: 'numeric', month: 'short' })
}

function downloadCSV(csvRows, filename) {
  const headers = ['Jour', 'Pér.', 'Matière', 'Groupe', 'Prof', 'Nom', 'Prénom', 'Participation']
  const lines = [
    headers.join(';'),
    ...csvRows.map(r => [r.jour, r.periode, r.matiere, r.groupe, r.prof, r.nom, r.prenom, r.participation]
      .map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';'))
  ].join('\r\n')
  const blob = new Blob(['﻿' + lines], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

function buildCsvRows(exams, partData, filterFn) {
  const rows = []
  for (const ex of exams.filter(filterFn).sort((a, b) => a.jour.localeCompare(b.jour) || a.periode.localeCompare(b.periode))) {
    const p = partData[ex.id]
    if (!p) continue
    const base = { jour: fmtJourCsv(ex.jour), periode: ex.periode, matiere: ex.matiere, groupe: ex.groupe, prof: ex.profCode }
    if (p.type === 'annule')                          rows.push({ ...base, nom: '', prenom: '', participation: 'Annulé' })
    else if (p.type === 'tous')                       rows.push({ ...base, nom: '(tous)', prenom: '', participation: 'Tous les élèves' })
    else if (p.type === 'liste' && p.eleves.length)   p.eleves.forEach(el => rows.push({ ...base, nom: el.nom ?? '', prenom: el.prenom ?? '', participation: 'Liste nominative' }))
  }
  return rows
}

export default function PrintViews({ exams, partData, allGroupes, allProfs, manuscriptGroupes = [] }) {
  const [tab,    setTab]    = useState('classe')
  const [groupe, setGroupe] = useState('')
  const [prof,   setProf]   = useState('')
  const [eleve,  setEleve]  = useState('')

  // Sorted student list for the élève tab (depends on groupe selection)
  const eleveList = useMemo(() => {
    if (tab !== 'eleve' || !groupe) return []
    const upper = groupe.toUpperCase()
    const map = new Map()
    for (const ex of exams) {
      const p = partData[ex.id]
      if (!keep(p) || p?.type !== 'liste') continue
      const isOfficialMatch = ex.groupe.toUpperCase() === upper
      for (const el of p.eleves) {
        if (!isOfficialMatch && el.classe?.trim().toUpperCase() !== upper) continue
        const key = `${(el.nom || '').toUpperCase()}|${(el.prenom || '').toLowerCase()}`
        if (!map.has(key)) map.set(key, { key, nom: el.nom ?? '', prenom: el.prenom ?? '' })
      }
    }
    return [...map.values()].sort((a, b) => a.nom.localeCompare(b.nom) || a.prenom.localeCompare(b.prenom))
  }, [exams, partData, groupe, tab])

  const currentKey = tab === 'prof' ? prof : groupe

  function handleDownloadCSV() {
    if (!currentKey) return
    if (tab === 'prof') {
      const rows = buildCsvRows(exams, partData, e => e.profCode === prof)
      downloadCSV(rows, `surveillance_${prof}.csv`)
    } else if (tab === 'eleve' && eleve) {
      const [nom, prenom] = eleve.split('|')
      const rows = buildCsvRows(exams, partData, e => {
        const p = partData[e.id]
        return e.groupe === groupe && p?.type === 'liste' &&
          p.eleves.some(el => (el.nom || '').toUpperCase() === nom && (el.prenom || '').toLowerCase() === prenom)
      })
      downloadCSV(rows, `convocation_${nom}_${prenom}.csv`)
    } else {
      const rows = buildCsvRows(exams, partData, e => e.groupe === groupe)
      downloadCSV(rows, `${tab === 'eleve' ? 'convocations' : 'examens'}_${groupe}.csv`)
    }
  }

  const isPdfTab = tab === 'pdf-classes' || tab === 'pdf-eleves'

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />

      {/* Controls */}
      <div className="controls">
        {TABS.map(t => (
          <button key={t.id} className={`tab-pill${tab === t.id ? ' active' : ''}`}
            onClick={() => { setTab(t.id); setEleve('') }}>
            {t.label}
          </button>
        ))}

        <div className="ctrl-sep" />

        {!isPdfTab && tab === 'prof' && (
          <select className="ctrl-select" value={prof} onChange={e => setProf(e.target.value)}>
            <option value="">— Choisir un professeur —</option>
            {allProfs.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        )}

        {!isPdfTab && tab !== 'prof' && (
          <select className="ctrl-select" value={groupe} onChange={e => { setGroupe(e.target.value); setEleve('') }}>
            <option value="">— Choisir une classe —</option>
            <optgroup label="Classes officielles">
              {allGroupes.map(g => <option key={g} value={g}>{g}</option>)}
            </optgroup>
            {manuscriptGroupes.length > 0 && (
              <optgroup label="Classes manuscrites">
                {manuscriptGroupes.map(g => <option key={g} value={g}>{g}</option>)}
              </optgroup>
            )}
          </select>
        )}

        {tab === 'eleve' && groupe && eleveList.length > 0 && (
          <select className="ctrl-select" value={eleve} onChange={e => setEleve(e.target.value)}
            style={{ minWidth: 200 }}>
            <option value="">— Tous les élèves —</option>
            {eleveList.map(el => (
              <option key={el.key} value={el.key}>{el.nom} {el.prenom}</option>
            ))}
          </select>
        )}

        {!isPdfTab && currentKey && (
          <button className="print-btn" style={{ background: '#2d6a4f', marginLeft: 0 }} onClick={handleDownloadCSV}>
            <DownloadIcon /> CSV
          </button>
        )}

        <button className="print-btn" onClick={() => window.print()}>
          <PrintIcon /> Imprimer / PDF
        </button>
      </div>

      {/* Content — classic views */}
      {!isPdfTab && (
        <div className="content">
          {tab === 'classe' && <ViewClasse exams={exams} partData={partData} groupe={groupe} manuscriptGroupes={manuscriptGroupes} />}
          {tab === 'prof'   && <ViewProf   exams={exams} partData={partData} prof={prof}     />}
          {tab === 'eleve'  && <ViewEleve  exams={exams} partData={partData} groupe={groupe} selectedEleve={eleve} onSelectEleve={setEleve} />}
        </div>
      )}

      {/* PDF views — full width, one A4 page per item */}
      {tab === 'pdf-classes' && <ViewPdfClasses exams={exams} partData={partData} allGroupes={allGroupes} manuscriptGroupes={manuscriptGroupes} />}
      {tab === 'pdf-eleves'  && <ViewPdfEleves  exams={exams} partData={partData} allGroupes={allGroupes} manuscriptGroupes={manuscriptGroupes} />}
    </>
  )
}
