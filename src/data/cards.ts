import type { EntryBehavior } from '../types'

/**
 * Built-in text cards, in a fixed, global, alphabetical order that never
 * changes per-scene or by the user: Actions, Characters, Lore, Setting,
 * Summary, Time. All render as 'compact' cards in the top grid.
 *
 * Connections isn't a plain textarea card (it has its own chip-based UI), so
 * it's handled separately by SceneDetail, but it still participates in the
 * per-project card-visibility toggle under the pseudo-key 'connections' (see
 * CARD_VISIBILITY_ROWS below) and always renders full-width at the bottom,
 * ahead of Easter Eggs / Foreshadowing.
 *
 * Easter Eggs / Foreshadowing is a plain text card like the rest — same
 * editing, bracket-linking, and heading support — but is pinned to the
 * bottom, full-width, after Connections (see 'layout' below).
 */
export const TEXT_CARDS = [
  { key: 'actions', label: 'Actions', behaviors: ['scene'] as EntryBehavior[], layout: 'compact' as const },
  { key: 'characters', label: 'Characters', behaviors: ['scene'] as EntryBehavior[], layout: 'compact' as const },
  { key: 'lore', label: 'Lore', behaviors: ['scene', 'matter'] as EntryBehavior[], layout: 'compact' as const },
  { key: 'setting', label: 'Setting', behaviors: ['scene'] as EntryBehavior[], layout: 'compact' as const },
  { key: 'summary', label: 'Summary', behaviors: ['scene', 'matter'] as EntryBehavior[], layout: 'compact' as const },
  { key: 'time', label: 'Time', behaviors: ['scene'] as EntryBehavior[], layout: 'compact' as const },
  {
    key: 'easterEggs',
    label: 'Easter Eggs / Foreshadowing',
    behaviors: ['scene'] as EntryBehavior[],
    layout: 'full-width' as const,
  },
] as const

export type TextCardKey = (typeof TEXT_CARDS)[number]['key']

/**
 * Every card a project's Card Settings screen lets the user toggle on/off,
 * in display order: the compact built-ins, then Connections (which isn't a
 * TEXT_CARD but still gets a row here), then Easter Eggs. Custom cards are
 * appended separately by the settings screen itself.
 */
export const BUILTIN_CARD_ROWS: { key: string; label: string }[] = [
  ...TEXT_CARDS.filter((c) => c.layout === 'compact').map((c) => ({ key: c.key, label: c.label })),
  { key: 'connections', label: 'Connections' },
  ...TEXT_CARDS.filter((c) => c.layout === 'full-width').map((c) => ({ key: c.key, label: c.label })),
]

/** A card key is visible unless a project's cardVisibility map explicitly sets it to false. */
export function isCardVisible(cardVisibility: Record<string, boolean>, key: string): boolean {
  return cardVisibility[key] !== false
}
