import type { IndexEntry } from '../types'
import { capitalizeFirstLetter, parseSegments, splitDisplayLines, splitHeadingSegments, type LinkSegment } from '../utils/links'

/** Renders a pre-parsed list of bracket-link segments — the exact rendering LinkedText has always done, just factored out so both a plain line and a heading's label/value portions can share it without re-parsing text that's already been split. */
function InlineSegments({
  segments,
  entries,
  onOpenEntry,
}: {
  segments: LinkSegment[]
  entries: IndexEntry[]
  onOpenEntry?: (entry: IndexEntry) => void
}) {
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
              {entry.name}
            </button>
          )
        }
        return (
          <span key={i} className="text-link font-medium">
            {entry.name}
          </span>
        )
      })}
    </>
  )
}

/**
 * Read-only "at rest" rendering of text containing bracket-links, "##"
 * headings, and "###" subheadings. Resolved links (entry still exists)
 * ALWAYS show that entry's CURRENT name, looked up live by id — never the
 * label frozen inside the stored token at insertion time. Renaming an
 * entry in the Index therefore updates every place it's linked instantly,
 * with no re-typing and no re-save needed, since this lookup happens at
 * render time (see AppContext's UPDATE_INDEX_ENTRY, which also proactively
 * rewrites every stored label dataset-wide via utils/links.refreshAllLabels
 * so storage — and exports — stay in sync; that lookup/entry.name here is
 * what actually fixes display, and is correct even for data that hasn't
 * been rewritten yet). The stored label (`seg.cachedDisplay`) is used ONLY
 * as the degraded fallback below, when the entry no longer exists at all —
 * that's the one case where there's no current name to look up, so the
 * last known name is what a deleted link's text reads as. Renaming also
 * still auto-registers the old name as an alias, so hand-typing `[[OldName]]`
 * later keeps resolving to the same entry; it just never changes what
 * already-linked text displays.
 *
 * This is the SOLE renderer for card text everywhere it's shown at rest —
 * the collapsed/expanded scene card, Full Card View's preview, the Table
 * of Contents peek popup, and anywhere else a card's text is displayed —
 * so line breaks, headings, and link resolution can never diverge between
 * views by construction.
 *
 * Every line (see utils/links.splitDisplayLines) renders as its own block,
 * always — a single newline is a visible line break, and a blank line
 * (rendered as a non-breaking space so it isn't collapsed away) reads as
 * paragraph spacing. This holds regardless of heading markers; a field
 * with no heading at all still gets one block per line, just without any
 * heading-specific styling.
 *
 * A line starting with "##" renders as a heading instead of plain prose,
 * and a line starting with "###" (or more "#") as a subheading — narrow,
 * two-level marker support, not a markdown engine. The LONGEST leading run
 * of "#" wins (see utils/links.splitDisplayLines), so "###" always reads
 * as one subheading marker, never a heading plus a stray "#"; a single "#"
 * is not a marker at all and renders as typed.
 *
 * A "##" heading renders in full-capitals, bold heading typography, in
 * malachite green. It may optionally use a "##Label- value" form (e.g.
 * "##Day- Zero.") to split into two colors on one line: everything up to
 * and including the first "-" stays green, everything after it renders in
 * gold — see utils/links.splitHeadingSegments. That split runs on the
 * line's PARSED segments, not its raw string, specifically so a
 * bracket-link token's own id (always dash-containing, being a UUID) can
 * never be mistaken for the label/value separator and bisected. A heading
 * with no dash has nothing to split, so the whole line is just the green
 * label — the common case, and the only one the Tips section documents.
 *
 * A "###" subheading is visibly smaller and lighter-weight than a "##"
 * heading — still clearly heading-style text, not body prose — rendered in
 * gold, in sentence case: its first letter is capitalized regardless of
 * how it was typed (see utils/links.capitalizeFirstLetter), unlike a "##"
 * heading's text, which always renders exactly as typed.
 *
 * Plain lines (no marker) are always ordinary body text, unaffected by any
 * heading or subheading elsewhere in the same field. (A resolved bracket
 * link still renders in its own green wherever it appears — heading,
 * subheading, or plain body — this always colors links explicitly
 * regardless of the surrounding text's color.)
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

  return (
    <>
      {lines.map((line, i) => {
        if (line.level === 0) {
          return (
            <div key={i}>
              {line.text === '' ? (
                ' '
              ) : (
                <InlineSegments segments={parseSegments(line.text)} entries={entries} onOpenEntry={onOpenEntry} />
              )}
            </div>
          )
        }
        if (line.level === 3) {
          const segments = capitalizeFirstLetter(parseSegments(line.text))
          return (
            <div key={i} className="font-heading text-sm font-normal tracking-wide text-gold mt-1.5 first:mt-0">
              <InlineSegments segments={segments} entries={entries} onOpenEntry={onOpenEntry} />
            </div>
          )
        }
        const { label, value } = splitHeadingSegments(parseSegments(line.text))
        return (
          <div key={i} className="font-heading text-lg font-bold uppercase tracking-wide mt-2 first:mt-0">
            <span className="text-link">
              <InlineSegments segments={label} entries={entries} onOpenEntry={onOpenEntry} />
            </span>
            {value !== null && (
              <span className="text-gold">
                <InlineSegments segments={value} entries={entries} onOpenEntry={onOpenEntry} />
              </span>
            )}
          </div>
        )
      })}
    </>
  )
}
