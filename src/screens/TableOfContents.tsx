import { useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useApp } from '../store/AppContext'
import AppHeader from '../components/AppHeader'
import LinkedText from '../components/LinkedText'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import EntryModal from '../components/EntryModal'
import IndexFAB from '../components/IndexFAB'
import SceneDetail from '../components/SceneDetail'
import { GROUP_LABELS, groupMembers, sceneHeading, type TocGroup } from '../utils/tocOrdering'
import { chapterHeading, groupScenesByChapter } from '../utils/chapters'
import { useIsWide } from '../utils/breakpoint'
import type { Chapter, Scene } from '../types'

const GROUP_SEQUENCE: TocGroup[] = ['matter-start', 'prologue', 'regular', 'epilogue', 'matter-end']

/** One scene row — shared by every group's list and by each chapter's own scene sub-list. Up/down always dispatch the same MOVE_ENTRY action; only which neighbor exists (and therefore whether the button is disabled) differs by caller. */
function SceneRow({
  scene,
  scenes,
  disableUp,
  disableDown,
  highlighted,
  onOpen,
  onMoveUp,
  onMoveDown,
}: {
  scene: Scene
  scenes: Scene[]
  disableUp: boolean
  disableDown: boolean
  highlighted: boolean
  onOpen: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}) {
  return (
    <li>
      <div
        className={`w-full rounded border bg-surface hover:bg-surface-2 hover:border-gold-dim transition-colors flex items-stretch gap-1 ${
          highlighted ? 'border-gold' : 'border-inset'
        }`}
      >
        <button
          type="button"
          onClick={onOpen}
          className="flex-1 text-left px-4 py-3 flex items-center justify-between gap-3 min-w-0"
        >
          <span className="font-heading text-parchment truncate flex items-center gap-2">
            {sceneHeading(scenes, scene)}
            {scene.status === 'planned' && (
              <span className="text-accent-bright text-xs uppercase tracking-wide border border-accent-bright rounded-full px-2 py-0.5 shrink-0">
                Planned
              </span>
            )}
          </span>
          <span className="text-gold-dim text-lg shrink-0">›</span>
        </button>
        <div className="flex flex-col justify-center pr-2 shrink-0">
          <button
            type="button"
            disabled={disableUp}
            onClick={onMoveUp}
            aria-label="Move up"
            className="text-gold-dim hover:text-gold disabled:opacity-20 disabled:hover:text-gold-dim leading-none text-xs px-1"
          >
            ▲
          </button>
          <button
            type="button"
            disabled={disableDown}
            onClick={onMoveDown}
            aria-label="Move down"
            className="text-gold-dim hover:text-gold disabled:opacity-20 disabled:hover:text-gold-dim leading-none text-xs px-1"
          >
            ▼
          </button>
        </div>
      </div>
    </li>
  )
}

export default function TableOfContents() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const { getProject, dataset, dispatch } = useApp()
  const isWide = useIsWide()
  const [searchParams, setSearchParams] = useSearchParams()

  const project = projectId ? getProject(projectId) : undefined

  const grouped = useMemo(() => {
    if (!projectId) return []
    return GROUP_SEQUENCE.map((group) => ({
      group,
      items: groupMembers(dataset.scenes, projectId, group),
    }))
  }, [dataset.scenes, projectId])

  const populatedGroups = grouped.filter((g) => g.items.length > 0)
  const showGroupHeaders = populatedGroups.length > 1

  // Chapters only ever group the 'regular' bucket's scenes — Prologue,
  // Epilogue, and Matter-type entries are entirely unaffected and keep
  // rendering as a plain flat list below, exactly as before.
  const regularScenes = useMemo(
    () => (projectId ? groupMembers(dataset.scenes, projectId, 'regular') : []),
    [dataset.scenes, projectId],
  )
  const { groups: chapterGroups, orphans: orphanScenes } = useMemo(
    () => (projectId ? groupScenesByChapter(regularScenes, dataset.chapters, projectId) : { groups: [], orphans: [] }),
    [regularScenes, dataset.chapters, projectId],
  )

  const projectEntries = useMemo(
    () => dataset.indexEntries.filter((e) => e.projectId === projectId),
    [dataset.indexEntries, projectId],
  )

  const [peekScene, setPeekScene] = useState<Scene | null>(null)
  const [creating, setCreating] = useState(false)
  const [creatingPlanned, setCreatingPlanned] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(project?.title ?? '')
  const [confirmDeleteProject, setConfirmDeleteProject] = useState(false)

  const [creatingChapter, setCreatingChapter] = useState(false)
  const [newChapterName, setNewChapterName] = useState('')
  const [renamingChapter, setRenamingChapter] = useState<Chapter | null>(null)
  const [chapterRenameValue, setChapterRenameValue] = useState('')
  const [deletingChapter, setDeletingChapter] = useState<Chapter | null>(null)

  const selectedSceneId = searchParams.get('scene')
  const selectedScene = useMemo(
    () => (selectedSceneId ? dataset.scenes.find((s) => s.id === selectedSceneId && s.projectId === projectId) : undefined),
    [dataset.scenes, selectedSceneId, projectId],
  )

  function selectInSpread(scene: Scene) {
    setSearchParams({ scene: scene.id })
  }

  function openScene(scene: Scene) {
    if (isWide) selectInSpread(scene)
    else setPeekScene(scene)
  }

  if (!project || !projectId) {
    return (
      <div className="flex-1 flex flex-col">
        <AppHeader title="Not found" onBack={() => navigate('/')} />
        <div className="p-6 text-parchment-muted">This project no longer exists.</div>
      </div>
    )
  }

  function submitRename(e: React.FormEvent) {
    e.preventDefault()
    const title = renameValue.trim()
    if (!title) return
    dispatch({ type: 'RENAME_PROJECT', id: projectId!, title })
    setRenaming(false)
  }

  function submitNewChapter(e: React.FormEvent) {
    e.preventDefault()
    dispatch({ type: 'ADD_CHAPTER', projectId: projectId!, name: newChapterName })
    setNewChapterName('')
    setCreatingChapter(false)
  }

  function submitChapterRename(e: React.FormEvent) {
    e.preventDefault()
    if (!renamingChapter) return
    dispatch({ type: 'RENAME_CHAPTER', id: renamingChapter.id, name: chapterRenameValue })
    setRenamingChapter(null)
  }

  const deletingChapterSceneCount = deletingChapter
    ? dataset.scenes.filter((s) => s.chapterId === deletingChapter.id).length
    : 0

  const totalEntries = populatedGroups.reduce((sum, g) => sum + g.items.length, 0)

  const listPane = (
    <div className="flex-1 overflow-y-auto px-4 py-4">
      {totalEntries === 0 && (
        <p className="text-parchment-muted italic text-center mt-10">
          No entries yet. Tap "New Entry" below to begin the tale.
        </p>
      )}

      <div className="flex flex-col gap-5">
        {populatedGroups.map(({ group, items }) => (
          <div key={group}>
            {showGroupHeaders && (
              <h2 className="font-heading text-gold-dim text-xs tracking-widest uppercase m-0 mb-2">
                {GROUP_LABELS[group]}
              </h2>
            )}

            {group === 'regular' ? (
              <div className="flex flex-col gap-4">
                {chapterGroups.map(({ chapter, scenes }, chapterIdx) => (
                  <div key={chapter.id}>
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <h3 className="font-heading text-parchment text-sm m-0 truncate">
                        {chapterHeading(dataset.chapters, projectId, chapter)}
                      </h3>
                      <div className="flex items-center gap-3 shrink-0 text-xs">
                        <button
                          type="button"
                          disabled={chapterIdx === 0}
                          onClick={() => dispatch({ type: 'REORDER_CHAPTER', id: chapter.id, projectId, direction: 'up' })}
                          aria-label="Move chapter up"
                          className="text-gold-dim hover:text-gold disabled:opacity-20 disabled:hover:text-gold-dim leading-none px-1"
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          disabled={chapterIdx === chapterGroups.length - 1}
                          onClick={() => dispatch({ type: 'REORDER_CHAPTER', id: chapter.id, projectId, direction: 'down' })}
                          aria-label="Move chapter down"
                          className="text-gold-dim hover:text-gold disabled:opacity-20 disabled:hover:text-gold-dim leading-none px-1"
                        >
                          ▼
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setRenamingChapter(chapter)
                            setChapterRenameValue(chapter.name)
                          }}
                          className="text-gold-dim hover:text-gold transition-colors"
                        >
                          Rename Chapter
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingChapter(chapter)}
                          className="text-accent-bright hover:text-accent transition-colors"
                        >
                          Delete Chapter
                        </button>
                      </div>
                    </div>

                    {scenes.length > 0 ? (
                      <>
                        <div className="text-parchment-muted text-xs uppercase tracking-wide mb-1.5 pl-1">Scenes:</div>
                        <ul className="list-none m-0 p-0 flex flex-col gap-2">
                          {scenes.map((scene) => {
                            const globalIdx = regularScenes.findIndex((s) => s.id === scene.id)
                            return (
                              <SceneRow
                                key={scene.id}
                                scene={scene}
                                scenes={dataset.scenes}
                                disableUp={globalIdx === 0}
                                disableDown={globalIdx === regularScenes.length - 1}
                                highlighted={isWide && selectedScene?.id === scene.id}
                                onOpen={() => openScene(scene)}
                                onMoveUp={() => dispatch({ type: 'MOVE_ENTRY', id: scene.id, direction: 'up' })}
                                onMoveDown={() => dispatch({ type: 'MOVE_ENTRY', id: scene.id, direction: 'down' })}
                              />
                            )
                          })}
                        </ul>
                      </>
                    ) : (
                      <p className="text-parchment-muted text-xs italic pl-1 m-0">
                        No scenes yet — move one in with its ▲/▼ controls, or add a new entry below.
                      </p>
                    )}
                  </div>
                ))}

                {orphanScenes.length > 0 && (
                  <div>
                    <h3 className="font-heading text-accent-bright text-sm m-0 mb-1.5">Unassigned</h3>
                    <ul className="list-none m-0 p-0 flex flex-col gap-2">
                      {orphanScenes.map((scene) => {
                        const globalIdx = regularScenes.findIndex((s) => s.id === scene.id)
                        return (
                          <SceneRow
                            key={scene.id}
                            scene={scene}
                            scenes={dataset.scenes}
                            disableUp={globalIdx === 0}
                            disableDown={globalIdx === regularScenes.length - 1}
                            highlighted={isWide && selectedScene?.id === scene.id}
                            onOpen={() => openScene(scene)}
                            onMoveUp={() => dispatch({ type: 'MOVE_ENTRY', id: scene.id, direction: 'up' })}
                            onMoveDown={() => dispatch({ type: 'MOVE_ENTRY', id: scene.id, direction: 'down' })}
                          />
                        )
                      })}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <ul className="list-none m-0 p-0 flex flex-col gap-2">
                {items.map((scene, idx) => (
                  <SceneRow
                    key={scene.id}
                    scene={scene}
                    scenes={dataset.scenes}
                    disableUp={idx === 0}
                    disableDown={idx === items.length - 1}
                    highlighted={isWide && selectedScene?.id === scene.id}
                    onOpen={() => openScene(scene)}
                    onMoveUp={() => dispatch({ type: 'MOVE_ENTRY', id: scene.id, direction: 'up' })}
                    onMoveDown={() => dispatch({ type: 'MOVE_ENTRY', id: scene.id, direction: 'down' })}
                  />
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2 mt-5">
        <button
          type="button"
          onClick={() => {
            setCreatingPlanned(false)
            setCreating(true)
          }}
          className="w-full text-left rounded border border-dashed border-gold-dim text-gold hover:bg-surface transition-colors px-4 py-3"
        >
          + New Entry
        </button>
        <button
          type="button"
          onClick={() => {
            setCreatingPlanned(true)
            setCreating(true)
          }}
          className="w-full text-left rounded border border-dashed border-accent-bright text-accent-bright hover:bg-surface transition-colors px-4 py-3"
        >
          + Plan Next Scene
        </button>
        <button
          type="button"
          onClick={() => setCreatingChapter(true)}
          className="w-full text-left rounded border border-dashed border-gold-dim text-gold hover:bg-surface transition-colors px-4 py-3"
        >
          + New Chapter
        </button>
      </div>
    </div>
  )

  return (
    <div className="flex-1 flex flex-col">
      <AppHeader title={project.title} onBack={() => navigate('/')} />

      <div className="flex items-center justify-end gap-4 px-4 pt-2 text-sm">
        <button
          type="button"
          className="text-gold-dim hover:text-gold transition-colors"
          onClick={() => navigate(`/project/${projectId}/settings`)}
        >
          Cards
        </button>
        <button
          type="button"
          className="text-gold-dim hover:text-gold transition-colors"
          onClick={() => {
            setRenameValue(project.title)
            setRenaming(true)
          }}
        >
          Rename
        </button>
        <button
          type="button"
          className="text-accent-bright hover:text-accent transition-colors"
          onClick={() => setConfirmDeleteProject(true)}
        >
          Delete Project
        </button>
      </div>

      {isWide ? (
        <div className="flex-1 flex min-h-0 divide-x divide-inset">
          <div className="w-full max-w-sm flex flex-col min-h-0 border-r border-inset">{listPane}</div>
          <div className="flex-1 flex flex-col min-h-0">
            {selectedScene ? (
              <>
                <div className="px-4 pt-3 text-parchment-muted text-sm border-b border-inset pb-3">
                  {sceneHeading(dataset.scenes, selectedScene)}
                </div>
                <SceneDetail projectId={projectId} scene={selectedScene} />
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-parchment-muted italic text-center px-8">
                Select an entry from the Table of Contents to view it here.
              </div>
            )}
          </div>
        </div>
      ) : (
        listPane
      )}

      <IndexFAB projectId={projectId} />

      {/* Peek popup — phone only */}
      <Modal
        open={!!peekScene}
        onClose={() => setPeekScene(null)}
        title={peekScene ? sceneHeading(dataset.scenes, peekScene) : ''}
      >
        <p className="text-parchment whitespace-pre-wrap min-h-[3em] m-0 mb-5">
          {peekScene?.summary?.trim() ? (
            <LinkedText text={peekScene.summary} entries={projectEntries} />
          ) : (
            <span className="text-parchment-muted italic">No summary yet.</span>
          )}
        </p>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => setPeekScene(null)}
            className="px-4 py-2 rounded border border-inset text-parchment-muted hover:text-parchment hover:border-gold-dim transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => peekScene && navigate(`/project/${projectId}/scene/${peekScene.id}`)}
            className="px-4 py-2 rounded bg-accent hover:bg-accent-bright text-parchment font-heading tracking-wide transition-colors"
          >
            Continue
          </button>
        </div>
      </Modal>

      {creating && (
        <EntryModal onClose={() => setCreating(false)} projectId={projectId} planning={creatingPlanned} />
      )}

      {/* Rename project modal */}
      <Modal open={renaming} onClose={() => setRenaming(false)} title="Rename Project">
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
              onClick={() => setRenaming(false)}
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

      {/* New chapter modal */}
      <Modal open={creatingChapter} onClose={() => setCreatingChapter(false)} title="New Chapter">
        <form onSubmit={submitNewChapter}>
          <label className="block text-sm text-parchment-muted mb-2" htmlFor="new-chapter-name">
            Name (optional)
          </label>
          <input
            id="new-chapter-name"
            autoFocus
            value={newChapterName}
            onChange={(e) => setNewChapterName(e.target.value)}
            placeholder="e.g. The Beginning"
            className="w-full rounded border border-inset bg-canvas text-parchment px-3 py-2 mb-5 focus:border-gold outline-none"
          />
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setCreatingChapter(false)}
              className="px-4 py-2 rounded border border-inset text-parchment-muted hover:text-parchment hover:border-gold-dim transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded bg-accent hover:bg-accent-bright text-parchment font-heading tracking-wide transition-colors"
            >
              Create
            </button>
          </div>
        </form>
      </Modal>

      {/* Rename chapter modal — addable/editable/removable at any time, same as a scene title. */}
      <Modal open={!!renamingChapter} onClose={() => setRenamingChapter(null)} title="Rename Chapter">
        <form onSubmit={submitChapterRename}>
          <label className="block text-sm text-parchment-muted mb-2" htmlFor="chapter-rename">
            Name (leave blank for none)
          </label>
          <input
            id="chapter-rename"
            autoFocus
            value={chapterRenameValue}
            onChange={(e) => setChapterRenameValue(e.target.value)}
            placeholder="e.g. The Beginning"
            className="w-full rounded border border-inset bg-canvas text-parchment px-3 py-2 mb-5 focus:border-gold outline-none"
          />
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setRenamingChapter(null)}
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

      {/* Deleting a non-empty chapter is blocked outright — its scenes are
          never silently destroyed. Move them into another chapter first
          with their own ▲/▼ controls (the same cross-chapter move used for
          any other reordering), then delete becomes available. */}
      <Modal
        open={!!deletingChapter && deletingChapterSceneCount > 0}
        onClose={() => setDeletingChapter(null)}
        title="Chapter Not Empty"
      >
        <p className="text-parchment mb-5">
          "{deletingChapter ? chapterHeading(dataset.chapters, projectId, deletingChapter) : ''}" still has{' '}
          <strong>{deletingChapterSceneCount}</strong> scene{deletingChapterSceneCount === 1 ? '' : 's'}. Move{' '}
          {deletingChapterSceneCount === 1 ? 'it' : 'them'} into another chapter first — using that scene's own ▲/▼
          controls to cross the chapter boundary — then this chapter can be deleted.
        </p>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setDeletingChapter(null)}
            className="px-4 py-2 rounded bg-accent hover:bg-accent-bright text-parchment font-heading tracking-wide transition-colors"
          >
            Got it
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deletingChapter && deletingChapterSceneCount === 0}
        title="Delete this chapter?"
        message={`"${deletingChapter ? chapterHeading(dataset.chapters, projectId, deletingChapter) : ''}" is empty and will be permanently deleted. This cannot be undone.`}
        confirmLabel="Delete Chapter"
        onCancel={() => setDeletingChapter(null)}
        onConfirm={() => {
          if (deletingChapter) dispatch({ type: 'DELETE_CHAPTER', id: deletingChapter.id })
          setDeletingChapter(null)
        }}
      />

      <ConfirmDialog
        open={confirmDeleteProject}
        title="Delete this project?"
        message={`"${project.title}" and all of its entries will be permanently deleted. This cannot be undone.`}
        confirmLabel="Delete Project"
        onCancel={() => setConfirmDeleteProject(false)}
        onConfirm={() => {
          dispatch({ type: 'DELETE_PROJECT', id: projectId! })
          navigate('/')
        }}
      />
    </div>
  )
}
