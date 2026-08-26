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
import { useIsWide } from '../utils/breakpoint'
import type { Scene } from '../types'

const GROUP_SEQUENCE: TocGroup[] = ['matter-start', 'prologue', 'regular', 'epilogue', 'matter-end']

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

  const selectedSceneId = searchParams.get('scene')
  const selectedScene = useMemo(
    () => (selectedSceneId ? dataset.scenes.find((s) => s.id === selectedSceneId && s.projectId === projectId) : undefined),
    [dataset.scenes, selectedSceneId, projectId],
  )

  function selectInSpread(scene: Scene) {
    setSearchParams({ scene: scene.id })
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
            <ul className="list-none m-0 p-0 flex flex-col gap-2">
              {items.map((scene, idx) => (
                <li key={scene.id}>
                  <div
                    className={`w-full rounded border bg-surface hover:bg-surface-2 hover:border-gold-dim transition-colors flex items-stretch gap-1 ${
                      isWide && selectedScene?.id === scene.id ? 'border-gold' : 'border-inset'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => (isWide ? selectInSpread(scene) : setPeekScene(scene))}
                      className="flex-1 text-left px-4 py-3 flex items-center justify-between gap-3 min-w-0"
                    >
                      <span className="font-heading text-parchment truncate flex items-center gap-2">
                        {sceneHeading(dataset.scenes, scene)}
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
                        disabled={idx === 0}
                        onClick={() => dispatch({ type: 'MOVE_ENTRY', id: scene.id, direction: 'up' })}
                        aria-label="Move up"
                        className="text-gold-dim hover:text-gold disabled:opacity-20 disabled:hover:text-gold-dim leading-none text-xs px-1"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        disabled={idx === items.length - 1}
                        onClick={() => dispatch({ type: 'MOVE_ENTRY', id: scene.id, direction: 'down' })}
                        aria-label="Move down"
                        className="text-gold-dim hover:text-gold disabled:opacity-20 disabled:hover:text-gold-dim leading-none text-xs px-1"
                      >
                        ▼
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
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
