import type { GrimoireDataset, IndexEntry, Scene } from '../types'
import { TEXT_CARDS } from '../data/cards'

// ─────────────────────────────────────────────────────────────────────────
// Bracket-linking engine
//
// STORAGE format (what actually lives in Scene text fields):
//   [[@<entryId>|<cachedDisplay>]]
// The "@" right after "[[" is a sentinel that can't plausibly appear in
// plain prose, so any `[[...]]` a writer types that ISN'T a resolved link
// simply never matches this pattern and is left alone as literal text —
// which is exactly the "never-linked mention" / degraded-link look the
// spec calls for, with no separate "broken link" state to track.
//
// cachedDisplay is the text of record — every renderer below shows it
// verbatim, resolved or not, so prose reads exactly as typed (piped-link
// style: the id drives resolution/backlinks, the display text is frozen at
// insertion). Renaming an entry in the Index does NOT rewrite text that
// already used the old name or an alias; see AppContext's
// UPDATE_INDEX_ENTRY, which auto-registers an entry's previous name as an
// alias on rename so every cachedDisplay ever written stays resolvable.
// If the entry is later deleted, the exact same cachedDisplay text is what
// reappears, just unstyled — a degraded link reads as recognizable text,
// never a raw id.
//
// EDITING format (what the editor shows while a field is focused):
//   [[<name>]]
// A friendly round-trip of the above with the id hidden. Because Index
// entry names/aliases are enforced unique per project, converting back to
// the storage format is an exact case-insensitive name/alias match — see
// friendlyToRaw(). This means a writer can also just type `[[SomeName]]`
// by hand (no dropdown) and it resolves on save if SomeName is already a
// known name or alias — the dropdown is a fast-path, not the only path.
// ─────────────────────────────────────────────────────────────────────────

const RAW_TOKEN_RE = /\[\[@([^|\]]+)\|([^\]]*)\]\]/g
const FRIENDLY_SPAN_RE = /\[\[([^[\]]+)\]\]/g

export function makeLinkToken(id: string, display: string): string {
  // Guard against the separators themselves sneaking into stored text.
  const safeDisplay = display.replace(/\]\]/g, ')').replace(/\|/g, '/')
  return `[[@${id}|${safeDisplay}]]`
}

export type LinkSegment =
  | { type: 'text'; value: string }
  | { type: 'link'; id: string; cachedDisplay: string }

/** Splits raw stored text into plain-text and link segments, in order. */
export function parseSegments(raw: string): LinkSegment[] {
  const segments: LinkSegment[] = []
  let lastIndex = 0
  RAW_TOKEN_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = RAW_TOKEN_RE.exec(raw))) {
    if (m.index > lastIndex) segments.push({ type: 'text', value: raw.slice(lastIndex, m.index) })
    segments.push({ type: 'link', id: m[1], cachedDisplay: m[2] })
    lastIndex = m.index + m[0].length
  }
  if (lastIndex < raw.length) segments.push({ type: 'text', value: raw.slice(lastIndex) })
  return segments
}

function projectEntries(entries: IndexEntry[], projectId: string): IndexEntry[] {
  return entries.filter((e) => e.projectId === projectId)
}

/** Case-insensitive substring match against an entry's name or any alias. */
export function matchEntries(entries: IndexEntry[], projectId: string, query: string): IndexEntry[] {
  const q = query.trim().toLowerCase()
  const pool = projectEntries(entries, projectId)
  if (!q) return pool.slice().sort((a, b) => a.name.localeCompare(b.name))
  return pool
    .filter((e) => e.name.toLowerCase().includes(q) || e.aliases.some((a) => a.toLowerCase().includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** Exact (case-insensitive) match against an entry's name or any alias — used for collision checks and resolution. */
export function findExactMatch(entries: IndexEntry[], projectId: string, name: string): IndexEntry | undefined {
  const q = name.trim().toLowerCase()
  if (!q) return undefined
  return projectEntries(entries, projectId).find(
    (e) => e.name.toLowerCase() === q || e.aliases.some((a) => a.toLowerCase() === q),
  )
}

/** Converts stored raw text -> friendly editable text. Each token becomes `[[cachedDisplay]]` — the exact text frozen at insertion, whether or not the target entry still exists (see the module comment above). */
export function rawToFriendly(raw: string): string {
  return parseSegments(raw)
    .map((seg) => (seg.type === 'text' ? seg.value : `[[${seg.cachedDisplay}]]`))
    .join('')
}

/** Converts friendly editable text -> stored raw text, resolving any `[[Name]]` span that exactly matches a known name/alias. Unmatched spans are left as plain literal bracketed text. */
export function friendlyToRaw(friendly: string, entries: IndexEntry[], projectId: string): string {
  return friendly.replace(FRIENDLY_SPAN_RE, (whole, inner: string) => {
    const match = findExactMatch(entries, projectId, inner)
    if (!match) return whole
    return makeLinkToken(match.id, inner)
  })
}

/** Plain-text rendering (tokens resolved to their frozen cachedDisplay text, no styling) — used for compact previews where color/markup would be truncated anyway. */
export function toPlainDisplayText(raw: string): string {
  return parseSegments(raw)
    .map((seg) => (seg.type === 'text' ? seg.value : seg.cachedDisplay))
    .join('')
}

/**
 * Scenes referencing this entry, computed live by scanning every text card
 * of every scene in the same project — mirrors how position markers are
 * always derived, never stored. This is the sole mechanism populating the
 * Index; nothing writes to IndexEntry.sceneIds anymore.
 */
function containsLinkTo(value: string, entryId: string): boolean {
  RAW_TOKEN_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = RAW_TOKEN_RE.exec(value))) {
    if (m[1] === entryId) return true
  }
  return false
}

export function entryScenes(entry: IndexEntry, scenes: Scene[]): Scene[] {
  return scenes.filter((s) => {
    if (s.projectId !== entry.projectId) return false
    if (TEXT_CARDS.some((c) => containsLinkTo(s[c.key], entry.id))) return true
    // Custom cards are full first-class citizens — their free text
    // participates in bracket-linking and Index auto-population exactly
    // like a built-in card's does.
    return Object.values(s.customCardContent ?? {}).some((value) => containsLinkTo(value, entry.id))
  })
}

/**
 * Cursor-position-aware [[ trigger detection for the friendly editor.
 *
 * Blocks on a single stray `]` as well as a full `]]` — backspacing out of
 * a completed `[[Word]]` link deletes the closing brackets one character at
 * a time, and without this the query would transiently read "Word]" for
 * one keystroke before settling. Waiting for BOTH closing brackets to
 * clear gives a clean re-trigger the instant the word itself is exposed,
 * matching backspace-to-relink expectations.
 */
export function detectTrigger(text: string, cursor: number): { start: number; query: string } | null {
  const upTo = text.slice(0, cursor)
  const open = upTo.lastIndexOf('[[')
  if (open === -1) return null
  const between = upTo.slice(open + 2)
  if (between.includes(']') || between.includes('\n')) return null
  return { start: open, query: between }
}

/** Replaces the active `[[query` trigger span with a completed `[[Name]]` link, returning the new text + where the cursor should land. */
export function insertFriendlyLink(
  text: string,
  triggerStart: number,
  cursor: number,
  name: string,
): { text: string; cursor: number } {
  const inserted = `[[${name}]]`
  const next = text.slice(0, triggerStart) + inserted + text.slice(cursor)
  return { text: next, cursor: triggerStart + inserted.length }
}

export function indexEntriesForProject(dataset: GrimoireDataset, projectId: string): IndexEntry[] {
  return projectEntries(dataset.indexEntries, projectId)
}

// ─────────────────────────────────────────────────────────────────────────
// "##" / "###" heading support — deliberately narrow: a line whose first
// non-marker characters are a run of two or more "#" is a heading, marker
// stripped, everything after it on that line rendered in heading style.
// Nothing else about markdown is recognized (no bold/italic/lists) — this
// is a purpose-built line marker, not a markdown parser. Entirely an
// AT-REST rendering concern (see LinkedText) — the editing textarea always
// shows raw "##text"/"###text", exactly like bracket-link tokens always
// show as plain "[[Name]]" while editing. That split is what keeps this
// change from ever touching the bracket-linking engine above: this
// operates on whole LINES before any bracket segment gets parsed, so
// bracket-linking still runs completely unmodified on each line's content.
//
// Two distinct levels, by marker length — the LONGEST leading run of "#" is
// matched first (greedy), so "###" is read as one level-3 marker, never as
// a level-2 "##" plus a leftover "#" character:
//   "##"  (exactly two)   -> level 2, the primary heading.
//   "###" (three or more) -> level 3, a subheading.
// A single "#" matches neither and is left as plain typed text.
// ─────────────────────────────────────────────────────────────────────────

export interface DisplayLine {
  /** Line content with the "#" marker run (and one following space, if any) stripped when level > 0. */
  text: string
  /** 0 = plain body text, 2 = "##" heading, 3 = "###" subheading. */
  level: 0 | 2 | 3
}

const HEADING_LINE_RE = /^(#{2,})\s?(.*)$/

/** Splits raw text into lines, flagging each as plain, a "##" heading, or a "###" subheading. */
export function splitDisplayLines(raw: string): DisplayLine[] {
  return raw.split('\n').map((line) => {
    const m = HEADING_LINE_RE.exec(line)
    if (!m) return { text: line, level: 0 }
    return { text: m[2], level: m[1].length === 2 ? 2 : 3 }
  })
}

/**
 * Subheading auto-capitalization: the rendered "###" line always reads in
 * sentence case, regardless of how it was typed — matching the spec's
 * "automatic, like ##, but not full caps" requirement. This only ever
 * touches the FIRST character of the first plain-text segment; a line that
 * opens with a bracket-link is left alone; a resolved link's cachedDisplay
 * is frozen text (see the module comment above) that nothing should ever
 * rewrite, capitalization included.
 */
export function capitalizeFirstLetter(segments: LinkSegment[]): LinkSegment[] {
  if (segments.length === 0) return segments
  const first = segments[0]
  if (first.type !== 'text' || first.value.length === 0) return segments
  const capitalized = first.value[0].toUpperCase() + first.value.slice(1)
  return [{ type: 'text', value: capitalized }, ...segments.slice(1)]
}

export interface HeadingParts {
  /** Segments up to and including the first literal "-" found in plain text. */
  label: LinkSegment[]
  /** Everything after that dash, or null when the line had no dash to split on — the whole line is then just the label. */
  value: LinkSegment[] | null
}

/**
 * Splits a heading line's already bracket-parsed segments (see
 * parseSegments) into a label portion and a value portion, at the first
 * literal "-" found in a PLAIN-TEXT segment — never inside a link segment.
 * Operating on segments instead of the raw string is what makes this safe:
 * a resolved link's raw token embeds a UUID id (e.g.
 * "[[@982d3870-d1a7-...|Millennium Celebration]]"), which almost always
 * contains its own "-" characters. Splitting the raw string naively would
 * find that dash first and bisect the token itself, leaving both halves as
 * unparseable garbage instead of a resolved link — this is what "##[[Some
 * Link]] = ..." rendering as raw [[@id|...]] syntax was: the id's own
 * dashes losing the race against the intended "##Label- value" dash.
 * Since link segments here are pre-parsed and atomic, a dash embedded in
 * one's id can never be seen as a split point.
 */
export function splitHeadingSegments(segments: LinkSegment[]): HeadingParts {
  const label: LinkSegment[] = []
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    if (seg.type === 'link') {
      label.push(seg)
      continue
    }
    const dashIdx = seg.value.indexOf('-')
    if (dashIdx === -1) {
      label.push(seg)
      continue
    }
    label.push({ type: 'text', value: seg.value.slice(0, dashIdx + 1) })
    const value: LinkSegment[] = []
    const rest = seg.value.slice(dashIdx + 1)
    if (rest) value.push({ type: 'text', value: rest })
    value.push(...segments.slice(i + 1))
    return { label, value }
  }
  return { label, value: null }
}
