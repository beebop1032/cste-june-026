'use client'
import { useState, useTransition } from 'react'
import { resetAllData } from '@/actions/admin'

export default function ResetButton() {
  const [isPending, startTransition] = useTransition()
  const [hover, setHover] = useState(false)

  function handleClick() {
    const ok = window.confirm(
      'RÉINITIALISATION COMPLÈTE\n\n' +
      'Cette action va :\n' +
      '• Supprimer toutes les réponses des professeurs\n' +
      '• Réinitialiser tous les statuts de classes\n\n' +
      'Cette action est irréversible.\n\n' +
      'Confirmer la réinitialisation ?'
    )
    if (!ok) return
    startTransition(() => resetAllData())
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '4px 10px', borderRadius: 5,
        background: hover ? 'rgba(255,255,255,.1)' : 'transparent',
        border: '1px solid rgba(255,255,255,.18)',
        color: hover ? 'rgba(255,255,255,.75)' : 'rgba(255,255,255,.38)',
        fontSize: 11.5, fontWeight: 500,
        cursor: isPending ? 'not-allowed' : 'pointer',
        fontFamily: 'inherit', flexShrink: 0,
        opacity: isPending ? 0.4 : 1,
        transition: 'color .15s, background .15s',
      }}
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="3 6 5 6 21 6"/>
        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
        <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
      </svg>
      {isPending ? 'Réinit…' : 'Réinit.'}
    </button>
  )
}
