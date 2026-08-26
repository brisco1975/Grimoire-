import { get, set } from 'idb-keyval'
import { createEmptyDataset, SCHEMA_VERSION, type GrimoireDataset, type Scene } from '../types'

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
      connections: Array.isArray(s.connections) ? (s.connections as Scene['connections']) : [],
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
    projects: Array.isArray(d.projects) ? (d.projects as GrimoireDataset['projects']) : empty.projects,
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
