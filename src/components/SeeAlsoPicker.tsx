import { useEffect, useMemo, useState } from 'react'
import type { IndexEntry, IndexEntryType } from '../types'
import { ENTRY_TYPES, ENTRY_TYPE_LABELS } from '../data/indexEntryTypes'
import Modal from './Modal'

type TypeFilter = 'all' | IndexEntryType

/**
 * Manual "See Also" linking between two related-but-distinct Index entries
 * (e.g. singular/plural forms) — intentionally separate from the
 * bracket-linking system, since this never merges entries.
 *
 * Lists EVERY eligible entry in the project (every entry except this one and
 * anything already linked) — never a pre-limited subset. A project-wide
 * Index can run into the hundreds, so dropping entries past some fixed
 * count silently (the previous `.slice(0, 50)`, applied before sorting,
 * cut off whichever entries happened to be newest) is never acceptable:
 * search and the type filter below both operate on this same full list.
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
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')

  // Reset-on-exit (v2.6.3) — this component doesn't unmount between a
  // close and a reopen of the SAME entry's picker (only switching to a
  // DIFFERENT entry unmounts it, via IndexScreen's `{liveSelected && ...}`
  // guard), so closing must explicitly clear search and the type filter
  // rather than relying on remount alone.
  useEffect(() => {
    if (!open) {
      setQuery('')
      setTypeFilter('all')
    }
  }, [open])

  const { eligible, excluded } = useMemo(() => {
    const linked = new Set(currentEntry.seeAlso)
    const q = query.trim().toLowerCase()
    const matchesQuery = (e: IndexEntry) =>
      !q || e.name.toLowerCase().includes(q) || e.aliases.some((a) => a.toLowerCase().includes(q))
    const matchesType = (e: IndexEntry) => typeFilter === 'all' || e.type === typeFilter

    const projectMatches = allEntries.filter(
      (e) => e.projectId === currentEntry.projectId && matchesQuery(e) && matchesType(e),
    )
    const eligible = projectMatches
      .filter((e) => e.id !== currentEntry.id && !linked.has(e.id))
      .sort((a, b) => a.name.localeCompare(b.name))
    // Shown dimmed, not selectable, so a search that only matches an
    // already-linked entry (or this entry itself) reads as "found it, it's
    // just not pickable" rather than "No matching entries found" — which
    // looked exactly like the entry didn't exist in the Index at all.
    const excluded = projectMatches
      .filter((e) => e.id === currentEntry.id || linked.has(e.id))
      .map((e) => ({ entry: e, reason: (e.id === currentEntry.id ? 'self' : 'linked') as 'self' | 'linked' }))
      .sort((a, b) => a.entry.name.localeCompare(b.entry.name))
    return { eligible, excluded }
  }, [allEntries, currentEntry, query, typeFilter])

  const alreadyLinkedCount = excluded.filter((x) => x.reason === 'linked').length
  const nothingAtAll = eligible.length === 0 && excluded.length === 0

  return (
    <Modal open={open} onClose={onClose} title={`See Also — ${currentEntry.name}`} wide>
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search this project's Index…"
        className="w-full rounded border border-inset bg-canvas text-parchment px-3 py-2 mb-3 focus:border-gold outline-none"
      />

      <div className="flex flex-wrap items-center gap-1.5 mb-2">
        <span className="text-parchment-muted text-xs shrink-0">Filter</span>
        <button
          type="button"
          onClick={() => setTypeFilter('all')}
          className={`shrink-0 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs transition-colors ${
            typeFilter === 'all'
              ? 'border-gold bg-gold text-canvas'
              : 'border-inset bg-surface text-parchment-muted hover:border-gold-dim'
          }`}
        >
          All
        </button>
        {ENTRY_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTypeFilter(t)}
            className={`shrink-0 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs transition-colors ${
              typeFilter === t
                ? 'border-gold bg-gold text-canvas'
                : 'border-inset bg-surface text-parchment-muted hover:border-gold-dim'
            }`}
          >
            {ENTRY_TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      <p className="text-parchment-muted text-xs mb-3">
        {nothingAtAll
          ? 'No matches'
          : `${eligible.length} available${alreadyLinkedCount > 0 ? ` · ${alreadyLinkedCount} already linked` : ''}`}
      </p>

      <div className="flex flex-col gap-2 max-h-96 overflow-y-auto">
        {nothingAtAll && <p className="text-parchment-muted italic m-0">No matching entries found.</p>}
        {eligible.map((e) => (
          <button
            key={e.id}
            type="button"
            onClick={() => onPick(e)}
            className="text-left rounded border border-inset bg-surface hover:bg-surface-2 hover:border-gold-dim transition-colors px-3 py-2 flex items-center justify-between gap-2"
          >
            <span className="font-heading text-parchment">{e.name}</span>
            <span className="text-gold-dim text-xs uppercase tracking-wide">{ENTRY_TYPE_LABELS[e.type]}</span>
          </button>
        ))}
        {excluded.map(({ entry: e, reason }) => (
          <div
            key={e.id}
            className="rounded border border-inset bg-surface/50 px-3 py-2 flex items-center justify-between gap-2 opacity-50"
          >
            <span className="font-heading text-parchment-muted">{e.name}</span>
            <span className="text-parchment-muted text-xs uppercase tracking-wide">
              {reason === 'self' ? 'This entry' : 'Already linked'}
            </span>
          </div>
        ))}
      </div>
    </Modal>
  )
}
