import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { useApp } from '../store/AppContext'
import type { IndexEntry, IndexEntryType } from '../types'
import { makeId, nowIso } from '../utils/id'
import {
  detectTrigger,
  findExactMatch,
  friendlyToRaw,
  insertFriendlyLink,
  matchEntries,
  rawToFriendly,
} from '../utils/links'
import Modal from './Modal'

export interface LinkedTextEditorHandle {
  /** Flush any pending debounced save immediately — call before navigating away. */
  flush: () => void
}

const TYPE_LABELS: Record<IndexEntryType, string> = { person: 'Person', place: 'Place', thing: 'Thing' }

/**
 * The active-editing surface for any bracket-linkable text field. Typing
 * `[[` opens a live-filtered dropdown of this project's Index entries
 * (always trailed by "+ New Entry"). While focused, links show as plain
 * `[[Name]]` bracket text by design — the spec's "brackets hidden, green
 * highlight" treatment is reserved for the AT-REST view (see LinkedText,
 * used in ScenePage's card previews) once a field is no longer actively
 * being edited.
 *
 * Deliberately does NOT try to anchor the dropdown to the exact caret
 * pixel position — that measurement is notoriously unreliable across
 * mobile keyboards/browsers (this app is built for thumb-typing on a
 * phone), so the dropdown instead docks just below the field. Less flashy,
 * far more robust.
 */
const LinkedTextEditor = forwardRef<LinkedTextEditorHandle, {
  value: string
  projectId: string
  onSave: (raw: string) => void
  placeholder?: string
  autoFocus?: boolean
  onFirstFocus?: () => void
}>(function LinkedTextEditor({ value, projectId, onSave, placeholder, autoFocus, onFirstFocus }, ref) {
  const { dataset, dispatch } = useApp()

  const [friendly, setFriendly] = useState(() => rawToFriendly(value))
  const [trigger, setTrigger] = useState<{ start: number; query: string } | null>(null)
  const [classifying, setClassifying] = useState<{ name: string } | null>(null)
  const [collision, setCollision] = useState<{ name: string; existing: IndexEntry } | null>(null)
  const [qualifier, setQualifier] = useState('')
  const [qualifierError, setQualifierError] = useState<string | null>(null)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const firstFocusFired = useRef(false)
  // Tracks the raw value WE last committed via onSave. The debounced save
  // dispatches an UPDATE_SCENE, which flows back down as a new `value` prop
  // a moment later — without this guard that round-trip would re-run the
  // resync effect below and stomp local editing state (cursor position, an
  // in-progress `[[` composition, an open dropdown) out from under the user
  // mid-keystroke. Only a genuinely EXTERNAL change to `value` (navigating
  // to a different card/scene, an import, etc.) should trigger a resync.
  const lastSavedRaw = useRef(value)
  // createEntry()/resolveSameThing() both dispatch (ADD_INDEX_ENTRY /
  // UPDATE_INDEX_ENTRY) and then IMMEDIATELY call completeLink() -> commit()
  // in the same synchronous handler, before React has re-rendered. commit()'s
  // setTimeout callback is a closure fixed to whatever `dataset.indexEntries`
  // was at the moment commit() was DEFINED (this render) — reading
  // `dataset.indexEntries` directly there would permanently miss an entry
  // created in that same tick, so friendlyToRaw() can never find an exact
  // match for the word that was just linked and silently leaves it as plain,
  // unresolved `[[Word]]` text instead of a real `[[@id|Word]]` token. That
  // wrong value then gets persisted (and exported) as-is unless the SAME
  // field happens to be touched again later. A ref sidesteps this: its
  // `.current` is updated by the effect below after every render, so by the
  // time a debounced save actually fires (400ms — much longer than a render
  // takes), it always sees the entry that was just created.
  const entriesRef = useRef(dataset.indexEntries)
  useEffect(() => {
    entriesRef.current = dataset.indexEntries
  }, [dataset.indexEntries])

  useEffect(() => {
    if (value === lastSavedRaw.current) return
    lastSavedRaw.current = value
    setFriendly(rawToFriendly(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  // Closes the dropdown on a tap OUTSIDE this field+dropdown, instead of on
  // textarea blur. A real touchscreen tap on the dropdown itself blurs the
  // textarea first (Android Chrome doesn't reliably honor preventDefault()
  // on the synthetic mousedown the way a desktop mouse-drag does), and a
  // blur-triggered close on a short timer could win that race and unmount
  // the dropdown before the tap's click event ever reached the button —
  // "+ New Entry" would silently do nothing. Keying off tap LOCATION instead
  // of focus timing removes the race entirely: a tap inside the dropdown
  // (or a classification/collision modal, both rendered inside this same
  // container) never counts as "outside," no matter how the browser
  // sequences blur vs. click.
  useEffect(() => {
    if (!trigger) return
    function handlePointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setTrigger(null)
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [trigger])

  function commit(next: string) {
    setFriendly(next)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      const raw = friendlyToRaw(next, entriesRef.current, projectId)
      lastSavedRaw.current = raw
      onSave(raw)
    }, 400)
  }

  useImperativeHandle(ref, () => ({
    flush() {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      const raw = friendlyToRaw(friendly, entriesRef.current, projectId)
      lastSavedRaw.current = raw
      onSave(raw)
    },
  }))

  function syncTrigger(text: string, cursor: number) {
    setTrigger(detectTrigger(text, cursor))
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const next = e.target.value
    commit(next)
    syncTrigger(next, e.target.selectionStart ?? next.length)
  }

  function handleSelect(e: React.SyntheticEvent<HTMLTextAreaElement>) {
    const el = e.currentTarget
    syncTrigger(el.value, el.selectionStart ?? el.value.length)
  }

  function placeCaret(pos: number) {
    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (!el) return
      el.focus()
      el.setSelectionRange(pos, pos)
    })
  }

  function completeLink(name: string) {
    if (!trigger || !textareaRef.current) return
    const cursor = textareaRef.current.selectionStart ?? friendly.length
    const { text, cursor: newCursor } = insertFriendlyLink(friendly, trigger.start, cursor, name)
    commit(text)
    setTrigger(null)
    placeCaret(newCursor)
  }

  function pickSuggestion(entry: IndexEntry) {
    completeLink(entry.name)
  }

  function pickNewEntry() {
    const typed = (trigger?.query ?? '').trim()
    if (!typed) return
    const existing = findExactMatch(dataset.indexEntries, projectId, typed)
    if (existing) {
      setCollision({ name: typed, existing })
    } else {
      setClassifying({ name: typed })
    }
  }

  function createEntry(name: string, type: IndexEntryType) {
    const entry: IndexEntry = {
      id: makeId(),
      projectId,
      type,
      name,
      aliases: [],
      seeAlso: [],
      sceneIds: [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    }
    dispatch({ type: 'ADD_INDEX_ENTRY', entry })
    completeLink(name)
  }

  function resolveSameThing() {
    if (!collision) return
    const { name, existing } = collision
    const already = existing.aliases.some((a) => a.toLowerCase() === name.toLowerCase()) || existing.name.toLowerCase() === name.toLowerCase()
    if (!already) {
      dispatch({ type: 'UPDATE_INDEX_ENTRY', id: existing.id, patch: { aliases: [...existing.aliases, name] } })
    }
    completeLink(name)
    setCollision(null)
    setQualifier('')
    setQualifierError(null)
  }

  function submitQualifier() {
    if (!collision || !qualifier.trim()) return
    const qualifiedName = `${collision.name} (${qualifier.trim()})`
    const dup = findExactMatch(dataset.indexEntries, projectId, qualifiedName)
    if (dup) {
      setQualifierError('That name is also taken — try a different qualifier.')
      return
    }
    setQualifierError(null)
    setClassifying({ name: qualifiedName })
    setCollision(null)
    setQualifier('')
  }

  const dropdownOpen = trigger !== null
  const suggestions = dropdownOpen ? matchEntries(dataset.indexEntries, projectId, trigger!.query) : []

  return (
    <div ref={containerRef} className="relative flex-1 flex flex-col">
      <textarea
        ref={textareaRef}
        autoFocus={autoFocus}
        value={friendly}
        placeholder={placeholder}
        onFocus={() => {
          if (!firstFocusFired.current) {
            firstFocusFired.current = true
            onFirstFocus?.()
          }
        }}
        onChange={handleChange}
        onSelect={handleSelect}
        onKeyUp={handleSelect}
        onClick={handleSelect}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && dropdownOpen) {
            e.stopPropagation()
            setTrigger(null)
          }
        }}
        // flex-1 alone would still grow to fill all remaining vertical space
        // in the container regardless of min-height (flex-grow overrides a
        // min-height floor when there's free space to hand out) — so
        // shrinking the field while the dropdown is open needs flex-none
        // plus an explicit height, not just a smaller min-height. That keeps
        // the dropdown docked right below a SHORT field near the top of the
        // available space, instead of below a tall field whose bottom (and
        // everything after it) is hidden under the on-screen keyboard.
        className={`w-full resize-none rounded-lg border border-inset bg-surface text-parchment text-xl px-4 py-3 leading-relaxed focus:border-gold outline-none transition-[flex-basis,height] duration-150 ${
          dropdownOpen ? 'flex-none h-[18vh]' : 'flex-1 min-h-[40vh]'
        }`}
      />

      {dropdownOpen && (
        <div className="mt-2 rounded-lg border border-gold-dim bg-surface-2 shadow-lg shadow-black/40 max-h-56 overflow-y-auto">
          {suggestions.length === 0 && (
            <div className="px-3 py-2 text-parchment-muted text-sm italic">No matches yet.</div>
          )}
          {suggestions.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => pickSuggestion(entry)}
              className="w-full text-left px-3 py-2 hover:bg-surface transition-colors flex items-center justify-between gap-2"
            >
              <span className="text-parchment">{entry.name}</span>
              <span className="text-gold-dim text-xs uppercase tracking-wide">{TYPE_LABELS[entry.type]}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={pickNewEntry}
            disabled={!trigger?.query.trim()}
            className="w-full text-left px-3 py-2 border-t border-inset text-gold hover:bg-surface transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            + New Entry{trigger?.query.trim() ? `: "${trigger.query.trim()}"` : ''}
          </button>
        </div>
      )}

      {/* Classification modal — new, non-colliding entry */}
      <Modal open={!!classifying} onClose={() => setClassifying(null)} title="What is this?">
        {classifying && (
          <div>
            <p className="text-parchment mb-4">
              Classify <strong>"{classifying.name}"</strong> to add it to this project's Index.
            </p>
            <div className="grid grid-cols-3 gap-2">
              {(['person', 'place', 'thing'] as IndexEntryType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    createEntry(classifying.name, t)
                    setClassifying(null)
                  }}
                  className="rounded border border-inset bg-surface hover:border-gold-dim hover:bg-surface-2 transition-colors px-3 py-3 text-center text-parchment"
                >
                  {TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>
        )}
      </Modal>

      {/* Collision modal — typed name already matches an existing entry's name/alias */}
      <Modal
        open={!!collision}
        onClose={() => {
          setCollision(null)
          setQualifier('')
          setQualifierError(null)
        }}
        title="This name is already in the Index"
      >
        {collision && (
          <div>
            <p className="text-parchment mb-1">
              <strong>"{collision.name}"</strong> matches an existing entry:
            </p>
            <div className="rounded border border-inset bg-surface px-3 py-2 mb-4">
              <div className="text-parchment font-heading">{collision.existing.name}</div>
              <div className="text-gold-dim text-xs uppercase tracking-wide">{TYPE_LABELS[collision.existing.type]}</div>
            </div>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={resolveSameThing}
                className="text-left px-4 py-2 rounded border border-inset text-parchment hover:border-gold-dim transition-colors"
              >
                Same thing — link "{collision.name}" as another name for {collision.existing.name}
              </button>

              {qualifier === '' ? (
                <button
                  type="button"
                  onClick={() => setQualifier(' ')}
                  className="text-left px-4 py-2 rounded border border-inset text-parchment hover:border-gold-dim transition-colors"
                >
                  Different thing — this is a separate entry
                </button>
              ) : (
                <div className="rounded border border-inset px-3 py-3">
                  <label className="block text-sm text-parchment-muted mb-2">
                    Add a qualifier so "{collision.name}" can tell them apart:
                  </label>
                  <div className="flex items-center gap-2 mb-2 text-parchment text-sm">
                    <span className="text-parchment-muted">{collision.name} (</span>
                    <input
                      autoFocus
                      value={qualifier.trim()}
                      onChange={(e) => setQualifier(e.target.value || ' ')}
                      placeholder="e.g. the elder"
                      className="flex-1 rounded border border-inset bg-canvas text-parchment px-2 py-1 focus:border-gold outline-none"
                    />
                    <span className="text-parchment-muted">)</span>
                  </div>
                  {qualifierError && <p className="text-accent-bright text-xs mb-2">{qualifierError}</p>}
                  <button
                    type="button"
                    onClick={submitQualifier}
                    disabled={!qualifier.trim()}
                    className="px-3 py-1.5 rounded bg-accent hover:bg-accent-bright text-parchment text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Continue
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  setCollision(null)
                  setQualifier('')
                  setQualifierError(null)
                }}
                className="text-left px-4 py-2 rounded text-parchment-muted hover:text-parchment transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
})

export default LinkedTextEditor
