import type { IndexEntry } from '../types'
import { ENTRY_TYPE_LABELS } from '../data/indexEntryTypes'
import IndexEntryBlurbField from './IndexEntryBlurbField'
import Modal from './Modal'

/**
 * The quick-peek popup opened by tapping any resolved [[link]], anywhere
 * the shared LinkedText renderer shows one — a card (built-in or custom),
 * a Connection note, the Table of Contents scene-peek popup, the full
 * Index entry page's own blurb, or this popup's OWN blurb (which can
 * itself link to another entry — tapping it calls `onOpenEntry` again,
 * which the caller handles by swapping `entry` in place rather than
 * stacking a second modal).
 *
 * Reused as-is everywhere a quick peek is needed instead of each screen
 * rolling its own — see SceneDetail, FullCardView, TableOfContents, and
 * IndexScreen for the (small, per-screen) state + save/navigate wiring
 * around it.
 */
export default function IndexEntryPeekModal({
  entry,
  entries,
  projectId,
  onClose,
  onOpenEntry,
  onSaveBlurb,
  onOpenFullEntry,
}: {
  entry: IndexEntry | null
  entries: IndexEntry[]
  projectId: string
  onClose: () => void
  onOpenEntry: (entry: IndexEntry) => void
  onSaveBlurb: (entryId: string, blurb: string) => void
  onOpenFullEntry: (entry: IndexEntry) => void
}) {
  return (
    <Modal open={!!entry} onClose={onClose} title={entry?.name ?? ''}>
      {entry && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center rounded-full border border-gold-dim px-3 py-1 text-sm font-heading text-gold uppercase tracking-wide">
              {ENTRY_TYPE_LABELS[entry.type]}
            </span>
          </div>

          <IndexEntryBlurbField
            entry={entry}
            entries={entries}
            projectId={projectId}
            onSave={(blurb) => onSaveBlurb(entry.id, blurb)}
            onOpenEntry={onOpenEntry}
          />

          {entry.aliases.length > 0 && (
            <div>
              <h3 className="font-heading text-gold-dim text-xs uppercase tracking-wide m-0 mb-1.5">Also Known As</h3>
              <div className="flex flex-wrap gap-2">
                {entry.aliases.map((a) => (
                  <span
                    key={a}
                    className="inline-flex items-center rounded-full border border-inset bg-surface text-parchment px-3 py-1 text-sm"
                  >
                    {a}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded border border-inset text-parchment-muted hover:text-parchment hover:border-gold-dim transition-colors"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => onOpenFullEntry(entry)}
              className="px-4 py-2 rounded bg-accent hover:bg-accent-bright text-parchment font-heading tracking-wide transition-colors"
            >
              Open full entry →
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
