import { useMemo, useState } from 'react'
import { useApp } from '../store/AppContext'
import { MATTER_PRESETS, SCENE_PRESETS } from '../data/presets'
import type { EntryBehavior, MatterPosition, Scene, SceneKind } from '../types'
import { groupMembers, sceneHeading, type InsertPosition } from '../utils/tocOrdering'
import { chapterHeading, projectChapters } from '../utils/chapters'
import Modal from './Modal'

const REGULAR_SCENE_KINDS: SceneKind[] = ['scene', 'interlude', 'custom-scene']

/**
 * Handles both creating a new Table of Contents entry and re-classifying an
 * existing one. Pass `editingScene` to edit — the parent should only mount
 * this component while its modal is open (e.g. `{editing && <EntryModal .../>}`)
 * so each open gets a fresh, correctly pre-filled form.
 */
export default function EntryModal({
  onClose,
  projectId,
  editingScene,
  planning = false,
}: {
  onClose: () => void
  projectId: string
  editingScene?: Scene
  /** Creates the entry with status 'planned' — see the "+ Plan Next Scene" flow. */
  planning?: boolean
}) {
  const { dataset, dispatch } = useApp()
  const isEditing = !!editingScene
  const isPlanned = editingScene?.status === 'planned'

  const [behavior, setBehavior] = useState<EntryBehavior | null>(editingScene?.behavior ?? null)
  const [kind, setKind] = useState<SceneKind | null>(editingScene?.kind ?? null)
  const [title, setTitle] = useState(editingScene?.title ?? '')
  const [matterPosition, setMatterPosition] = useState<MatterPosition>(editingScene?.matterPosition ?? 'end')
  // Editing a Planned scene offers the full position picker (free repositioning
  // while plans are still in flux); editing a Written scene never touches
  // position here (Move Up/Down on the Table of Contents handles that).
  const [insertChoice, setInsertChoice] = useState<'end' | 'start' | 'keep' | string>(isEditing ? 'keep' : 'end')

  const regularScenes = useMemo(
    () => groupMembers(dataset.scenes, projectId, 'regular'),
    [dataset.scenes, projectId],
  )

  // Which chapter each Position option actually lands in — "At the end"
  // and "After: X" both keep the new entry in a specific chapter (the
  // project's last one, or whichever chapter X is already in), and that
  // isn't obvious from the option text alone once more than one chapter
  // exists. Labeling each option disambiguates "at the end of the book"
  // from "right after this one scene, wherever its chapter is."
  const projectChs = useMemo(() => projectChapters(dataset.chapters, projectId), [dataset.chapters, projectId])
  const firstChapterLabel = projectChs[0] ? ` (${chapterHeading(dataset.chapters, projectId, projectChs[0])})` : ''
  const lastChapterLabel = projectChs.length
    ? ` (${chapterHeading(dataset.chapters, projectId, projectChs[projectChs.length - 1])})`
    : ''
  function afterOptionChapterLabel(scene: Scene): string {
    const chapter = projectChs.find((c) => c.id === scene.chapterId)
    return chapter ? ` (${chapterHeading(dataset.chapters, projectId, chapter)})` : ''
  }

  // "After: X" is searchable rather than a plain dropdown — a project with
  // dozens of scenes makes scrolling a native <select> tedious, especially
  // on a phone-native picker. "At the end"/"At the beginning" stay as
  // always-visible quick picks above the search, same pinned-option
  // pattern ConnectionPicker uses for "Unwritten Scene".
  const [positionQuery, setPositionQuery] = useState('')
  const afterCandidates = useMemo(
    () => regularScenes.filter((s) => s.id !== editingScene?.id),
    [regularScenes, editingScene],
  )
  const filteredAfterCandidates = useMemo(() => {
    const q = positionQuery.trim().toLowerCase()
    const pool = q ? afterCandidates.filter((s) => sceneHeading(dataset.scenes, s).toLowerCase().includes(q)) : afterCandidates
    return pool.slice(0, 50)
  }, [afterCandidates, positionQuery, dataset.scenes])

  function afterOptionLabel(scene: Scene): string {
    return `After: ${sceneHeading(dataset.scenes, scene)}${afterOptionChapterLabel(scene)}`
  }

  function selectedPositionLabel(): string {
    if (insertChoice === 'keep') return 'Keep current position'
    if (insertChoice === 'end') return `At the end${lastChapterLabel}`
    if (insertChoice === 'start') return `At the beginning${firstChapterLabel}`
    const scene = afterCandidates.find((s) => s.id === insertChoice)
    return scene ? afterOptionLabel(scene) : `At the end${lastChapterLabel}`
  }

  function pickScenePreset(preset: (typeof SCENE_PRESETS)[number]) {
    setKind(preset.kind)
    setTitle(preset.label)
  }

  function pickMatterPreset(preset: (typeof MATTER_PRESETS)[number]) {
    setKind(preset.kind)
    setTitle(preset.label)
    setMatterPosition(preset.defaultPosition)
  }

  function pickCustom() {
    setKind(behavior === 'matter' ? 'custom-matter' : 'custom-scene')
    setTitle('')
  }

  const isRegularGroup = kind !== null && REGULAR_SCENE_KINDS.includes(kind)
  const isPrologueOrEpilogue = kind === 'prologue' || kind === 'epilogue'
  const typeChanged = isEditing && (behavior !== editingScene!.behavior || kind !== editingScene!.kind)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!behavior || !kind || !title.trim()) return

    if (isEditing) {
      dispatch({
        type: 'UPDATE_SCENE',
        id: editingScene!.id,
        patch: {
          behavior,
          kind,
          title: title.trim(),
          matterPosition: behavior === 'matter' ? matterPosition : null,
        },
      })
      if (isPlanned && isRegularGroup && insertChoice !== 'keep') {
        const insertPosition: InsertPosition =
          insertChoice === 'end' ? 'group-end' : insertChoice === 'start' ? 'group-start' : { after: insertChoice }
        dispatch({ type: 'REPOSITION_ENTRY', id: editingScene!.id, insertPosition })
      }
      onClose()
      return
    }

    let insertPosition: InsertPosition = 'group-end'
    if (isRegularGroup) {
      if (insertChoice === 'end') insertPosition = 'group-end'
      else if (insertChoice === 'start') insertPosition = 'group-start'
      else insertPosition = { after: insertChoice }
    }

    dispatch({
      type: 'ADD_ENTRY',
      projectId,
      behavior,
      kind,
      title: title.trim(),
      matterPosition: behavior === 'matter' ? matterPosition : undefined,
      insertPosition,
      status: planning ? 'planned' : 'written',
    })
    onClose()
  }

  return (
    <Modal open onClose={onClose} title={isEditing ? 'Edit Entry' : planning ? 'Plan Next Scene' : 'New Entry'} wide>
      <form onSubmit={submit} className="flex flex-col gap-5">
        {planning && !isEditing && (
          <p className="text-parchment-muted text-sm italic m-0">
            Capturing intent, not documentation — cards stay optional. This entry is marked{' '}
            <span className="text-accent-bright">(Planned)</span> until you mark it written.
          </p>
        )}
        {/* Step 1: behavior */}
        <div>
          <label className="block text-sm text-parchment-muted mb-2">
            {isEditing ? 'Entry type' : 'What are you adding?'}
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setBehavior('scene')
                setKind(null)
                setTitle('')
              }}
              className={`rounded border px-4 py-3 text-left transition-colors ${
                behavior === 'scene'
                  ? 'border-gold bg-surface-2 text-parchment'
                  : 'border-inset bg-surface text-parchment-muted hover:border-gold-dim'
              }`}
            >
              <div className="font-heading text-gold">Scene-type</div>
              <div className="text-xs mt-1">Full cards — Scene, Prologue, Epilogue, Interlude</div>
            </button>
            <button
              type="button"
              onClick={() => {
                setBehavior('matter')
                setKind(null)
                setTitle('')
              }}
              className={`rounded border px-4 py-3 text-left transition-colors ${
                behavior === 'matter'
                  ? 'border-gold bg-surface-2 text-parchment'
                  : 'border-inset bg-surface text-parchment-muted hover:border-gold-dim'
              }`}
            >
              <div className="font-heading text-gold">Matter-type</div>
              <div className="text-xs mt-1">Light cards — Dedication, Foreword, Acknowledgments…</div>
            </button>
          </div>
        </div>

        {/* Step 2: label */}
        {behavior && (
          <div>
            <label className="block text-sm text-parchment-muted mb-2">Choose a label</label>
            <div className="flex flex-wrap gap-2">
              {behavior === 'scene' &&
                SCENE_PRESETS.map((p) => (
                  <button
                    key={p.kind}
                    type="button"
                    onClick={() => pickScenePreset(p)}
                    className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                      kind === p.kind
                        ? 'border-gold bg-gold text-canvas'
                        : 'border-inset bg-surface text-parchment hover:border-gold-dim'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              {behavior === 'matter' &&
                MATTER_PRESETS.map((p) => (
                  <button
                    key={p.kind}
                    type="button"
                    onClick={() => pickMatterPreset(p)}
                    className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                      kind === p.kind
                        ? 'border-gold bg-gold text-canvas'
                        : 'border-inset bg-surface text-parchment hover:border-gold-dim'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              <button
                type="button"
                onClick={pickCustom}
                className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                  kind === 'custom-scene' || kind === 'custom-matter'
                    ? 'border-gold bg-gold text-canvas'
                    : 'border-inset bg-surface text-parchment hover:border-gold-dim'
                }`}
              >
                Custom…
              </button>
            </div>
          </div>
        )}

        {/* Step 3: title */}
        {kind && (
          <div>
            <label className="block text-sm text-parchment-muted mb-2" htmlFor="entry-title">
              Title
            </label>
            <input
              id="entry-title"
              autoFocus={!isEditing}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={kind === 'custom-scene' || kind === 'custom-matter' ? 'Type a label…' : undefined}
              className="w-full rounded border border-inset bg-canvas text-parchment px-3 py-2 focus:border-gold outline-none"
            />
          </div>
        )}

        {/* Step 4: position — offered when creating, or when editing a still-Planned scene
            (planning is non-linear, so its number/position stays freely editable; a Written
            scene's position only changes via Move Up/Down on the Table of Contents). */}
        {(!isEditing || isPlanned) && kind && isRegularGroup && (
          <div>
            <label className="block text-sm text-parchment-muted mb-2">Position</label>
            <div className="flex flex-wrap gap-2 mb-3">
              {isEditing && (
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
              )}
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
                Picking a specific "After" scene keeps the new entry in that scene's chapter — pick "At the end" to
                land in the newest chapter instead.
              </p>
            )}
          </div>
        )}

        {!isEditing && kind && isPrologueOrEpilogue && (
          <p className="text-parchment-muted text-sm italic m-0">
            This will be added as the next {kind === 'prologue' ? 'Prologue' : 'Epilogue'}. PR/EP numbering never
            touches the regular chapter sequence.
          </p>
        )}

        {kind && behavior === 'matter' && (
          <div>
            <label className="block text-sm text-parchment-muted mb-2">Position</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMatterPosition('start')}
                className={`flex-1 rounded border px-3 py-2 text-sm transition-colors ${
                  matterPosition === 'start'
                    ? 'border-gold bg-surface-2 text-parchment'
                    : 'border-inset bg-surface text-parchment-muted hover:border-gold-dim'
                }`}
              >
                Start of book
              </button>
              <button
                type="button"
                onClick={() => setMatterPosition('end')}
                className={`flex-1 rounded border px-3 py-2 text-sm transition-colors ${
                  matterPosition === 'end'
                    ? 'border-gold bg-surface-2 text-parchment'
                    : 'border-inset bg-surface text-parchment-muted hover:border-gold-dim'
                }`}
              >
                End of book
              </button>
            </div>
          </div>
        )}

        {isEditing && typeChanged && (
          <p className="text-gold-dim text-sm italic m-0">
            Changing type changes which cards show and how this entry is numbered. Nothing already written in any
            card is deleted — hidden cards keep their content if you switch back.
          </p>
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
            disabled={!behavior || !kind || !title.trim()}
            className="px-4 py-2 rounded bg-accent hover:bg-accent-bright text-parchment font-heading tracking-wide disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {isEditing ? 'Save Changes' : 'Create'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
