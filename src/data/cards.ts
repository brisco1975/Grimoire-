import type { EntryBehavior } from '../types'

/**
 * Fixed, global, alphabetical card order — the same for every entry, never
 * reorderable per-scene or by the user: Actions, Characters, Connections,
 * Lore, Setting, Summary, Time.
 *
 * Connections isn't a plain textarea card (it has its own chip-based UI), so
 * it's handled separately by ScenePage, but its position in this ordering
 * is still respected: it renders between Characters and Lore.
 */
export const TEXT_CARDS_BEFORE_CONNECTIONS = [
  { key: 'actions', label: 'Actions', behaviors: ['scene'] as EntryBehavior[] },
  { key: 'characters', label: 'Characters', behaviors: ['scene'] as EntryBehavior[] },
] as const

export const TEXT_CARDS_AFTER_CONNECTIONS = [
  { key: 'lore', label: 'Lore', behaviors: ['scene', 'matter'] as EntryBehavior[] },
  { key: 'setting', label: 'Setting', behaviors: ['scene'] as EntryBehavior[] },
  { key: 'summary', label: 'Summary', behaviors: ['scene', 'matter'] as EntryBehavior[] },
  { key: 'time', label: 'Time', behaviors: ['scene'] as EntryBehavior[] },
] as const

export const TEXT_CARDS = [...TEXT_CARDS_BEFORE_CONNECTIONS, ...TEXT_CARDS_AFTER_CONNECTIONS]

export type TextCardKey = (typeof TEXT_CARDS)[number]['key']
