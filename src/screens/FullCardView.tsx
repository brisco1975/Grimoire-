import { useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useApp } from '../store/AppContext'
import AppHeader from '../components/AppHeader'
import ConfirmDialog from '../components/ConfirmDialog'
import IndexEntryPeekModal from '../components/IndexEntryPeekModal'
import LinkedText from '../components/LinkedText'
import LinkedTextEditor, { type LinkedTextEditorHandle } from '../components/LinkedTextEditor'
import { TEXT_CARDS, type TextCardKey } from '../data/cards'
import { RECENTLY_DELETED_RETENTION_DAYS } from '../store/db'
import { sceneHeading } from '../utils/tocOrdering'

export default function FullCardView() {
  const { projectId, sceneId, cardKey } = useParams<{
    projectId: string
    sceneId: string
    cardKey: string
  }>()
  const navigate = useNavigate()
  const { getScene, getProject, dataset, dispatch } = useApp()
  const scene = sceneId ? getScene(sceneId) : undefined
  const project = projectId ? getProject(projectId) : undefined

  const builtIn = TEXT_CARDS.find((c) => c.key === cardKey)
  const customCard = project?.customCards.find((c) => c.id === cardKey)
  const key = builtIn?.key as TextCardKey | undefined
  const cardMeta = builtIn ?? (customCard ? { key: customCard.id, label: customCard.label } : undefined)

  const value = builtIn && scene ? scene[key!] : customCard && scene ? (scene.customCardContent[customCard.id] ?? '') : ''
  const saveValue = (raw: string) => {
    if (!scene) return
    if (builtIn) dispatch({ type: 'UPDATE_SCENE', id: scene.id, patch: { [key!]: raw } })
    else if (customCard) dispatch({ type: 'UPDATE_CUSTOM_CARD_CONTENT', sceneId: scene.id, cardId: customCard.id, value: raw })
  }

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
  const [confirmClear, setConfirmClear] = useState(false)
  // See SceneDetail's matching comment: look the peeked entry up live by ID
  // on every render, so an edit made inside the popup itself is reflected
  // back into it immediately rather than leaving it on a stale snapshot.
  const [peekEntryId, setPeekEntryId] = useState<string | null>(null)

  const projectEntries = useMemo(
    () => (projectId ? dataset.indexEntries.filter((e) => e.projectId === projectId) : []),
    [dataset.indexEntries, projectId],
  )
  const peekEntry = peekEntryId ? projectEntries.find((e) => e.id === peekEntryId) ?? null : null

  if (!scene || !cardMeta || !projectId) {
    return (
      <div className="flex-1 flex flex-col">
        <AppHeader title="Not found" onBack={() => navigate(-1)} />
        <div className="p-6 text-parchment-muted">This card no longer exists.</div>
      </div>
    )
  }

  function leave() {
    editorRef.current?.flush()
    // navigate(-1) rather than navigate(backTo) — this route was reached by
    // a PUSH from the Scene Page, so leaving should be a true pop (identical
    // to the device/browser back gesture), not another push. Pushing here
    // left a duplicate Scene Page entry in history: Done would land back on
    // the Scene Page correctly, but a SUBSEQUENT back tap popped to this
    // FullCardView entry instead of the Table of Contents, reopening the
    // same card. Popping instead means Done always leaves exactly the
    // history the user already had, so one more back tap goes where it
    // actually should.
    navigate(-1)
  }

  function enterPreview() {
    // Flush any pending debounced save first, so a link created moments ago
    // (or a still-in-flight [[ trigger) is reflected in scene[key] before we
    // read it for the at-rest render — otherwise the preview could briefly
    // show stale text.
    editorRef.current?.flush()
    setPreviewing(true)
  }

  function clearContent() {
    if (!scene || !cardMeta) return
    dispatch({
      type: 'CLEAR_CARD_CONTENT',
      sceneId: scene.id,
      cardKey: cardMeta.key,
      cardLabel: cardMeta.label,
      isCustomCard: !!customCard,
    })
    setConfirmClear(false)
  }

  return (
    <div className="flex-1 flex flex-col page-turn">
      <AppHeader title={cardMeta.label} onBack={leave} />
      <div className="px-4 pt-2 text-parchment-muted text-xl">{sceneHeading(dataset.scenes, scene)}</div>

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
              dispatch({ type: 'SET_LINK_HINT_SEEN', seen: true })
            }}
            className="shrink-0 text-gold-dim hover:text-gold text-sm transition-colors"
          >
            Got it
          </button>
        </div>
      )}

      <div className="flex-1 flex flex-col px-4 py-4">
        {/* Grouped with the editor itself, well above "Done" — a mis-tap
            here only toggles the preview, never exits editing. Previously
            this sat at the opposite bottom corner from "Done" with similar
            visual weight, risking an accidental exit when the user meant to
            check the preview. */}
        <button
          type="button"
          onClick={() => (previewing ? setPreviewing(false) : enterPreview())}
          className="self-start mb-2 text-gold-dim hover:text-gold text-sm transition-colors"
        >
          {previewing ? '← Back to editing' : 'Preview rendered links →'}
        </button>
        {previewing ? (
          <div
            onClick={() => setPreviewing(false)}
            className="flex-1 min-h-[40vh] w-full rounded-lg border border-inset bg-surface text-parchment text-xl px-4 py-3 leading-relaxed whitespace-pre-wrap cursor-text"
          >
            {value.trim() ? (
              <LinkedText text={value} entries={projectEntries} onOpenEntry={(entry) => setPeekEntryId(entry.id)} />
            ) : (
              <span className="text-parchment-muted italic">Empty — tap to add</span>
            )}
          </div>
        ) : (
          <LinkedTextEditor
            ref={editorRef}
            key={scene.id + cardMeta.key}
            value={value}
            projectId={projectId}
            autoFocus
            placeholder={`Write ${cardMeta.label.toLowerCase()} here…`}
            onSave={saveValue}
            onFirstFocus={() => {
              if (!dataset.meta.hasSeenLinkHint) {
                setShowHint(true)
              }
            }}
          />
        )}
        <div className="pt-6 mt-2 border-t border-inset flex justify-between items-center">
          {value.trim() ? (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              className="text-parchment-muted hover:text-accent-bright text-sm transition-colors"
            >
              Clear content
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={leave}
            className="px-5 py-2 rounded bg-accent hover:bg-accent-bright text-parchment font-heading tracking-wide transition-colors"
          >
            Done
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmClear}
        title="Clear this card's content?"
        message={`Everything written in ${cardMeta.label} will be cleared. It moves to Recently Deleted in Settings, where it can be restored for ${RECENTLY_DELETED_RETENTION_DAYS} days.`}
        confirmLabel="Clear"
        onCancel={() => setConfirmClear(false)}
        onConfirm={clearContent}
      />

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
