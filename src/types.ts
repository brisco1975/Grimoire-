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

export const SCHEMA_VERSION = 4

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

/**
 * What a connection points at: either a real, already-existing scene, or an
 * "Unwritten Scene" placeholder — a free-text description of a scene the
 * writer expects to write later. `sceneId`/`projectId` are null exactly
 * when `unwrittenDescription` is set, and vice versa.
 */
export type ConnectionTarget =
  | { sceneId: string; projectId: string; unwrittenDescription?: undefined }
  | { sceneId: null; projectId: null; unwrittenDescription: string }

/**
 * A link from one scene to another (or to an as-yet-unwritten one). Cross-
 * project links are allowed. `id` is the stable identity used for editing/
 * removal — it's independent of `sceneId` because an Unwritten Scene
 * placeholder has no sceneId to key off of, and a placeholder can later be
 * converted in place (see UPDATE_CONNECTION_TARGET) without losing its note.
 */
export type SceneConnection = ConnectionTarget & {
  id: string
  /** Optional free text describing why the two scenes are connected. */
  note?: string
}

/** One user-defined card, first-class alongside the built-in ones. */
export interface CustomCardDef {
  id: string
  label: string
  /** 'compact' joins the top grid; 'full-width' anchors to the bottom, like Connections. */
  layout: 'compact' | 'full-width'
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
  /** Deliberate hidden references/callbacks/planted details — distinct from a plot Connection. */
  easterEggs: string
  connections: SceneConnection[]
  /** Free text for this project's custom cards, keyed by CustomCardDef.id. */
  customCardContent: Record<string, string>
  createdAt: string
  updatedAt: string
}

export interface Project {
  id: string
  title: string
  /** This project's user-defined cards — configured per project, not globally. */
  customCards: CustomCardDef[]
  /**
   * Per-project on/off toggle for every card (built-in card key, 'connections',
   * or a CustomCardDef id). A key absent from this map means the card is
   * visible — only explicit `false` hides it. Hiding a card never deletes
   * the underlying scene data; it only stops it from rendering.
   */
  cardVisibility: Record<string, boolean>
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
    /**
     * Content hash of the dataset at the last successful export — lets Export
     * tell "nothing changed since last time" apart from "never exported",
     * without keeping a whole duplicate copy of the data around.
     */
    lastExportedHash: string | null
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
    meta: { lastExportedAt: null, lastExportedHash: null, hasSeenLinkHint: false },
  }
}
