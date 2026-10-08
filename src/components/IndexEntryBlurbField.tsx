import { useState } from 'react'
import type { IndexEntry } from '../types'
import LinkedText from './LinkedText'
import LinkedTextEditor from './LinkedTextEditor'

/**
 * An Index entry's short blurb — editable IN PLACE wherever it's shown (the
 * full Index entry page, and the peek popup), no separate edit mode or
 * screen. At rest it's the same shared LinkedText renderer as everywhere
 * else (so a [[link]] inside a blurb is tappable too, via `onOpenEntry`),
 * clamped to a few lines with a "Show more/less" toggle; an empty blurb
 * shows an inviting message that IS the entry point to start typing.
 * Non-empty content gets its own small "Edit" control (same reasoning as a
 * card's — a tap on the rendered text needs to stay free for its links).
 */
export default function IndexEntryBlurbField({
  entry,
  entries,
  projectId,
  onSave,
  onOpenEntry,
}: {
  entry: IndexEntry
  entries: IndexEntry[]
  projectId: string
  onSave: (blurb: string) => void
  onOpenEntry?: (entry: IndexEntry) => void
}) {
  const [editing, setEditing] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const hasContent = entry.blurb.trim().length > 0

  if (editing) {
    return (
      <div className="flex flex-col gap-2">
        <LinkedTextEditor
          variant="compact"
          rows={3}
          autoFocus
          value={entry.blurb}
          projectId={projectId}
          onSave={onSave}
          placeholder="A short description…"
        />
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="self-start text-gold-dim hover:text-gold text-sm transition-colors"
        >
          Done
        </button>
      </div>
    )
  }

  if (!hasContent) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-left text-parchment-muted italic text-sm hover:text-parchment transition-colors"
      >
        No description yet — tap to add
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className={`text-parchment text-sm ${expanded ? '' : 'line-clamp-4'}`}>
        <LinkedText text={entry.blurb} entries={entries} onOpenEntry={onOpenEntry} />
      </div>
      <div className="flex gap-4">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-gold-dim hover:text-gold text-xs transition-colors"
        >
          {expanded ? 'Show less ▲' : 'Show more ▾'}
        </button>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-gold-dim hover:text-gold text-xs transition-colors"
        >
          Edit
        </button>
      </div>
    </div>
  )
}
