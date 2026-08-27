import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../store/AppContext'
import ConfirmDialog from './ConfirmDialog'
import ConnectionPicker from './ConnectionPicker'
import EntryModal from './EntryModal'
import LinkedText from './LinkedText'
import Modal from './Modal'
import { sceneHeading, groupMembers, type InsertPosition } from '../utils/tocOrdering'
import { TEXT_CARDS, isCardVisible } from '../data/cards'
import type { ConnectionTarget, IndexEntry, Scene, SceneConnection } from '../types'

function TextCardButton({
  cardKey,
  label,
  value,
  entries,
  onOpen,
  fullWidth = false,
}: {
  cardKey: string
  label: string
  value: string
  entries: IndexEntry[]
  onOpen: () => void
  fullWidth?: boolean
}) {
  // Local, per-card expand toggle — lets the FULL card content show right
  // here in the main view (still colored, still brackets-hidden via
  // LinkedText) instead of always being clipped to 2 lines. The card is no
  // longer a single <button> because of that toggle: a real <button>
  // (Show more/less) can't legally nest inside another <button>, so the
  // whole-card tap target is now a div with button semantics instead, and
  // the toggle stops its click from bubbling up to "open editor."
  const [expanded, setExpanded] = useState(false)
  const hasContent = value.trim().length > 0

  return (
    <div
      key={cardKey}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
      className={`text-left rounded-lg border border-inset bg-surface hover:bg-surface-2 hover:border-gold-dim transition-colors p-4 flex flex-col gap-1 cursor-pointer ${fullWidth ? 'sm:col-span-2' : ''}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-heading text-gold text-base tracking-wide uppercase">{label}</span>
        {hasContent && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setExpanded((v) => !v)
            }}
            className="shrink-0 text-gold-dim hover:text-gold text-sm transition-colors"
          >
            {expanded ? 'Show less ▲' : 'Show more ▾'}
          </button>
        )}
      </div>
      {hasContent ? (
        // line-clamp instead of manual character truncation when collapsed —
        // bracket-link tokens have very different raw vs. rendered lengths,
        // so slicing the raw string by character count risks cutting a token
        // in half. No onOpenEntry here: links render as plain highlighted
        // text rather than nested buttons, since the whole card is already a
        // single tap target.
        <span className={`text-parchment-muted text-lg ${expanded ? '' : 'line-clamp-2'}`}>
          <LinkedText text={value} entries={entries} />
        </span>
      ) : (
        <span className="text-parchment-muted text-lg italic">Empty — tap to add</span>
      )}
    </div>
  )
}

/**
 * The scene-detail content — cards, connections, entry actions. Deliberately
 * has NO header/back-nav of its own: ScenePage (phone route, full-screen)
 * and the wide-screen two-page spread's right pane both wrap this same
 * component with whatever chrome fits their layout, so the actual card
 * logic lives in exactly one place.
 */
export default function SceneDetail({ projectId, scene }: { projectId: string; scene: Scene }) {
  const navigate = useNavigate()
  const { dataset, dispatch, getProject } = useApp()
  const project = getProject(projectId)
  const cardVisibility = useMemo(() => project?.cardVisibility ?? {}, [project])
  const customCards = project?.customCards ?? []

  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [pickingConnection, setPickingConnection] = useState(false)
  const [editingConnectionTarget, setEditingConnectionTarget] = useState<SceneConnection | null>(null)
  const [markingWritten, setMarkingWritten] = useState(false)
  const [editingNoteFor, setEditingNoteFor] = useState<string | null>(null)
  const [noteDraft, setNoteDraft] = useState('')

  const projectEntries = useMemo(
    () => dataset.indexEntries.filter((e) => e.projectId === projectId),
    [dataset.indexEntries, projectId],
  )

  const connectionRows = useMemo(() => {
    return scene.connections.map((c) => ({
      connection: c,
      target: c.sceneId ? dataset.scenes.find((s) => s.id === c.sceneId) : undefined,
    }))
  }, [scene, dataset.scenes])

  const visibleBuiltIn = (key: string) => isCardVisible(cardVisibility, key)
  const visibleCustom = (id: string) => isCardVisible(cardVisibility, id)

  const compactCards = [
    ...TEXT_CARDS.filter((c) => c.layout === 'compact' && c.behaviors.includes(scene.behavior) && visibleBuiltIn(c.key)),
  ]
  const compactCustomCards = customCards.filter((c) => c.layout === 'compact' && visibleCustom(c.id))
  const easterEggsCard = TEXT_CARDS.find((c) => c.key === 'easterEggs')!
  const showConnections = scene.behavior === 'scene' && visibleBuiltIn('connections')
  const showEasterEggs = easterEggsCard.behaviors.includes(scene.behavior) && visibleBuiltIn('easterEggs')
  const fullWidthCustomCards = customCards.filter((c) => c.layout === 'full-width' && visibleCustom(c.id))
  const isPlanned = scene.status === 'planned'

  return (
    <div className="flex-1 flex flex-col">
      <div className="flex items-center justify-between gap-4 px-4 pt-2 text-sm">
        <div>
          {isPlanned && (
            <span className="inline-block rounded-full border border-accent-bright text-accent-bright text-xs uppercase tracking-wide px-2 py-0.5">
              Planned
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          {isPlanned && (
            <button
              type="button"
              className="text-link hover:underline underline-offset-2 transition-colors"
              onClick={() => setMarkingWritten(true)}
            >
              Mark as Written
            </button>
          )}
          <button
            type="button"
            className="text-gold-dim hover:text-gold transition-colors"
            onClick={() => setEditing(true)}
          >
            Edit Entry
          </button>
          <button
            type="button"
            className="text-accent-bright hover:text-accent transition-colors"
            onClick={() => setConfirmDelete(true)}
          >
            Delete
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 grid grid-cols-1 sm:grid-cols-2 gap-3 content-start items-start">
        {compactCards.map(({ key, label }) => (
          <TextCardButton
            key={key}
            cardKey={key}
            label={label}
            value={scene[key]}
            entries={projectEntries}
            onOpen={() => navigate(`/project/${projectId}/scene/${scene.id}/card/${key}`)}
          />
        ))}

        {compactCustomCards.map((card) => (
          <TextCardButton
            key={card.id}
            cardKey={card.id}
            label={card.label}
            value={scene.customCardContent[card.id] ?? ''}
            entries={projectEntries}
            onOpen={() => navigate(`/project/${projectId}/scene/${scene.id}/card/${card.id}`)}
          />
        ))}

        {showConnections && (
          <div className="text-left rounded-lg border border-inset bg-surface p-4 flex flex-col gap-2 sm:col-span-2">
            <div className="flex items-center justify-between">
              <span className="font-heading text-gold text-sm tracking-wide uppercase">Connections</span>
              <button
                type="button"
                onClick={() => setPickingConnection(true)}
                className="text-xs text-gold-dim hover:text-gold transition-colors"
              >
                + Add
              </button>
            </div>
            {connectionRows.length === 0 && (
              <span className="text-parchment-muted text-sm italic">No connections yet.</span>
            )}
            <div className="flex flex-col gap-2">
              {connectionRows.map(({ connection, target }) => {
                if (connection.sceneId === null) {
                  return (
                    <div
                      key={connection.id}
                      className="rounded border border-dashed border-gold-dim bg-surface-2 px-3 py-2 flex flex-col gap-0.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-gold text-sm font-medium">
                          ✎ Unwritten: {connection.unwrittenDescription}
                        </span>
                        <div className="flex items-center gap-3 shrink-0">
                          <button
                            type="button"
                            onClick={() => setEditingConnectionTarget(connection)}
                            className="text-gold-dim hover:text-gold text-xs transition-colors"
                          >
                            Link scene…
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingNoteFor(connection.id)
                              setNoteDraft(connection.note ?? '')
                            }}
                            className="text-gold-dim hover:text-gold text-xs transition-colors"
                          >
                            {connection.note ? 'Edit note' : '+ Note'}
                          </button>
                          <span
                            role="button"
                            tabIndex={-1}
                            onClick={() =>
                              dispatch({ type: 'REMOVE_CONNECTION', sceneId: scene.id, connectionId: connection.id })
                            }
                            className="text-parchment-muted hover:text-parchment cursor-pointer"
                            aria-label="Remove connection"
                          >
                            ×
                          </span>
                        </div>
                      </div>
                      {connection.note && (
                        <p className="text-parchment-muted text-sm m-0 whitespace-pre-wrap">{connection.note}</p>
                      )}
                    </div>
                  )
                }
                return target ? (
                  <div
                    key={connection.id}
                    className="rounded border border-link/60 bg-link/10 px-3 py-2 flex flex-col gap-0.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => navigate(`/project/${target.projectId}/scene/${target.id}`)}
                        className="text-link hover:underline underline-offset-2 text-sm font-medium text-left"
                      >
                        → {sceneHeading(dataset.scenes, target)}
                      </button>
                      <div className="flex items-center gap-3 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingNoteFor(connection.id)
                            setNoteDraft(connection.note ?? '')
                          }}
                          className="text-link/80 hover:text-link text-xs transition-colors"
                        >
                          {connection.note ? 'Edit note' : '+ Note'}
                        </button>
                        <span
                          role="button"
                          tabIndex={-1}
                          onClick={() =>
                            dispatch({ type: 'REMOVE_CONNECTION', sceneId: scene.id, connectionId: connection.id })
                          }
                          className="text-link/70 hover:text-link cursor-pointer"
                          aria-label="Remove connection"
                        >
                          ×
                        </span>
                      </div>
                    </div>
                    {connection.note && (
                      <p className="text-parchment-muted text-sm m-0 whitespace-pre-wrap">{connection.note}</p>
                    )}
                  </div>
                ) : (
                  <div
                    key={connection.id}
                    className="rounded border border-accent/60 bg-accent/10 px-3 py-2 flex items-center justify-between gap-2"
                    title="This connected scene was deleted — connection is broken and needs manual correction"
                  >
                    <span className="text-parchment-muted text-sm italic">⚠ Broken connection</span>
                    <span
                      role="button"
                      tabIndex={-1}
                      onClick={() =>
                        dispatch({ type: 'REMOVE_CONNECTION', sceneId: scene.id, connectionId: connection.id })
                      }
                      className="text-parchment-muted hover:text-parchment cursor-pointer"
                      aria-label="Remove broken connection"
                    >
                      ×
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {showEasterEggs && (
          <TextCardButton
            cardKey={easterEggsCard.key}
            label={easterEggsCard.label}
            value={scene.easterEggs}
            entries={projectEntries}
            fullWidth
            onOpen={() => navigate(`/project/${projectId}/scene/${scene.id}/card/${easterEggsCard.key}`)}
          />
        )}

        {fullWidthCustomCards.map((card) => (
          <TextCardButton
            key={card.id}
            cardKey={card.id}
            label={card.label}
            value={scene.customCardContent[card.id] ?? ''}
            entries={projectEntries}
            fullWidth
            onOpen={() => navigate(`/project/${projectId}/scene/${scene.id}/card/${card.id}`)}
          />
        ))}
      </div>

      {editing && <EntryModal onClose={() => setEditing(false)} projectId={projectId} editingScene={scene} />}

      <ConnectionPicker
        open={pickingConnection || !!editingConnectionTarget}
        onClose={() => {
          setPickingConnection(false)
          setEditingConnectionTarget(null)
        }}
        currentScene={scene}
        editingConnection={editingConnectionTarget ?? undefined}
        onPick={(target: ConnectionTarget, note) => {
          dispatch({ type: 'ADD_CONNECTION', sceneId: scene.id, target, note })
          setPickingConnection(false)
        }}
        onUpdate={(connectionId, target: ConnectionTarget) => {
          dispatch({ type: 'UPDATE_CONNECTION_TARGET', sceneId: scene.id, connectionId, target })
          setEditingConnectionTarget(null)
        }}
      />

      <Modal
        open={!!editingNoteFor}
        onClose={() => setEditingNoteFor(null)}
        title="Connection Note"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!editingNoteFor) return
            dispatch({
              type: 'UPDATE_CONNECTION_NOTE',
              sceneId: scene.id,
              connectionId: editingNoteFor,
              note: noteDraft.trim(),
            })
            setEditingNoteFor(null)
          }}
          className="flex flex-col gap-4"
        >
          <textarea
            autoFocus
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            placeholder="Why are these connected?"
            rows={3}
            className="w-full resize-none rounded border border-inset bg-canvas text-parchment px-3 py-2 focus:border-gold outline-none"
          />
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setEditingNoteFor(null)}
              className="px-4 py-2 rounded border border-inset text-parchment-muted hover:text-parchment hover:border-gold-dim transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded bg-accent hover:bg-accent-bright text-parchment font-heading tracking-wide transition-colors"
            >
              Save
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this entry?"
        message={`"${sceneHeading(dataset.scenes, scene)}" will be permanently deleted. Connections from other scenes to it will remain and show as broken. This cannot be undone.`}
        confirmLabel="Delete"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          dispatch({ type: 'DELETE_SCENE', id: scene.id })
          navigate(`/project/${projectId}`)
        }}
      />

      {markingWritten && (
        <MarkAsWrittenModal
          projectId={projectId}
          scene={scene}
          onClose={() => setMarkingWritten(false)}
        />
      )}
    </div>
  )
}

function MarkAsWrittenModal({
  projectId,
  scene,
  onClose,
}: {
  projectId: string
  scene: Scene
  onClose: () => void
}) {
  const { dataset, dispatch } = useApp()
  const [title, setTitle] = useState(scene.title)
  const [insertChoice, setInsertChoice] = useState<'keep' | 'end' | 'start' | string>('keep')

  const regularScenes = useMemo(
    () => groupMembers(dataset.scenes, projectId, 'regular').filter((s) => s.id !== scene.id),
    [dataset.scenes, projectId, scene.id],
  )
  const isRegular = scene.kind === 'scene' || scene.kind === 'interlude' || scene.kind === 'custom-scene'

  function confirm(e: React.FormEvent) {
    e.preventDefault()
    let insertPosition: InsertPosition | undefined
    if (isRegular && insertChoice !== 'keep') {
      insertPosition = insertChoice === 'end' ? 'group-end' : insertChoice === 'start' ? 'group-start' : { after: insertChoice }
    }
    dispatch({ type: 'FINALIZE_PLANNED_SCENE', id: scene.id, title: title.trim() || scene.title, insertPosition })
    onClose()
  }

  return (
    <Modal open onClose={onClose} title="Mark as Written">
      <form onSubmit={confirm} className="flex flex-col gap-4">
        <p className="text-parchment-muted text-sm m-0">
          Confirm the final number and title. Everything already entered on this entry's cards — including any{' '}
          [[linked]] people, places, and things — carries over unchanged.
        </p>
        <div>
          <label className="block text-sm text-parchment-muted mb-2" htmlFor="finalize-title">
            Title
          </label>
          <input
            id="finalize-title"
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded border border-inset bg-canvas text-parchment px-3 py-2 focus:border-gold outline-none"
          />
        </div>
        {isRegular && (
          <div>
            <label className="block text-sm text-parchment-muted mb-2" htmlFor="finalize-position">
              Position
            </label>
            <select
              id="finalize-position"
              value={insertChoice}
              onChange={(e) => setInsertChoice(e.target.value)}
              className="w-full rounded border border-inset bg-canvas text-parchment px-3 py-2 focus:border-gold outline-none"
            >
              <option value="keep">Keep current position</option>
              <option value="end">At the end</option>
              <option value="start">At the beginning</option>
              {regularScenes.map((s) => (
                <option key={s.id} value={s.id}>
                  After: {sceneHeading(dataset.scenes, s)}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="flex justify-end gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded border border-inset text-parchment-muted hover:text-parchment hover:border-gold-dim transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-2 rounded bg-accent hover:bg-accent-bright text-parchment font-heading tracking-wide transition-colors"
          >
            Mark as Written
          </button>
        </div>
      </form>
    </Modal>
  )
}
