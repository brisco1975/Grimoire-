import { useMemo, useState } from 'react'
import { useApp } from '../store/AppContext'
import type { ConnectionTarget, Scene, SceneConnection } from '../types'
import { sceneHeading } from '../utils/tocOrdering'
import Modal from './Modal'

type Selection = { kind: 'scene'; scene: Scene } | { kind: 'unwritten' }

/**
 * Picks a connection target — a real scene, or the "Unwritten Scene"
 * placeholder (always pinned at the top of the list, for a scene the writer
 * expects to write later but hasn't yet).
 *
 * Two modes, chosen by whether `editingConnection` is passed:
 *  - Add mode (no editingConnection): browse -> pick a target -> fill in a
 *    note (and, for Unwritten Scene, a description) -> onPick.
 *  - Edit mode (editingConnection set): browse -> pick a NEW target -> a
 *    lightweight confirm/describe step -> onUpdate. The connection's `note`
 *    is left untouched (it has its own editor elsewhere) and its `id` never
 *    changes — this converts an existing connection in place rather than
 *    creating a new one.
 */
export default function ConnectionPicker({
  open,
  onClose,
  currentScene,
  editingConnection,
  onPick,
  onUpdate,
}: {
  open: boolean
  onClose: () => void
  currentScene: Scene
  editingConnection?: SceneConnection
  /** Add mode — called once the user confirms a brand-new connection. */
  onPick?: (target: ConnectionTarget, note: string) => void
  /** Edit mode — called once the user confirms a new target for an existing connection. */
  onUpdate?: (connectionId: string, target: ConnectionTarget) => void
}) {
  const { dataset } = useApp()
  const isEditing = !!editingConnection
  const [query, setQuery] = useState('')
  const [selection, setSelection] = useState<Selection | null>(null)
  const [note, setNote] = useState('')
  const [description, setDescription] = useState('')

  const results = useMemo(() => {
    const linked = new Set(
      currentScene.connections.filter((c) => c.id !== editingConnection?.id).map((c) => c.sceneId),
    )
    const q = query.trim().toLowerCase()
    return dataset.scenes
      .filter((s) => s.id !== currentScene.id && !linked.has(s.id))
      .filter((s) => {
        if (!q) return true
        const project = dataset.projects.find((p) => p.id === s.projectId)
        return (
          sceneHeading(dataset.scenes, s).toLowerCase().includes(q) ||
          s.summary.toLowerCase().includes(q) ||
          project?.title.toLowerCase().includes(q)
        )
      })
      .slice(0, 50)
  }, [dataset.scenes, dataset.projects, currentScene, editingConnection, query])

  function reset() {
    setQuery('')
    setSelection(null)
    setNote('')
    setDescription('')
  }

  function handleClose() {
    reset()
    onClose()
  }

  function selectUnwritten() {
    setDescription(editingConnection?.unwrittenDescription ?? '')
    setSelection({ kind: 'unwritten' })
  }

  function confirmScene(scene: Scene) {
    if (isEditing) {
      onUpdate?.(editingConnection!.id, { sceneId: scene.id, projectId: scene.projectId })
      reset()
      onClose()
      return
    }
    onPick?.({ sceneId: scene.id, projectId: scene.projectId }, note.trim())
    reset()
  }

  function confirmUnwritten() {
    const desc = description.trim()
    if (!desc) return
    if (isEditing) {
      onUpdate?.(editingConnection!.id, { sceneId: null, projectId: null, unwrittenDescription: desc })
      reset()
      onClose()
      return
    }
    onPick?.({ sceneId: null, projectId: null, unwrittenDescription: desc }, note.trim())
    reset()
  }

  const title = isEditing
    ? selection
      ? 'Confirm New Target'
      : 'Link to a Different Scene'
    : selection
      ? 'Describe the Connection'
      : 'Connect to Scene'

  return (
    <Modal open={open} onClose={handleClose} title={title} wide>
      {selection?.kind === 'scene' ? (
        <div className="flex flex-col gap-4">
          <div className="rounded border border-inset bg-surface px-3 py-2">
            <div className="text-parchment-muted text-xs uppercase tracking-wide mb-0.5">Connecting to</div>
            <div className="font-heading text-parchment">{sceneHeading(dataset.scenes, selection.scene)}</div>
          </div>
          {!isEditing && (
            <div>
              <label className="block text-sm text-parchment-muted mb-2" htmlFor="connection-note">
                Why are these connected? (optional)
              </label>
              <textarea
                id="connection-note"
                autoFocus
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Kala and Mira are named here"
                rows={2}
                className="w-full resize-none rounded border border-inset bg-canvas text-parchment px-3 py-2 focus:border-gold outline-none"
              />
            </div>
          )}
          <div className="flex justify-between gap-3">
            <button
              type="button"
              onClick={() => {
                setSelection(null)
                setNote('')
              }}
              className="px-4 py-2 rounded border border-inset text-parchment-muted hover:text-parchment hover:border-gold-dim transition-colors"
            >
              ‹ Back
            </button>
            <button
              type="button"
              onClick={() => confirmScene(selection.scene)}
              className="px-4 py-2 rounded bg-accent hover:bg-accent-bright text-parchment font-heading tracking-wide transition-colors"
            >
              {isEditing ? 'Link This Scene' : 'Add Connection'}
            </button>
          </div>
        </div>
      ) : selection?.kind === 'unwritten' ? (
        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-sm text-parchment-muted mb-2" htmlFor="unwritten-description">
              Describe the scene you expect to connect to
            </label>
            <textarea
              id="unwritten-description"
              autoFocus
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Future scene about the Academy's fall"
              rows={2}
              className="w-full resize-none rounded border border-inset bg-canvas text-parchment px-3 py-2 focus:border-gold outline-none"
            />
          </div>
          {!isEditing && (
            <div>
              <label className="block text-sm text-parchment-muted mb-2" htmlFor="unwritten-note">
                Why are these connected? (optional)
              </label>
              <textarea
                id="unwritten-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Kala and Mira are named here"
                rows={2}
                className="w-full resize-none rounded border border-inset bg-canvas text-parchment px-3 py-2 focus:border-gold outline-none"
              />
            </div>
          )}
          <div className="flex justify-between gap-3">
            <button
              type="button"
              onClick={() => {
                setSelection(null)
                setNote('')
                setDescription('')
              }}
              className="px-4 py-2 rounded border border-inset text-parchment-muted hover:text-parchment hover:border-gold-dim transition-colors"
            >
              ‹ Back
            </button>
            <button
              type="button"
              onClick={confirmUnwritten}
              disabled={!description.trim()}
              className="px-4 py-2 rounded bg-accent hover:bg-accent-bright text-parchment font-heading tracking-wide disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {isEditing ? 'Save Description' : 'Add Connection'}
            </button>
          </div>
        </div>
      ) : (
        <>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search scenes across all projects…"
            className="w-full rounded border border-inset bg-canvas text-parchment px-3 py-2 mb-4 focus:border-gold outline-none"
          />
          <div className="flex flex-col gap-2 max-h-96 overflow-y-auto">
            {/* Always pinned at the top, regardless of search — an "Unwritten
                Scene" placeholder is never something you search for. */}
            <button
              type="button"
              onClick={selectUnwritten}
              className="text-left rounded border border-dashed border-gold-dim bg-surface hover:bg-surface-2 hover:border-gold transition-colors px-3 py-2"
            >
              <div className="font-heading text-gold">✎ Unwritten Scene…</div>
              <div className="text-parchment-muted text-xs">Describe a scene you haven't written yet</div>
            </button>
            {results.length === 0 && <p className="text-parchment-muted italic">No matching scenes found.</p>}
            {results.map((s) => {
              const project = dataset.projects.find((p) => p.id === s.projectId)
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelection({ kind: 'scene', scene: s })}
                  className="text-left rounded border border-inset bg-surface hover:bg-surface-2 hover:border-gold-dim transition-colors px-3 py-2"
                >
                  <div className="font-heading text-parchment">{sceneHeading(dataset.scenes, s)}</div>
                  <div className="text-parchment-muted text-xs">
                    {project?.title ?? 'Unknown project'}
                    {s.projectId !== currentScene.projectId && ' (cross-project)'}
                  </div>
                </button>
              )
            })}
          </div>
        </>
      )}
    </Modal>
  )
}
