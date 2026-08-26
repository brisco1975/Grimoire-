import { useMemo, useState } from 'react'
import type { IndexEntry } from '../types'
import Modal from './Modal'

const TYPE_LABELS: Record<IndexEntry['type'], string> = { person: 'Person', place: 'Place', thing: 'Thing' }

/**
 * Manual "See Also" linking between two related-but-distinct Index entries
 * (e.g. singular/plural forms) — intentionally separate from the
 * bracket-linking system, since this never merges entries.
 */
export default function SeeAlsoPicker({
  open,
  onClose,
  currentEntry,
  allEntries,
  onPick,
}: {
  open: boolean
  onClose: () => void
  currentEntry: IndexEntry
  allEntries: IndexEntry[]
  onPick: (target: IndexEntry) => void
}) {
  const [query, setQuery] = useState('')

  const results = useMemo(() => {
    const linked = new Set(currentEntry.seeAlso)
    const q = query.trim().toLowerCase()
    return allEntries
      .filter((e) => e.projectId === currentEntry.projectId && e.id !== currentEntry.id && !linked.has(e.id))
      .filter((e) => !q || e.name.toLowerCase().includes(q) || e.aliases.some((a) => a.toLowerCase().includes(q)))
      .slice(0, 50)
  }, [allEntries, currentEntry, query])

  return (
    <Modal open={open} onClose={onClose} title={`See Also — ${currentEntry.name}`} wide>
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search this project's Index…"
        className="w-full rounded border border-inset bg-canvas text-parchment px-3 py-2 mb-4 focus:border-gold outline-none"
      />
      <div className="flex flex-col gap-2 max-h-96 overflow-y-auto">
        {results.length === 0 && <p className="text-parchment-muted italic">No matching entries found.</p>}
        {results.map((e) => (
          <button
            key={e.id}
            type="button"
            onClick={() => onPick(e)}
            className="text-left rounded border border-inset bg-surface hover:bg-surface-2 hover:border-gold-dim transition-colors px-3 py-2 flex items-center justify-between gap-2"
          >
            <span className="font-heading text-parchment">{e.name}</span>
            <span className="text-gold-dim text-xs uppercase tracking-wide">{TYPE_LABELS[e.type]}</span>
          </button>
        ))}
      </div>
    </Modal>
  )
}
