import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  createEmptyDataset,
  SCHEMA_VERSION,
  type EntryBehavior,
  type GrimoireDataset,
  type IndexEntry,
  type MatterPosition,
  type Project,
  type Scene,
  type SceneConnection,
  type SceneKind,
  type SceneStatus,
} from '../types'
import { loadDataset, saveDataset, migrateDataset } from './db'
import { makeId, nowIso } from '../utils/id'
import { computeInsertIndex, sceneGroupOf, swapScenePositions, type InsertPosition } from '../utils/tocOrdering'

type Action =
  | { type: 'ADD_PROJECT'; title: string }
  | { type: 'RENAME_PROJECT'; id: string; title: string }
  | { type: 'DELETE_PROJECT'; id: string }
  | {
      type: 'ADD_ENTRY'
      projectId: string
      behavior: EntryBehavior
      kind: SceneKind
      title: string
      matterPosition?: MatterPosition
      insertPosition?: InsertPosition
      status?: SceneStatus
    }
  | { type: 'UPDATE_SCENE'; id: string; patch: Partial<Scene> }
  | { type: 'DELETE_SCENE'; id: string }
  | { type: 'MOVE_ENTRY'; id: string; direction: 'up' | 'down' }
  | { type: 'REPOSITION_ENTRY'; id: string; insertPosition: InsertPosition }
  | {
      type: 'FINALIZE_PLANNED_SCENE'
      id: string
      title: string
      insertPosition?: InsertPosition
    }
  | { type: 'ADD_CONNECTION'; sceneId: string; target: SceneConnection }
  | { type: 'REMOVE_CONNECTION'; sceneId: string; targetSceneId: string }
  | { type: 'UPDATE_CONNECTION_NOTE'; sceneId: string; targetSceneId: string; note: string }
  | { type: 'ADD_INDEX_ENTRY'; entry: IndexEntry }
  | { type: 'UPDATE_INDEX_ENTRY'; id: string; patch: Partial<IndexEntry> }
  | { type: 'DELETE_INDEX_ENTRY'; id: string }
  | { type: 'ADD_SEE_ALSO_LINK'; aId: string; bId: string }
  | { type: 'REMOVE_SEE_ALSO_LINK'; aId: string; bId: string }
  | { type: 'SET_LINK_HINT_SEEN' }
  | { type: 'REPLACE_DATASET'; dataset: GrimoireDataset }
  | { type: 'SET_LAST_EXPORTED'; timestamp: string }

function reducer(state: GrimoireDataset, action: Action): GrimoireDataset {
  switch (action.type) {
    case 'ADD_PROJECT': {
      const project: Project = {
        id: makeId(),
        title: action.title.trim(),
        createdAt: nowIso(),
        updatedAt: nowIso(),
      }
      return { ...state, projects: [...state.projects, project] }
    }
    case 'RENAME_PROJECT': {
      return {
        ...state,
        projects: state.projects.map((p) =>
          p.id === action.id ? { ...p, title: action.title.trim(), updatedAt: nowIso() } : p,
        ),
      }
    }
    case 'DELETE_PROJECT': {
      return {
        ...state,
        projects: state.projects.filter((p) => p.id !== action.id),
        scenes: state.scenes.filter((s) => s.projectId !== action.id),
        indexEntries: state.indexEntries.filter((e) => e.projectId !== action.id),
      }
    }
    case 'ADD_ENTRY': {
      const scene: Scene = {
        id: makeId(),
        projectId: action.projectId,
        behavior: action.behavior,
        kind: action.kind,
        matterPosition: action.behavior === 'matter' ? (action.matterPosition ?? 'end') : null,
        title: action.title.trim(),
        status: action.status ?? 'written',
        characters: '',
        actions: '',
        setting: '',
        time: '',
        lore: '',
        summary: '',
        connections: [],
        createdAt: nowIso(),
        updatedAt: nowIso(),
      }
      const group = sceneGroupOf(scene)
      const insertIdx = computeInsertIndex(state.scenes, action.projectId, group, action.insertPosition ?? 'group-end')
      const scenes = [...state.scenes]
      scenes.splice(insertIdx, 0, scene)
      return { ...state, scenes }
    }
    case 'MOVE_ENTRY': {
      const scene = state.scenes.find((s) => s.id === action.id)
      if (!scene) return state
      const group = sceneGroupOf(scene)
      const siblings = state.scenes.filter((s) => s.projectId === scene.projectId && sceneGroupOf(s) === group)
      const idx = siblings.findIndex((s) => s.id === scene.id)
      const neighbor = action.direction === 'up' ? siblings[idx - 1] : siblings[idx + 1]
      if (!neighbor) return state
      return { ...state, scenes: swapScenePositions(state.scenes, scene.id, neighbor.id) }
    }
    case 'REPOSITION_ENTRY': {
      const scene = state.scenes.find((s) => s.id === action.id)
      if (!scene) return state
      const group = sceneGroupOf(scene)
      const withoutScene = state.scenes.filter((s) => s.id !== scene.id)
      const insertIdx = computeInsertIndex(withoutScene, scene.projectId, group, action.insertPosition)
      const scenes = [...withoutScene]
      scenes.splice(insertIdx, 0, scene)
      return { ...state, scenes }
    }
    case 'FINALIZE_PLANNED_SCENE': {
      let scenes = state.scenes.map((s) =>
        s.id === action.id ? { ...s, title: action.title.trim(), status: 'written' as const, updatedAt: nowIso() } : s,
      )
      if (action.insertPosition) {
        const scene = scenes.find((s) => s.id === action.id)
        if (scene) {
          const group = sceneGroupOf(scene)
          const without = scenes.filter((s) => s.id !== scene.id)
          const insertIdx = computeInsertIndex(without, scene.projectId, group, action.insertPosition)
          scenes = [...without]
          scenes.splice(insertIdx, 0, scene)
        }
      }
      return { ...state, scenes }
    }
    case 'UPDATE_SCENE': {
      return {
        ...state,
        scenes: state.scenes.map((s) =>
          s.id === action.id ? { ...s, ...action.patch, updatedAt: nowIso() } : s,
        ),
      }
    }
    case 'DELETE_SCENE': {
      // Connections in OTHER scenes pointing at this one are intentionally left
      // in place — they degrade gracefully to a visible "broken" chip rather
      // than being silently cascade-repaired.
      return { ...state, scenes: state.scenes.filter((s) => s.id !== action.id) }
    }
    case 'ADD_CONNECTION': {
      return {
        ...state,
        scenes: state.scenes.map((s) => {
          if (s.id !== action.sceneId) return s
          const exists = s.connections.some((c) => c.sceneId === action.target.sceneId)
          if (exists) return s
          return { ...s, connections: [...s.connections, action.target], updatedAt: nowIso() }
        }),
      }
    }
    case 'REMOVE_CONNECTION': {
      return {
        ...state,
        scenes: state.scenes.map((s) =>
          s.id === action.sceneId
            ? {
                ...s,
                connections: s.connections.filter((c) => c.sceneId !== action.targetSceneId),
                updatedAt: nowIso(),
              }
            : s,
        ),
      }
    }
    case 'UPDATE_CONNECTION_NOTE': {
      return {
        ...state,
        scenes: state.scenes.map((s) =>
          s.id === action.sceneId
            ? {
                ...s,
                connections: s.connections.map((c) =>
                  c.sceneId === action.targetSceneId ? { ...c, note: action.note } : c,
                ),
                updatedAt: nowIso(),
              }
            : s,
        ),
      }
    }
    case 'ADD_INDEX_ENTRY': {
      return { ...state, indexEntries: [...state.indexEntries, action.entry] }
    }
    case 'UPDATE_INDEX_ENTRY': {
      return {
        ...state,
        indexEntries: state.indexEntries.map((e) => {
          if (e.id !== action.id) return e
          const patch = action.patch
          let aliases = patch.aliases ?? e.aliases
          // Bracket-linked text keeps showing whatever was typed at insertion
          // (see utils/links.ts) rather than a live canonical name, so a
          // rename here would otherwise strand every place that already used
          // the old name — it'd stop matching on the next edit-and-save
          // round trip. Auto-registering the old name as an alias keeps it
          // resolvable forever without rewriting a word of existing prose.
          if (patch.name && patch.name.trim() && patch.name.trim() !== e.name) {
            const alreadyAliased = aliases.some((a) => a.toLowerCase() === e.name.toLowerCase())
            if (!alreadyAliased) aliases = [...aliases, e.name]
          }
          return { ...e, ...patch, aliases, updatedAt: nowIso() }
        }),
      }
    }
    case 'DELETE_INDEX_ENTRY': {
      // Bracket-link tokens in scene text pointing at this id are intentionally
      // left in place — LinkedText/LinkedTextEditor resolve "id not found" into
      // the graceful degraded (plain, unhighlighted) rendering automatically,
      // the same way a broken scene Connection degrades. Also strip it from any
      // other entry's seeAlso list so those links don't dangle in the Index UI.
      return {
        ...state,
        indexEntries: state.indexEntries
          .filter((e) => e.id !== action.id)
          .map((e) => (e.seeAlso.includes(action.id) ? { ...e, seeAlso: e.seeAlso.filter((id) => id !== action.id) } : e)),
      }
    }
    case 'ADD_SEE_ALSO_LINK': {
      return {
        ...state,
        indexEntries: state.indexEntries.map((e) => {
          if (e.id === action.aId && !e.seeAlso.includes(action.bId)) {
            return { ...e, seeAlso: [...e.seeAlso, action.bId], updatedAt: nowIso() }
          }
          if (e.id === action.bId && !e.seeAlso.includes(action.aId)) {
            return { ...e, seeAlso: [...e.seeAlso, action.aId], updatedAt: nowIso() }
          }
          return e
        }),
      }
    }
    case 'REMOVE_SEE_ALSO_LINK': {
      return {
        ...state,
        indexEntries: state.indexEntries.map((e) => {
          if (e.id === action.aId) return { ...e, seeAlso: e.seeAlso.filter((id) => id !== action.bId), updatedAt: nowIso() }
          if (e.id === action.bId) return { ...e, seeAlso: e.seeAlso.filter((id) => id !== action.aId), updatedAt: nowIso() }
          return e
        }),
      }
    }
    case 'SET_LINK_HINT_SEEN': {
      return { ...state, meta: { ...state.meta, hasSeenLinkHint: true } }
    }
    case 'REPLACE_DATASET': {
      return action.dataset
    }
    case 'SET_LAST_EXPORTED': {
      return { ...state, meta: { ...state.meta, lastExportedAt: action.timestamp } }
    }
    default:
      return state
  }
}

interface AppContextValue {
  dataset: GrimoireDataset
  loading: boolean
  dispatch: React.Dispatch<Action>
  getProject: (id: string) => Project | undefined
  getScenesForProject: (projectId: string) => Scene[]
  getScene: (id: string) => Scene | undefined
  importDataset: (incoming: GrimoireDataset, mode: ImportMode, conflictResolutions?: ConflictResolutions) => void
}

/** 'replace' is only offered on a fresh install with no local data at all. */
export type ImportMode = 'replace' | 'merge'

/** Per-conflicting-item choice, keyed by the item's id — see mergeDatasets(). */
export type ItemResolution = 'keep-local' | 'keep-imported' | 'keep-both'
export type ConflictResolutions = Record<string, ItemResolution>

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [dataset, dispatch] = useReducer(reducer, createEmptyDataset())
  const [loading, setLoading] = useState(true)
  const hydrated = useRef(false)

  useEffect(() => {
    loadDataset().then((d) => {
      dispatch({ type: 'REPLACE_DATASET', dataset: d })
      hydrated.current = true
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (!hydrated.current) return
    saveDataset(dataset)
  }, [dataset])

  const getProject = useCallback((id: string) => dataset.projects.find((p) => p.id === id), [dataset])
  const getScenesForProject = useCallback(
    (projectId: string) => dataset.scenes.filter((s) => s.projectId === projectId),
    [dataset],
  )
  const getScene = useCallback((id: string) => dataset.scenes.find((s) => s.id === id), [dataset])

  // The merge needs the current state at call time; a ref keeps it fresh
  // without forcing importDataset to be recreated on every dataset change.
  const currentRef = useRef(dataset)
  currentRef.current = dataset

  const importDataset = useCallback(
    (incoming: GrimoireDataset, mode: ImportMode, conflictResolutions: ConflictResolutions = {}) => {
      const merged = mergeDatasets(currentRef.current, migrateDataset(incoming), mode, conflictResolutions)
      dispatch({ type: 'REPLACE_DATASET', dataset: merged })
    },
    [],
  )

  const value = useMemo<AppContextValue>(
    () => ({
      dataset,
      loading,
      dispatch,
      getProject,
      getScenesForProject,
      getScene,
      importDataset,
    }),
    [dataset, loading, getProject, getScenesForProject, getScene, importDataset],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

function mergeDatasets(
  local: GrimoireDataset,
  incoming: GrimoireDataset,
  mode: ImportMode,
  conflictResolutions: ConflictResolutions,
): GrimoireDataset {
  if (mode === 'replace') {
    return { ...incoming, schemaVersion: SCHEMA_VERSION }
  }

  const byId = <T extends { id: string; updatedAt: string }>(arr: T[]) => {
    const m = new Map<string, T>()
    for (const item of arr) m.set(item.id, item)
    return m
  }

  const mergeArrays = <T extends { id: string; updatedAt: string }>(
    localArr: T[],
    incomingArr: T[],
    keepBoth: (item: T) => T,
  ): T[] => {
    const localMap = byId(localArr)
    const result: T[] = [...localArr]

    for (const inc of incomingArr) {
      const existing = localMap.get(inc.id)
      if (!existing) {
        result.push(inc)
        continue
      }
      const differs = JSON.stringify(existing) !== JSON.stringify(inc)
      if (!differs) continue

      // Defaults to the safe, non-destructive choice if this particular
      // conflict was somehow left out of the map (shouldn't happen — the
      // import UI enumerates every conflict up front — but a missing entry
      // should never silently overwrite local data).
      const choice = conflictResolutions[inc.id] ?? 'keep-local'
      if (choice === 'keep-local') continue
      if (choice === 'keep-imported') {
        const idx = result.findIndex((r) => r.id === inc.id)
        if (idx >= 0) result[idx] = inc
        continue
      }
      if (choice === 'keep-both') {
        result.push(keepBoth(inc))
      }
    }
    return result
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    projects: mergeArrays(local.projects, incoming.projects, (p) => ({
      ...p,
      id: makeId(),
      title: `${p.title} (imported)`,
    })),
    scenes: mergeArrays(local.scenes, incoming.scenes, (s) => ({
      ...s,
      id: makeId(),
    })),
    indexEntries: mergeArrays(local.indexEntries, incoming.indexEntries, (e) => ({
      ...e,
      id: makeId(),
    })),
    meta: local.meta,
  }
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
