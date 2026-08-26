// ─────────────────────────────────────────────────────────────────────────
// The Grimoire — Data Schema
//
// Designed in Phase 1 with full awareness of Phase 2 requirements
// (ID-based bracket-linking, aliases, Planned-scene conversion) so the
// schema does not need reworking once Phase 2 begins. Some fields below
// are written and read by Phase 1 code (status, connections), and some
// are present but unused until Phase 2 (aliases, seeAlso, sceneIds on
// IndexEntry — populated only once the bracket-linking engine exists).
// ─────────────────────────────────────────────────────────────────────────

export const SCHEMA_VERSION = 3

export type IndexEntryType = 'person' | 'place' | 'thing'

export type SceneStatus = 'written' | 'planned'

/** Which card set + numbering scheme an entry participates in. */
export type EntryBehavior = 'scene' | 'matter'

/**
 * The preset (or custom) label an entry was created with. This is stored
 * separately from `title` — title is free text the user can rename at any
 * time, but `kind` keeps driving numbering scheme and card set regardless
 * of whatever the title has been edited to say.
 */
export type SceneKind =
  // Scene-type kinds
  | 'scene'
  | 'prologue'
  | 'epilogue'
  | 'interlude'
  | 'custom-scene'
  // Matter-type kinds
  | 'dedication'
  | 'foreword'
  | 'acknowledgments'
  | 'authors-note'
  | 'bibliography'
  | 'glossary'
  | 'editors-notes'
  | 'custom-matter'

/** Only meaningful when behavior === 'matter'. */
export type MatterPosition = 'start' | 'end'

/** A link from one scene to another. Cross-project links are allowed. */
export interface SceneConnection {
  sceneId: string
  projectId: string
  /** Optional free text describing why the two scenes are connected. */
  note?: string
}

export interface Scene {
  id: string
  projectId: string
  behavior: EntryBehavior
  kind: SceneKind
  /** Only set when behavior === 'matter'. Fixed point at start or end of the book. */
  matterPosition: MatterPosition | null
  /**
   * Free text, fully user-editable at any time. This is NOT used to compute
   * position numbers/markers — those are always derived live from list
   * order (see utils/tocOrdering.ts) and are never stored here.
   */
  title: string
  status: SceneStatus
  characters: string
  actions: string
  setting: string
  time: string
  lore: string
  /** Compressed briefing — also shown in the Table of Contents peek popup. */
  summary: string
  connections: SceneConnection[]
  createdAt: string
  updatedAt: string
}

export interface Project {
  id: string
  title: string
  createdAt: string
  updatedAt: string
}

/**
 * Auto-populated (Phase 2) entirely through the bracket-linking system.
 * The shape exists in Phase 1 so nothing needs migrating later.
 */
export interface IndexEntry {
  id: string
  projectId: string
  type: IndexEntryType
  /** Canonical display name — unique within its project. */
  name: string
  /** Alternate names/strings that resolve to this same entry. */
  aliases: string[]
  /** IDs of related-but-distinct entries (e.g. singular/plural forms). */
  seeAlso: string[]
  /**
   * @deprecated Kept only so old exports round-trip without data loss.
   * Which scenes reference an entry is now always LIVE-COMPUTED by
   * scanning scene text for resolved bracket-link tokens (see
   * utils/links.ts: entryScenes()) — consistent with how position
   * markers are live-computed rather than stored. Never written to by
   * current code; never read for display.
   */
  sceneIds: string[]
  createdAt: string
  updatedAt: string
}

export interface GrimoireDataset {
  schemaVersion: number
  projects: Project[]
  scenes: Scene[]
  indexEntries: IndexEntry[]
  meta: {
    lastExportedAt: string | null
    /** One-time dismissible onboarding hint for the [[ bracket-link syntax. */
    hasSeenLinkHint: boolean
  }
}

export function createEmptyDataset(): GrimoireDataset {
  return {
    schemaVersion: SCHEMA_VERSION,
    projects: [],
    scenes: [],
    indexEntries: [],
    meta: { lastExportedAt: null, hasSeenLinkHint: false },
  }
}
