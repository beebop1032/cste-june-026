'use client'
import { useTransition } from 'react'
import { resetAllData } from '@/actions/admin'

export default function ResetButton() {
  const [isPending, startTransition] = useTransition()

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
      className="btn btn-danger btn-sm"
      style={{ display: 'flex', alignItems: 'center', gap: 6 }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="3 6 5 6 21 6"/>
        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
        <path d="M10 11v6"/><path d="M14 11v6"/>
        <path d="M9 6V4h6v2"/>
      </svg>
      {isPending ? 'Réinitialisation…' : 'Réinitialiser toutes les données'}
    </button>
  )
}
