import { useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useApp } from '../store/AppContext'
import AppHeader from '../components/AppHeader'
import LinkedText from '../components/LinkedText'
import LinkedTextEditor, { type LinkedTextEditorHandle } from '../components/LinkedTextEditor'
import { TEXT_CARDS, type TextCardKey } from '../data/cards'
import { sceneHeading } from '../utils/tocOrdering'

export default function FullCardView() {
  const { projectId, sceneId, cardKey } = useParams<{
    projectId: string
    sceneId: string
    cardKey: string
  }>()
  const navigate = useNavigate()
  const { getScene, dataset, dispatch } = useApp()
  const scene = sceneId ? getScene(sceneId) : undefined

  const cardMeta = TEXT_CARDS.find((c) => c.key === cardKey)
  const key = cardMeta?.key as TextCardKey | undefined

  const editorRef = useRef<LinkedTextEditorHandle>(null)
  const [showHint, setShowHint] = useState(!dataset.meta.hasSeenLinkHint)
  // The editor is a plain <textarea> by design (see LinkedTextEditor's doc
  // comment) — it can never show brackets-hidden, malachite-green resolved
  // links while typing. Previously the ONLY place that at-rest rendering
  // ever appeared was the 2-line truncated snippet back on the scene card,
  // which isn't enough to actually read a full paragraph. This toggle adds
  // a genuine full, untruncated at-rest view right on the card itself,
  // without changing the default "tap card, land in edit mode" flow.
  const [previewing, setPreviewing] = useState(false)

  const projectEntries = useMemo(
    () => (projectId ? dataset.indexEntries.filter((e) => e.projectId === projectId) : []),
    [dataset.indexEntries, projectId],
  )

  const backTo = `/project/${projectId}/scene/${sceneId}`

  if (!scene || !cardMeta || !key || !projectId) {
    return (
      <div className="flex-1 flex flex-col">
        <AppHeader title="Not found" onBack={() => navigate(backTo)} />
        <div className="p-6 text-parchment-muted">This card no longer exists.</div>
      </div>
    )
  }

  function leave() {
    editorRef.current?.flush()
    navigate(backTo)
  }

  function enterPreview() {
    // Flush any pending debounced save first, so a link created moments ago
    // (or a still-in-flight [[ trigger) is reflected in scene[key] before we
    // read it for the at-rest render — otherwise the preview could briefly
    // show stale text.
    editorRef.current?.flush()
    setPreviewing(true)
  }

  return (
    <div className="flex-1 flex flex-col page-turn">
      <AppHeader title={cardMeta.label} onBack={leave} />
      <div className="px-4 pt-2 text-parchment-muted text-sm">{sceneHeading(dataset.scenes, scene)}</div>

      {showHint && !previewing && (
        <div className="mx-4 mt-3 rounded-lg border border-gold-dim bg-surface-2 px-4 py-3 flex items-start gap-3">
          <p className="text-parchment text-sm m-0 flex-1">
            Type <span className="text-link font-medium">[[</span> to link a person, place, or thing — first
            mentions ask you to classify them, after that they link automatically.
          </p>
          <button
            type="button"
            onClick={() => {
              setShowHint(false)
              dispatch({ type: 'SET_LINK_HINT_SEEN' })
            }}
            className="shrink-0 text-gold-dim hover:text-gold text-sm transition-colors"
          >
            Got it
          </button>
        </div>
      )}

      <div className="flex-1 flex flex-col px-4 py-4">
        {previewing ? (
          <div
            onClick={() => setPreviewing(false)}
            className="flex-1 min-h-[40vh] w-full rounded-lg border border-inset bg-surface text-parchment text-xl px-4 py-3 leading-relaxed whitespace-pre-wrap cursor-text"
          >
            {scene[key].trim() ? (
              <LinkedText text={scene[key]} entries={projectEntries} />
            ) : (
              <span className="text-parchment-muted italic">Empty — tap to add</span>
            )}
          </div>
        ) : (
          <LinkedTextEditor
            ref={editorRef}
            key={scene.id + key}
            value={scene[key]}
            projectId={projectId}
            autoFocus
            placeholder={`Write ${cardMeta.label.toLowerCase()} here…`}
            onSave={(raw) => dispatch({ type: 'UPDATE_SCENE', id: scene.id, patch: { [key]: raw } })}
            onFirstFocus={() => {
              if (!dataset.meta.hasSeenLinkHint) {
                setShowHint(true)
              }
            }}
          />
        )}
        <div className="flex justify-between items-center pt-4">
          <button
            type="button"
            onClick={() => (previewing ? setPreviewing(false) : enterPreview())}
            className="text-gold-dim hover:text-gold text-sm transition-colors"
          >
            {previewing ? '← Back to editing' : 'Preview rendered links →'}
          </button>
          <button
            type="button"
            onClick={leave}
            className="px-5 py-2 rounded bg-accent hover:bg-accent-bright text-parchment font-heading tracking-wide transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
