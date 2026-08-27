import { get, set } from 'idb-keyval'
import { createEmptyDataset, SCHEMA_VERSION, type CustomCardDef, type GrimoireDataset, type Project, type Scene, type SceneConnection } from '../types'
import { makeId } from '../utils/id'

const STORAGE_KEY = 'grimoire-dataset-v1'

/**
 * Natural sort so old free-text scene numbers like "2", "10", "2a", "3.5"
 * order sensibly rather than lexicographically ("10" before "2"). Only
 * used here, to determine array order when migrating pre-v2 data (which
 * had no concept of array-position-based ordering) forward.
 */
function naturalCompare(a: string, b: string): number {
  const ax: (string | number)[] = []
  const bx: (string | number)[] = []
  a.replace(/(\d+)|(\D+)/g, (_m, d, s) => {
    ax.push(d ? parseInt(d, 10) : s)
    return ''
  })
  b.replace(/(\d+)|(\D+)/g, (_m, d, s) => {
    bx.push(d ? parseInt(d, 10) : s)
    return ''
  })
  while (ax.length && bx.length) {
    const an = ax.shift()!
    const bn = bx.shift()!
    if (an !== bn) {
      const nan1 = typeof an === 'number'
      const nan2 = typeof bn === 'number'
      if (nan1 && nan2) return (an as number) - (bn as number)
      return String(an) > String(bn) ? 1 : -1
    }
  }
  return ax.length - bx.length
}

/** Backfills the `id` every SceneConnection now needs, and passes an Unwritten Scene placeholder through unchanged (no pre-v4 data ever had one). */
function migrateConnections(raw: unknown): SceneConnection[] {
  if (!Array.isArray(raw)) return []
  return (raw as Array<Record<string, unknown>>).map((c) => {
    const id = typeof c.id === 'string' && c.id ? c.id : makeId()
    const note = typeof c.note === 'string' ? c.note : undefined
    if (c.sceneId == null && typeof c.unwrittenDescription === 'string') {
      return { id, sceneId: null, projectId: null, unwrittenDescription: c.unwrittenDescription, note }
    }
    return { id, sceneId: (c.sceneId as string) ?? '', projectId: (c.projectId as string) ?? '', note }
  })
}

function migrateProjects(raw: unknown): Project[] {
  if (!Array.isArray(raw)) return []
  return (raw as Array<Record<string, unknown>>).map((p) => ({
    id: p.id as string,
    title: (p.title as string) ?? '',
    customCards: Array.isArray(p.customCards) ? (p.customCards as CustomCardDef[]) : [],
    cardVisibility:
      p.cardVisibility && typeof p.cardVisibility === 'object' ? (p.cardVisibility as Record<string, boolean>) : {},
    createdAt: (p.createdAt as string) ?? new Date().toISOString(),
    updatedAt: (p.updatedAt as string) ?? new Date().toISOString(),
  }))
}

/**
 * Migrates a dataset of an older/unknown schema version forward, applying
 * sensible defaults for missing fields rather than crashing. New fields
 * introduced by later schema versions should be back-filled here.
 *
 * v1 -> v2: scenes gained `behavior`/`kind`/`matterPosition` and lost the
 * free-text `number` field (position is now always live-computed from list
 * order, never stored). Every pre-existing scene becomes a regular
 * Scene-type entry; if it had no title, its old number is preserved into
 * the title so that identifying text isn't silently lost. Scenes are
 * re-sorted per-project by their old number so migrated array order
 * matches what the user used to see.
 *
 * v2 -> v3: added meta.hasSeenLinkHint (defaults false — anyone upgrading
 * sees the bracket-link onboarding hint once, same as a fresh install).
 *
 * v3 -> v4: added per-project customizable cards (Project.customCards,
 * Project.cardVisibility — default to none/empty, meaning every built-in
 * card stays visible), Scene.easterEggs and Scene.customCardContent (both
 * default to empty), and SceneConnection gained a stable `id` (backfilled
 * for every pre-existing connection, keyed off nothing before now) plus
 * support for an "Unwritten Scene" placeholder target (sceneId/projectId
 * null, unwrittenDescription set) — no pre-existing connection was ever a
 * placeholder, so old ones migrate straight across unchanged apart from
 * gaining an id. Also added meta.lastExportedHash (defaults null).
 */
export function migrateDataset(raw: unknown): GrimoireDataset {
  if (!raw || typeof raw !== 'object') return createEmptyDataset()
  const d = raw as Record<string, unknown>

  const empty = createEmptyDataset()

  const rawScenes: Array<Record<string, unknown>> = Array.isArray(d.scenes)
    ? (d.scenes as Array<Record<string, unknown>>)
    : []

  const migratedScenes: Scene[] = rawScenes.map((s) => {
    const legacyNumber = typeof s.number === 'string' ? s.number : ''
    const title = typeof s.title === 'string' && s.title.trim() ? s.title : legacyNumber

    const behavior = s.behavior === 'matter' ? 'matter' : 'scene'
    const knownScenekinds = ['scene', 'prologue', 'epilogue', 'interlude', 'custom-scene']
    const knownMatterKinds = [
      'dedication',
      'foreword',
      'acknowledgments',
      'authors-note',
      'bibliography',
      'glossary',
      'editors-notes',
      'custom-matter',
    ]
    const validKinds = behavior === 'matter' ? knownMatterKinds : knownScenekinds
    const kind = typeof s.kind === 'string' && (validKinds as string[]).includes(s.kind) ? (s.kind as Scene['kind']) : behavior === 'matter' ? 'custom-matter' : 'scene'
    const matterPosition = behavior === 'matter' ? (s.matterPosition === 'start' ? 'start' : 'end') : null

    return {
      id: s.id as string,
      projectId: s.projectId as string,
      behavior,
      kind,
      matterPosition,
      title: title ?? '',
      status: s.status === 'planned' ? 'planned' : 'written',
      characters: (s.characters as string) ?? '',
      actions: (s.actions as string) ?? '',
      setting: (s.setting as string) ?? '',
      time: (s.time as string) ?? '',
      lore: (s.lore as string) ?? '',
      summary: (s.summary as string) ?? '',
      easterEggs: (s.easterEggs as string) ?? '',
      connections: migrateConnections(s.connections),
      customCardContent:
        s.customCardContent && typeof s.customCardContent === 'object'
          ? (s.customCardContent as Record<string, string>)
          : {},
      createdAt: (s.createdAt as string) ?? new Date().toISOString(),
      updatedAt: (s.updatedAt as string) ?? new Date().toISOString(),
      // stash the legacy number transiently for the sort pass below
      __legacyNumber: legacyNumber,
    } as Scene & { __legacyNumber: string }
  })

  // Preserve old per-project ordering (by legacy number) as initial array order.
  const byProject = new Map<string, (Scene & { __legacyNumber: string })[]>()
  for (const s of migratedScenes as (Scene & { __legacyNumber: string })[]) {
    const arr = byProject.get(s.projectId) ?? []
    arr.push(s)
    byProject.set(s.projectId, arr)
  }
  const orderedScenes: Scene[] = []
  for (const arr of byProject.values()) {
    arr.sort((a, b) => naturalCompare(a.__legacyNumber, b.__legacyNumber))
    for (const s of arr) {
      const { __legacyNumber, ...clean } = s
      void __legacyNumber
      orderedScenes.push(clean)
    }
  }

  const rawIndexEntries: Array<Record<string, unknown>> = Array.isArray(d.indexEntries)
    ? (d.indexEntries as Array<Record<string, unknown>>)
    : []
  const rawMeta = (d.meta ?? {}) as Record<string, unknown>

  return {
    schemaVersion: SCHEMA_VERSION,
    projects: Array.isArray(d.projects) ? migrateProjects(d.projects) : empty.projects,
    scenes: orderedScenes,
    indexEntries: rawIndexEntries.map((e) => ({
      id: e.id as string,
      projectId: e.projectId as string,
      type: (e.type as GrimoireDataset['indexEntries'][number]['type']) ?? 'thing',
      name: (e.name as string) ?? '',
      aliases: Array.isArray(e.aliases) ? (e.aliases as string[]) : [],
      seeAlso: Array.isArray(e.seeAlso) ? (e.seeAlso as string[]) : [],
      sceneIds: Array.isArray(e.sceneIds) ? (e.sceneIds as string[]) : [],
      createdAt: (e.createdAt as string) ?? new Date().toISOString(),
      updatedAt: (e.updatedAt as string) ?? new Date().toISOString(),
    })),
    meta: {
      lastExportedAt: (rawMeta.lastExportedAt as string | null | undefined) ?? null,
      lastExportedHash: (rawMeta.lastExportedHash as string | null | undefined) ?? null,
      hasSeenLinkHint: (rawMeta.hasSeenLinkHint as boolean | undefined) ?? false,
    },
  }
}

export async function loadDataset(): Promise<GrimoireDataset> {
  const raw = await get(STORAGE_KEY)
  if (!raw) return createEmptyDataset()
  try {
    return migrateDataset(raw)
  } catch {
    return createEmptyDataset()
  }
}

export async function saveDataset(dataset: GrimoireDataset): Promise<void> {
  await set(STORAGE_KEY, dataset)
}
