import type { IndexEntryType } from '../types'

/**
 * The single source of truth for how each Index entry category is
 * DISPLAYED — the type picker (creating or changing an entry's type), the
 * peek popup's type label, the full Index entry page, and the Index's own
 * section headers all import this instead of keeping their own copy, so a
 * label change (like "Person" -> "Person(s)") can't drift out of sync in
 * just some of them. This is a display label only — the underlying
 * IndexEntryType value ('person') never changes, so it has no bearing on
 * stored data, links, or the type-change feature itself.
 */
export const ENTRY_TYPE_LABELS: Record<IndexEntryType, string> = {
  person: 'Person(s)',
  place: 'Place',
  thing: 'Thing',
}

export const ENTRY_TYPES: IndexEntryType[] = ['person', 'place', 'thing']
