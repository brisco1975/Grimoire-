import { useMemo, useState } from 'react'
import { useApp } from '../store/AppContext'
import type { Scene } from '../types'
import { sceneHeading } from '../utils/tocOrdering'
import Modal from './Modal'

export default function ConnectionPicker({
  open,
  onClose,
  currentScene,
  onPick,
}: {
  open: boolean
  onClose: () => void
  currentScene: Scene
  /** Called once the user confirms — note is '' if left blank. */
  onPick: (target: Scene, note: string) => void
}) {
  const { dataset } = useApp()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Scene | null>(null)
  const [note, setNote] = useState('')

  const results = useMemo(() => {
    const linked = new Set(currentScene.connections.map((c) => c.sceneId))
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
  }, [dataset.scenes, dataset.projects, currentScene, query])

  function reset() {
    setQuery('')
    setSelected(null)
    setNote('')
  }

  function handleClose() {
    reset()
    onClose()
  }

  function confirm() {
    if (!selected) return
    onPick(selected, note.trim())
    reset()
  }

  return (
    <Modal open={open} onClose={handleClose} title={selected ? 'Describe the Connection' : 'Connect to Scene'} wide>
      {selected ? (
        <div className="flex flex-col gap-4">
          <div className="rounded border border-inset bg-surface px-3 py-2">
            <div className="text-parchment-muted text-xs uppercase tracking-wide mb-0.5">Connecting to</div>
            <div className="font-heading text-parchment">{sceneHeading(dataset.scenes, selected)}</div>
          </div>
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
          <div className="flex justify-between gap-3">
            <button
              type="button"
              onClick={() => {
                setSelected(null)
                setNote('')
              }}
              className="px-4 py-2 rounded border border-inset text-parchment-muted hover:text-parchment hover:border-gold-dim transition-colors"
            >
              ‹ Back
            </button>
            <button
              type="button"
              onClick={confirm}
              className="px-4 py-2 rounded bg-accent hover:bg-accent-bright text-parchment font-heading tracking-wide transition-colors"
            >
              Add Connection
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
            {results.length === 0 && <p className="text-parchment-muted italic">No matching scenes found.</p>}
            {results.map((s) => {
              const project = dataset.projects.find((p) => p.id === s.projectId)
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelected(s)}
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
