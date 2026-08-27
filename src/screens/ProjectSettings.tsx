import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useApp } from '../store/AppContext'
import AppHeader from '../components/AppHeader'
import ConfirmDialog from '../components/ConfirmDialog'
import Modal from '../components/Modal'
import { BUILTIN_CARD_ROWS, isCardVisible } from '../data/cards'
import type { CustomCardDef } from '../types'

function Toggle({ on, onChange, label }: { on: boolean; onChange: (next: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative shrink-0 h-6 w-11 rounded-full border transition-colors ${
        on ? 'bg-accent border-accent' : 'bg-surface-2 border-inset'
      }`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-parchment transition-transform ${
          on ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  )
}

export default function ProjectSettings() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const { getProject, dispatch } = useApp()
  const project = projectId ? getProject(projectId) : undefined

  const [newLabel, setNewLabel] = useState('')
  const [newLayout, setNewLayout] = useState<CustomCardDef['layout']>('compact')
  const [renamingCard, setRenamingCard] = useState<CustomCardDef | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deletingCard, setDeletingCard] = useState<CustomCardDef | null>(null)

  if (!project || !projectId) {
    return (
      <div className="flex-1 flex flex-col">
        <AppHeader title="Not found" onBack={() => navigate('/')} />
        <div className="p-6 text-parchment-muted">This project no longer exists.</div>
      </div>
    )
  }

  function toggleBuiltIn(key: string, current: boolean) {
    dispatch({ type: 'SET_CARD_VISIBILITY', projectId: projectId!, cardKey: key, visible: !current })
  }

  function toggleCustom(card: CustomCardDef, current: boolean) {
    dispatch({ type: 'SET_CARD_VISIBILITY', projectId: projectId!, cardKey: card.id, visible: !current })
  }

  function submitNewCard(e: React.FormEvent) {
    e.preventDefault()
    const label = newLabel.trim()
    if (!label) return
    dispatch({ type: 'ADD_CUSTOM_CARD', projectId: projectId!, label, layout: newLayout })
    setNewLabel('')
    setNewLayout('compact')
  }

  function submitRename(e: React.FormEvent) {
    e.preventDefault()
    if (!renamingCard) return
    const label = renameValue.trim()
    if (!label) return
    dispatch({ type: 'UPDATE_CUSTOM_CARD', projectId: projectId!, cardId: renamingCard.id, patch: { label } })
    setRenamingCard(null)
  }

  return (
    <div className="flex-1 flex flex-col">
      <AppHeader title={`${project.title} — Cards`} onBack={() => navigate(`/project/${projectId}`)} showSettings={false} />

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-6 max-w-2xl mx-auto w-full">
        <section className="rounded-lg border border-inset bg-surface p-4">
          <h2 className="font-heading text-gold text-lg m-0 mb-1">Built-in Cards</h2>
          <p className="text-parchment-muted text-sm mb-4">
            Turn cards on or off for this project only. Hiding a card never deletes anything already written on
            it — the content is exactly as you left it if you turn the card back on.
          </p>
          <div className="flex flex-col gap-3">
            {BUILTIN_CARD_ROWS.map((row) => {
              const on = isCardVisible(project.cardVisibility, row.key)
              return (
                <div key={row.key} className="flex items-center justify-between gap-3">
                  <span className="text-parchment">{row.label}</span>
                  <Toggle on={on} onChange={() => toggleBuiltIn(row.key, on)} label={`Toggle ${row.label}`} />
                </div>
              )
            })}
          </div>
        </section>

        <section className="rounded-lg border border-inset bg-surface p-4">
          <h2 className="font-heading text-gold text-lg m-0 mb-1">Custom Cards</h2>
          <p className="text-parchment-muted text-sm mb-4">
            Custom cards work exactly like built-in ones — free text, "##" headings, [[bracket-linking]], Show
            more/less, full editing.
          </p>

          {project.customCards.length === 0 ? (
            <p className="text-parchment-muted text-sm italic mb-4">No custom cards yet.</p>
          ) : (
            <div className="flex flex-col gap-3 mb-4">
              {project.customCards.map((card) => {
                const on = isCardVisible(project.cardVisibility, card.id)
                return (
                  <div key={card.id} className="flex items-center justify-between gap-3 rounded border border-inset px-3 py-2">
                    <div className="min-w-0">
                      <div className="text-parchment truncate">{card.label}</div>
                      <div className="text-parchment-muted text-xs uppercase tracking-wide">
                        {card.layout === 'compact' ? 'Compact' : 'Full-width'}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setRenamingCard(card)
                          setRenameValue(card.label)
                        }}
                        className="text-gold-dim hover:text-gold text-sm transition-colors"
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeletingCard(card)}
                        className="text-accent-bright hover:text-accent text-sm transition-colors"
                      >
                        Delete
                      </button>
                      <Toggle on={on} onChange={() => toggleCustom(card, on)} label={`Toggle ${card.label}`} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <form onSubmit={submitNewCard} className="flex flex-col gap-3 pt-3 border-t border-inset">
            <div>
              <label className="block text-sm text-parchment-muted mb-2" htmlFor="new-card-label">
                New custom card
              </label>
              <input
                id="new-card-label"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="e.g. Sensory Details"
                className="w-full rounded border border-inset bg-canvas text-parchment px-3 py-2 focus:border-gold outline-none"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setNewLayout('compact')}
                className={`flex-1 rounded border px-3 py-2 text-sm transition-colors ${
                  newLayout === 'compact'
                    ? 'border-gold bg-surface-2 text-parchment'
                    : 'border-inset bg-surface text-parchment-muted hover:border-gold-dim'
                }`}
              >
                Compact (top grid)
              </button>
              <button
                type="button"
                onClick={() => setNewLayout('full-width')}
                className={`flex-1 rounded border px-3 py-2 text-sm transition-colors ${
                  newLayout === 'full-width'
                    ? 'border-gold bg-surface-2 text-parchment'
                    : 'border-inset bg-surface text-parchment-muted hover:border-gold-dim'
                }`}
              >
                Full-width (bottom)
              </button>
            </div>
            <button
              type="submit"
              disabled={!newLabel.trim()}
              className="self-start px-4 py-2 rounded bg-accent hover:bg-accent-bright text-parchment font-heading tracking-wide disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Create Card
            </button>
          </form>
        </section>
      </div>

      <Modal open={!!renamingCard} onClose={() => setRenamingCard(null)} title="Rename Custom Card">
        <form onSubmit={submitRename}>
          <input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            className="w-full rounded border border-inset bg-canvas text-parchment px-3 py-2 mb-5 focus:border-gold outline-none"
          />
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setRenamingCard(null)}
              className="px-4 py-2 rounded border border-inset text-parchment-muted hover:text-parchment hover:border-gold-dim transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!renameValue.trim()}
              className="px-4 py-2 rounded bg-accent hover:bg-accent-bright text-parchment font-heading tracking-wide disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Save
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deletingCard}
        title="Delete this custom card?"
        message={`"${deletingCard?.label}" will no longer appear on any scene. Any content already written on it stays stored in your data (and in future exports) — it just won't be shown or editable unless you recreate a card and manually move it back. This cannot be undone from this screen.`}
        confirmLabel="Delete"
        onCancel={() => setDeletingCard(null)}
        onConfirm={() => {
          if (deletingCard) dispatch({ type: 'DELETE_CUSTOM_CARD', projectId: projectId!, cardId: deletingCard.id })
          setDeletingCard(null)
        }}
      />
    </div>
  )
}
