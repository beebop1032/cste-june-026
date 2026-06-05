'use client'
import { useState, useTransition } from 'react'
import { resetAllData } from '@/actions/admin'

export default function ResetButton() {
  const [isPending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)

  if (confirming) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,.6)' }}>Supprimer toutes les données ?</span>
        <button
          onClick={() => { setConfirming(false); startTransition(() => resetAllData()) }}
          style={{
            padding: '3px 10px', borderRadius: 4, border: 'none',
            background: '#EF4444', color: '#fff',
            fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          Confirmer
        </button>
        <button
          onClick={() => setConfirming(false)}
          style={{
            padding: '3px 8px', borderRadius: 4,
            border: '1px solid rgba(255,255,255,.25)', background: 'transparent', color: 'rgba(255,255,255,.6)',
            fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          Annuler
        </button>
      </span>
    )
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      disabled={isPending}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '4px 10px', borderRadius: 5,
        background: 'transparent',
        border: '1px solid rgba(255,255,255,.18)',
        color: 'rgba(255,255,255,.38)',
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
