import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../store/AppContext'
import ConfirmDialog from './ConfirmDialog'
import ConnectionPicker from './ConnectionPicker'
import EntryModal from './EntryModal'
import IndexEntryPeekModal from './IndexEntryPeekModal'
import LinkedText from './LinkedText'
import LinkedTextEditor from './LinkedTextEditor'
import Modal from './Modal'
import { sceneHeading, groupMembers, type InsertPosition } from '../utils/tocOrdering'
import { chapterHeading, projectChapters } from '../utils/chapters'
import { TEXT_CARDS, isCardVisible } from '../data/cards'
import type { ConnectionTarget, IndexEntry, Scene, SceneConnection } from '../types'

function TextCardButton({
  cardKey,
  label,
  value,
  entries,
  onOpen,
  onOpenEntry,
  fullWidth = false,
}: {
  cardKey: string
  label: string
  value: string
  entries: IndexEntry[]
  onOpen: () => void
  /** Opens the quick peek popup for a tapped resolved [[link]] — the card body itself is no longer a tap target (see the header's explicit "Edit" control instead). */
  onOpenEntry: (entry: IndexEntry) => void
  fullWidth?: boolean
}) {
  // Local, per-card expand toggle — lets the FULL card content show right
  // here in the main view (still colored, still brackets-hidden via
  // LinkedText) instead of always being clipped to 2 lines.
  const [expanded, setExpanded] = useState(false)
  const hasContent = value.trim().length > 0

  return (
    <div
      key={cardKey}
      data-card-key={cardKey}
      className={`text-left rounded-lg border border-inset bg-surface p-4 flex flex-col gap-1 ${fullWidth ? 'sm:col-span-2' : ''}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-heading text-gold text-base tracking-wide uppercase">{label}</span>
        <div className="flex items-center gap-3 shrink-0">
          {hasContent && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="text-gold-dim hover:text-gold text-sm transition-colors"
            >
              {expanded ? 'Show less ▲' : 'Show more ▾'}
            </button>
          )}
          <button type="button" onClick={onOpen} className="text-gold-dim hover:text-gold text-sm transition-colors">
            Edit
          </button>
        </div>
      </div>
      {hasContent ? (
        // line-clamp instead of manual character truncation when collapsed —
        // bracket-link tokens have very different raw vs. rendered lengths,
        // so slicing the raw string by character count risks cutting a token
        // in half. onOpenEntry makes each resolved link its own tap target
        // (opening that entry's peek popup); the card body around it is
        // plain, non-interactive text now that "Edit" is the explicit way
        // into the full editor.
        <div className={`text-parchment text-lg ${expanded ? '' : 'line-clamp-2'}`}>
          <LinkedText text={value} entries={entries} onOpenEntry={onOpenEntry} />
        </div>
      ) : (
        <span className="text-parchment-muted text-lg italic">Empty — tap Edit to add</span>
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
  // Tracks the peeked entry by ID, not the entry object itself — looking it
  // up live by ID on every render (like IndexScreen's `liveSelected`) means
  // an edit made INSIDE the popup (e.g. its own blurb field) is reflected
  // back into the popup immediately, instead of the popup going on showing
  // a stale snapshot from the moment it was opened.
  const [peekEntryId, setPeekEntryId] = useState<string | null>(null)

  const projectEntries = useMemo(
    () => dataset.indexEntries.filter((e) => e.projectId === projectId),
    [dataset.indexEntries, projectId],
  )
  const peekEntry = peekEntryId ? projectEntries.find((e) => e.id === peekEntryId) ?? null : null

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
            onOpenEntry={(entry) => setPeekEntryId(entry.id)}
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
            onOpenEntry={(entry) => setPeekEntryId(entry.id)}
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
                        <span className="text-gold text-sm font-medium">✎ Unwritten</span>
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
                      <div className="text-gold text-sm">
                        <LinkedText text={connection.unwrittenDescription ?? ''} entries={projectEntries} onOpenEntry={(entry) => setPeekEntryId(entry.id)} />
                      </div>
                      {connection.note && (
                        <div className="text-parchment text-sm">
                          <LinkedText text={connection.note} entries={projectEntries} onOpenEntry={(entry) => setPeekEntryId(entry.id)} />
                        </div>
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
                        // replace, not push — jumping to a connected scene is a
                        // lateral move at the same hierarchy level, not a step
                        // deeper. This Scene Page's own history entry already
                        // sits directly on the Table of Contents, so replacing
                        // it keeps that invariant true for the scene we land
                        // on: one pop still reaches the Table of Contents,
                        // instead of stacking scenes the user has to back out
                        // of one at a time.
                        onClick={() => navigate(`/project/${target.projectId}/scene/${target.id}`, { replace: true })}
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
                      <div className="text-parchment text-sm">
                        <LinkedText text={connection.note} entries={projectEntries} onOpenEntry={(entry) => setPeekEntryId(entry.id)} />
                      </div>
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
            onOpenEntry={(entry) => setPeekEntryId(entry.id)}
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
            onOpenEntry={(entry) => setPeekEntryId(entry.id)}
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
          <LinkedTextEditor
            variant="compact"
            rows={3}
            autoFocus
            value={noteDraft}
            projectId={projectId}
            onSave={setNoteDraft}
            placeholder="Why are these connected?"
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
          navigate(`/project/${projectId}`, { replace: true })
        }}
      />

      {markingWritten && (
        <MarkAsWrittenModal
          projectId={projectId}
          scene={scene}
          onClose={() => setMarkingWritten(false)}
        />
      )}

      <IndexEntryPeekModal
        entry={peekEntry}
        entries={projectEntries}
        projectId={projectId}
        onClose={() => setPeekEntryId(null)}
        onOpenEntry={(entry) => setPeekEntryId(entry.id)}
        onSaveBlurb={(id, blurb) => dispatch({ type: 'UPDATE_INDEX_ENTRY', id, patch: { blurb } })}
        onOpenFullEntry={(entry) => navigate(`/project/${projectId}/index?entry=${entry.id}`)}
      />
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
  const [positionQuery, setPositionQuery] = useState('')

  const regularScenes = useMemo(
    () => groupMembers(dataset.scenes, projectId, 'regular').filter((s) => s.id !== scene.id),
    [dataset.scenes, projectId, scene.id],
  )
  const isRegular = scene.kind === 'scene' || scene.kind === 'interlude' || scene.kind === 'custom-scene'

  // Same chapter-labeled, searchable position picker as EntryModal's — see
  // its comments for why a plain <select> doesn't scale to many scenes.
  const projectChs = useMemo(() => projectChapters(dataset.chapters, projectId), [dataset.chapters, projectId])
  const firstChapterLabel = projectChs[0] ? ` (${chapterHeading(dataset.chapters, projectId, projectChs[0])})` : ''
  const lastChapterLabel = projectChs.length
    ? ` (${chapterHeading(dataset.chapters, projectId, projectChs[projectChs.length - 1])})`
    : ''
  function afterOptionChapterLabel(s: Scene): string {
    const chapter = projectChs.find((c) => c.id === s.chapterId)
    return chapter ? ` (${chapterHeading(dataset.chapters, projectId, chapter)})` : ''
  }
  function afterOptionLabel(s: Scene): string {
    return `After: ${sceneHeading(dataset.scenes, s)}${afterOptionChapterLabel(s)}`
  }
  const filteredAfterCandidates = useMemo(() => {
    const q = positionQuery.trim().toLowerCase()
    const pool = q ? regularScenes.filter((s) => sceneHeading(dataset.scenes, s).toLowerCase().includes(q)) : regularScenes
    return pool.slice(0, 50)
  }, [regularScenes, positionQuery, dataset.scenes])
  function selectedPositionLabel(): string {
    if (insertChoice === 'keep') return 'Keep current position'
    if (insertChoice === 'end') return `At the end${lastChapterLabel}`
    if (insertChoice === 'start') return `At the beginning${firstChapterLabel}`
    const s = regularScenes.find((x) => x.id === insertChoice)
    return s ? afterOptionLabel(s) : `At the end${lastChapterLabel}`
  }

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
            <label className="block text-sm text-parchment-muted mb-2">Position</label>
            <div className="flex flex-wrap gap-2 mb-3">
              <button
                type="button"
                onClick={() => setInsertChoice('keep')}
                className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                  insertChoice === 'keep'
                    ? 'border-gold bg-gold text-canvas'
                    : 'border-inset bg-surface text-parchment hover:border-gold-dim'
                }`}
              >
                Keep current position
              </button>
              <button
                type="button"
                onClick={() => setInsertChoice('end')}
                className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                  insertChoice === 'end'
                    ? 'border-gold bg-gold text-canvas'
                    : 'border-inset bg-surface text-parchment hover:border-gold-dim'
                }`}
              >
                At the end{lastChapterLabel}
              </button>
              <button
                type="button"
                onClick={() => setInsertChoice('start')}
                className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                  insertChoice === 'start'
                    ? 'border-gold bg-gold text-canvas'
                    : 'border-inset bg-surface text-parchment hover:border-gold-dim'
                }`}
              >
                At the beginning{firstChapterLabel}
              </button>
            </div>

            <input
              type="text"
              value={positionQuery}
              onChange={(e) => setPositionQuery(e.target.value)}
              placeholder="Or search a scene to insert after…"
              className="w-full rounded border border-inset bg-canvas text-parchment px-3 py-2 mb-2 focus:border-gold outline-none"
            />
            <div className="max-h-48 overflow-y-auto rounded border border-inset bg-surface flex flex-col">
              {filteredAfterCandidates.length === 0 && (
                <p className="text-parchment-muted text-sm italic px-3 py-2 m-0">No matching scenes.</p>
              )}
              {filteredAfterCandidates.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setInsertChoice(s.id)}
                  className={`text-left px-3 py-2 text-sm border-b border-inset last:border-b-0 transition-colors ${
                    insertChoice === s.id ? 'bg-surface-2 text-gold' : 'text-parchment hover:bg-surface-2'
                  }`}
                >
                  {afterOptionLabel(s)}
                </button>
              ))}
            </div>

            <p className="text-parchment-muted text-xs mt-2 mb-0">
              Position: <span className="text-parchment">{selectedPositionLabel()}</span>
            </p>
            {projectChs.length > 1 && (
              <p className="text-parchment-muted text-xs mt-1 mb-0 italic">
                Picking a specific "After" scene keeps the entry in that scene's chapter — pick "At the end" to
                land in the newest chapter instead.
              </p>
            )}
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
