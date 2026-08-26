import type { IndexEntry } from '../types'
import { parseSegments, splitDisplayLines, splitHeadingLabel } from '../utils/links'

/** Renders one line's worth of raw text as bracket-link segments — the exact rendering LinkedText has always done, just factored out so it can run once per line when headings are present. */
function InlineSegments({
  text,
  entries,
  onOpenEntry,
}: {
  text: string
  entries: IndexEntry[]
  onOpenEntry?: (entry: IndexEntry) => void
}) {
  const segments = parseSegments(text)

  return (
    <>
      {segments.map((seg, i) => {
        if (seg.type === 'text') return <span key={i}>{seg.value}</span>
        const entry = entries.find((e) => e.id === seg.id)
        if (!entry) {
          return (
            <span key={i} className="text-parchment-muted">
              [[{seg.cachedDisplay}]]
            </span>
          )
        }
        if (onOpenEntry) {
          return (
            <button
              key={i}
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onOpenEntry(entry)
              }}
              className="text-link hover:underline underline-offset-2 font-medium"
            >
              {seg.cachedDisplay}
            </button>
          )
        }
        return (
          <span key={i} className="text-link font-medium">
            {seg.cachedDisplay}
          </span>
        )
      })}
    </>
  )
}

/**
 * Read-only "at rest" rendering of text containing bracket-links and "##"
 * headings. Resolved links (entry still exists) show the exact text that
 * was typed or selected at insertion time — a canonical name or an alias,
 * whichever was used — in malachite green with the [[brackets]] hidden.
 * Renaming an Index entry does NOT retroactively rewrite prose already
 * using an alias or an old name (piped-link style, matching how Obsidian
 * preserves display text); the id still resolves correctly regardless (see
 * AppContext's UPDATE_INDEX_ENTRY, which auto-aliases an entry's previous
 * name on rename so nothing that was ever typed goes unresolved). Degraded
 * links (entry was deleted) fall back to the same plain, unhighlighted
 * bracketed text, visually identical to a mention that was never linked.
 *
 * A line starting with "##" renders as a heading instead of plain prose
 * (see utils/links.splitDisplayLines) — narrow, single-marker support, not
 * a markdown engine. A heading line is written "##Label- value" (e.g.
 * "##Day- Zero.", "##Time of day- Early evening.") and renders as TWO
 * colors on one line: everything up to and including the first "-" is the
 * label, in malachite green (text-link); everything after it is the
 * value, in gold (text-gold) — see utils/links.splitHeadingLabel. A
 * heading with no dash has nothing to split, so the whole line is just the
 * green label. Plain non-heading lines (no "##") also render in gold, on
 * the assumption that they're body prose belonging to whichever heading
 * came before them. (A resolved bracket link renders in its own green
 * wherever it appears, label or value or plain body — LinkedText always
 * colors links explicitly regardless of the surrounding text's color.)
 * This only kicks in on fields that actually contain a "##" line — when no
 * line in this text uses "##", rendering falls straight back to the
 * original flat inline output (no per-line wrapping, no gold), so plain
 * prose — the overwhelming majority of existing content — is completely
 * unaffected by this feature's existence.
 */
export default function LinkedText({
  text,
  entries,
  onOpenEntry,
}: {
  text: string
  entries: IndexEntry[]
  /** Optional — if provided, resolved links become tappable and jump to that entry. */
  onOpenEntry?: (entry: IndexEntry) => void
}) {
  const lines = splitDisplayLines(text)
  const hasHeading = lines.some((l) => l.heading)

  if (!hasHeading) {
    return <InlineSegments text={text} entries={entries} onOpenEntry={onOpenEntry} />
  }

  return (
    <>
      {lines.map((line, i) => {
        if (!line.heading) {
          return (
            <div key={i} className="text-gold">
              <InlineSegments text={line.text} entries={entries} onOpenEntry={onOpenEntry} />
            </div>
          )
        }
        const { label, value } = splitHeadingLabel(line.text)
        return (
          <div key={i} className="font-heading text-lg tracking-wide mt-2 first:mt-0">
            <span className="text-link">
              <InlineSegments text={label} entries={entries} onOpenEntry={onOpenEntry} />
            </span>
            {value !== null && (
              <span className="text-gold">
                <InlineSegments text={value} entries={entries} onOpenEntry={onOpenEntry} />
              </span>
            )}
          </div>
        )
      })}
    </>
  )
}
