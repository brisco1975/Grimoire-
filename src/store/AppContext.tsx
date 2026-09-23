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
  type Chapter,
  type ConnectionTarget,
  type CustomCardDef,
  type EntryBehavior,
  type GrimoireDataset,
  type IndexEntry,
  type MatterPosition,
  type Project,
  type Scene,
  type SceneKind,
  type SceneStatus,
} from '../types'
import { loadDataset, saveDataset, migrateDataset } from './db'
import { makeId, nowIso } from '../utils/id'
import { computeInsertIndex, groupMembers, sceneGroupOf, swapScenePositions, type InsertPosition } from '../utils/tocOrdering'
import { projectChapters } from '../utils/chapters'

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
  | { type: 'ADD_CONNECTION'; sceneId: string; target: ConnectionTarget; note?: string }
  | { type: 'REMOVE_CONNECTION'; sceneId: string; connectionId: string }
  | { type: 'UPDATE_CONNECTION_NOTE'; sceneId: string; connectionId: string; note: string }
  | { type: 'UPDATE_CONNECTION_TARGET'; sceneId: string; connectionId: string; target: ConnectionTarget }
  | { type: 'ADD_INDEX_ENTRY'; entry: IndexEntry }
  | { type: 'UPDATE_INDEX_ENTRY'; id: string; patch: Partial<IndexEntry> }
  | { type: 'DELETE_INDEX_ENTRY'; id: string }
  | { type: 'ADD_SEE_ALSO_LINK'; aId: string; bId: string }
  | { type: 'REMOVE_SEE_ALSO_LINK'; aId: string; bId: string }
  | { type: 'SET_LINK_HINT_SEEN' }
  | { type: 'REPLACE_DATASET'; dataset: GrimoireDataset }
  | { type: 'SET_LAST_EXPORTED'; timestamp: string; hash: string }
  | { type: 'ADD_CUSTOM_CARD'; projectId: string; label: string; layout: CustomCardDef['layout'] }
  | { type: 'UPDATE_CUSTOM_CARD'; projectId: string; cardId: string; patch: Partial<Pick<CustomCardDef, 'label' | 'layout'>> }
  | { type: 'DELETE_CUSTOM_CARD'; projectId: string; cardId: string }
  | { type: 'SET_CARD_VISIBILITY'; projectId: string; cardKey: string; visible: boolean }
  | { type: 'UPDATE_CUSTOM_CARD_CONTENT'; sceneId: string; cardId: string; value: string }
  | { type: 'ADD_CHAPTER'; projectId: string; name?: string }
  | { type: 'RENAME_CHAPTER'; id: string; name: string }
  | { type: 'DELETE_CHAPTER'; id: string }
  | { type: 'REORDER_CHAPTER'; id: string; projectId: string; direction: 'up' | 'down' }

/** Ensures the project has at least one chapter, returning the LAST one's id (creating an unnamed one if none exist yet) plus the possibly-extended chapters array. */
function ensureLastChapter(chapters: Chapter[], projectId: string): { chapterId: string; chapters: Chapter[] } {
  const existing = projectChapters(chapters, projectId)
  if (existing.length > 0) return { chapterId: existing[existing.length - 1].id, chapters }
  const chapter: Chapter = { id: makeId(), projectId, name: '', createdAt: nowIso(), updatedAt: nowIso() }
  return { chapterId: chapter.id, chapters: [...chapters, chapter] }
}

/** Same, but for the FIRST chapter — used when a scene is inserted at the very start of the regular group. */
function ensureFirstChapter(chapters: Chapter[], projectId: string): { chapterId: string; chapters: Chapter[] } {
  const existing = projectChapters(chapters, projectId)
  if (existing.length > 0) return { chapterId: existing[0].id, chapters }
  const chapter: Chapter = { id: makeId(), projectId, name: '', createdAt: nowIso(), updatedAt: nowIso() }
  return { chapterId: chapter.id, chapters: [...chapters, chapter] }
}

/**
 * Which chapter a regular-group scene should land in, given how it's being
 * inserted/positioned — mirrors computeInsertIndex's own handling of the
 * same InsertPosition: 'group-start' -> the project's first chapter,
 * 'group-end' -> its last, {after: X} -> whatever chapter X is already in
 * (falling back to the last chapter if X can't be found). Lazily creates a
 * chapter if the project doesn't have one yet, exactly like the rest of
 * this reducer already lazily creates whatever else a brand-new project
 * needs on first use.
 */
function chapterIdForInsert(
  chapters: Chapter[],
  scenes: Scene[],
  projectId: string,
  position: InsertPosition,
): { chapterId: string; chapters: Chapter[] } {
  if (position === 'group-start') return ensureFirstChapter(chapters, projectId)
  if (position === 'group-end') return ensureLastChapter(chapters, projectId)
  const after = scenes.find((s) => s.id === position.after)
  if (after?.chapterId) return { chapterId: after.chapterId, chapters }
  return ensureLastChapter(chapters, projectId)
}

function reducer(state: GrimoireDataset, action: Action): GrimoireDataset {
  switch (action.type) {
    case 'ADD_PROJECT': {
      const project: Project = {
        id: makeId(),
        title: action.title.trim(),
        customCards: [],
        cardVisibility: {},
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
        chapters: state.chapters.filter((c) => c.projectId !== action.id),
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
        easterEggs: '',
        chapterId: null,
        connections: [],
        customCardContent: {},
        createdAt: nowIso(),
        updatedAt: nowIso(),
      }
      const group = sceneGroupOf(scene)
      const insertPosition = action.insertPosition ?? 'group-end'
      let chapters = state.chapters
      if (group === 'regular') {
        const result = chapterIdForInsert(state.chapters, state.scenes, action.projectId, insertPosition)
        scene.chapterId = result.chapterId
        chapters = result.chapters
      }
      const insertIdx = computeInsertIndex(state.scenes, action.projectId, group, insertPosition)
      const scenes = [...state.scenes]
      scenes.splice(insertIdx, 0, scene)
      return { ...state, chapters, scenes }
    }
    case 'MOVE_ENTRY': {
      const scene = state.scenes.find((s) => s.id === action.id)
      if (!scene) return state
      const group = sceneGroupOf(scene)
      const siblings = state.scenes.filter((s) => s.projectId === scene.projectId && sceneGroupOf(s) === group)
      const idx = siblings.findIndex((s) => s.id === scene.id)
      const neighbor = action.direction === 'up' ? siblings[idx - 1] : siblings[idx + 1]
      if (!neighbor) return state
      if (group === 'regular' && neighbor.chapterId !== scene.chapterId) {
        // Crossing into the adjacent chapter. Chapter order + within-chapter
        // order together always match this project's regular-group array
        // order block-by-block (every action here maintains that), so this
        // scene is already sitting right at the boundary — no array move
        // needed, just re-tag which chapter it belongs to.
        return {
          ...state,
          scenes: state.scenes.map((s) =>
            s.id === scene.id ? { ...s, chapterId: neighbor.chapterId, updatedAt: nowIso() } : s,
          ),
        }
      }
      return { ...state, scenes: swapScenePositions(state.scenes, scene.id, neighbor.id) }
    }
    case 'REPOSITION_ENTRY': {
      const scene = state.scenes.find((s) => s.id === action.id)
      if (!scene) return state
      const group = sceneGroupOf(scene)
      const withoutScene = state.scenes.filter((s) => s.id !== scene.id)
      let chapters = state.chapters
      let repositionedScene = scene
      if (group === 'regular') {
        const result = chapterIdForInsert(chapters, withoutScene, scene.projectId, action.insertPosition)
        chapters = result.chapters
        repositionedScene = { ...scene, chapterId: result.chapterId }
      }
      const insertIdx = computeInsertIndex(withoutScene, scene.projectId, group, action.insertPosition)
      const scenes = [...withoutScene]
      scenes.splice(insertIdx, 0, repositionedScene)
      return { ...state, chapters, scenes }
    }
    case 'FINALIZE_PLANNED_SCENE': {
      let chapters = state.chapters
      let scenes = state.scenes.map((s) =>
        s.id === action.id ? { ...s, title: action.title.trim(), status: 'written' as const, updatedAt: nowIso() } : s,
      )
      if (action.insertPosition) {
        const scene = scenes.find((s) => s.id === action.id)
        if (scene) {
          const group = sceneGroupOf(scene)
          const without = scenes.filter((s) => s.id !== scene.id)
          let repositionedScene = scene
          if (group === 'regular') {
            const result = chapterIdForInsert(chapters, without, scene.projectId, action.insertPosition)
            chapters = result.chapters
            repositionedScene = { ...scene, chapterId: result.chapterId }
          }
          const insertIdx = computeInsertIndex(without, scene.projectId, group, action.insertPosition)
          scenes = [...without]
          scenes.splice(insertIdx, 0, repositionedScene)
        }
      }
      return { ...state, chapters, scenes }
    }
    case 'UPDATE_SCENE': {
      const current = state.scenes.find((s) => s.id === action.id)
      if (!current) return state
      const patched = { ...current, ...action.patch }
      const oldGroup = sceneGroupOf(current)
      const newGroup = sceneGroupOf(patched)

      if (oldGroup === newGroup) {
        // No group transition (the overwhelmingly common case — editing
        // card text, a title, anything that isn't a behavior/kind change)
        // — chapterId, if any, is left exactly as it was.
        return {
          ...state,
          scenes: state.scenes.map((s) => (s.id === action.id ? { ...patched, updatedAt: nowIso() } : s)),
        }
      }

      if (newGroup !== 'regular') {
        // Reclassified OUT of the regular group (e.g. a Scene retitled into
        // a Prologue or a Matter kind) — Chapters don't apply to it anymore.
        return {
          ...state,
          scenes: state.scenes.map((s) => (s.id === action.id ? { ...patched, chapterId: null, updatedAt: nowIso() } : s)),
        }
      }

      // Newly entering the regular group (e.g. a written Prologue
      // reclassified into a regular Scene) — it was never part of the
      // regular-group array order before, so it lands at the end of it
      // (same default as a freshly created scene), not wherever it
      // happened to physically sit among prologues/matter entries.
      const withoutScene = state.scenes.filter((s) => s.id !== action.id)
      const { chapterId, chapters } = ensureLastChapter(state.chapters, current.projectId)
      const updatedScene: Scene = { ...patched, chapterId, updatedAt: nowIso() }
      const insertIdx = computeInsertIndex(withoutScene, current.projectId, 'regular', 'group-end')
      const scenes = [...withoutScene]
      scenes.splice(insertIdx, 0, updatedScene)
      return { ...state, chapters, scenes }
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
          // Only a real scene target can duplicate — every Unwritten Scene
          // placeholder is its own distinct entry regardless of description.
          const exists = action.target.sceneId !== null && s.connections.some((c) => c.sceneId === action.target.sceneId)
          if (exists) return s
          const connection = { id: makeId(), ...action.target, note: action.note || undefined }
          return { ...s, connections: [...s.connections, connection], updatedAt: nowIso() }
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
                connections: s.connections.filter((c) => c.id !== action.connectionId),
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
                  c.id === action.connectionId ? { ...c, note: action.note } : c,
                ),
                updatedAt: nowIso(),
              }
            : s,
        ),
      }
    }
    case 'UPDATE_CONNECTION_TARGET': {
      // Converts an Unwritten Scene placeholder into a real scene link (or
      // vice versa) in place — same `id`, same `note`, nothing to delete
      // and recreate.
      return {
        ...state,
        scenes: state.scenes.map((s) =>
          s.id === action.sceneId
            ? {
                ...s,
                connections: s.connections.map((c) =>
                  // Rebuilt from scratch (not spread over `c`) so switching
                  // target shape never leaves a stale sceneId/projectId/
                  // unwrittenDescription behind from the previous shape.
                  c.id === action.connectionId ? { id: c.id, note: c.note, ...action.target } : c,
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
      return { ...state, meta: { ...state.meta, lastExportedAt: action.timestamp, lastExportedHash: action.hash } }
    }
    case 'ADD_CUSTOM_CARD': {
      const card: CustomCardDef = { id: makeId(), label: action.label.trim(), layout: action.layout }
      return {
        ...state,
        projects: state.projects.map((p) =>
          p.id === action.projectId
            ? { ...p, customCards: [...p.customCards, card], updatedAt: nowIso() }
            : p,
        ),
      }
    }
    case 'UPDATE_CUSTOM_CARD': {
      return {
        ...state,
        projects: state.projects.map((p) =>
          p.id === action.projectId
            ? {
                ...p,
                customCards: p.customCards.map((c) => (c.id === action.cardId ? { ...c, ...action.patch } : c)),
                updatedAt: nowIso(),
              }
            : p,
        ),
      }
    }
    case 'DELETE_CUSTOM_CARD': {
      // Only the card DEFINITION is removed — any content already written
      // under this card's id in scene.customCardContent is left untouched
      // (same "never cascade-delete underlying data" rule as hiding a card,
      // or deleting an Index entry that scene text still links to).
      return {
        ...state,
        projects: state.projects.map((p) =>
          p.id === action.projectId
            ? { ...p, customCards: p.customCards.filter((c) => c.id !== action.cardId), updatedAt: nowIso() }
            : p,
        ),
      }
    }
    case 'SET_CARD_VISIBILITY': {
      return {
        ...state,
        projects: state.projects.map((p) =>
          p.id === action.projectId
            ? {
                ...p,
                cardVisibility: { ...p.cardVisibility, [action.cardKey]: action.visible },
                updatedAt: nowIso(),
              }
            : p,
        ),
      }
    }
    case 'UPDATE_CUSTOM_CARD_CONTENT': {
      return {
        ...state,
        scenes: state.scenes.map((s) =>
          s.id === action.sceneId
            ? {
                ...s,
                customCardContent: { ...s.customCardContent, [action.cardId]: action.value },
                updatedAt: nowIso(),
              }
            : s,
        ),
      }
    }
    case 'ADD_CHAPTER': {
      const chapter: Chapter = {
        id: makeId(),
        projectId: action.projectId,
        name: (action.name ?? '').trim(),
        createdAt: nowIso(),
        updatedAt: nowIso(),
      }
      // Appended to the very end of the shared chapters array — cross-
      // project order in that array is never meaningful (every consumer
      // filters by projectId first), and appending at the absolute end
      // guarantees this is the LAST chapter once filtered to this project,
      // regardless of how other projects' chapters are interleaved.
      return { ...state, chapters: [...state.chapters, chapter] }
    }
    case 'RENAME_CHAPTER': {
      return {
        ...state,
        chapters: state.chapters.map((c) =>
          c.id === action.id ? { ...c, name: action.name.trim(), updatedAt: nowIso() } : c,
        ),
      }
    }
    case 'DELETE_CHAPTER': {
      // Enforced here, not just by the UI disabling the button — a chapter
      // can never silently take its scenes down with it.
      const hasScenes = state.scenes.some((s) => s.chapterId === action.id)
      if (hasScenes) return state
      return { ...state, chapters: state.chapters.filter((c) => c.id !== action.id) }
    }
    case 'REORDER_CHAPTER': {
      const projectChs = projectChapters(state.chapters, action.projectId)
      const idx = projectChs.findIndex((c) => c.id === action.id)
      if (idx === -1) return state
      const swapIdx = action.direction === 'up' ? idx - 1 : idx + 1
      if (swapIdx < 0 || swapIdx >= projectChs.length) return state

      const newChapterOrder = [...projectChs]
      ;[newChapterOrder[idx], newChapterOrder[swapIdx]] = [newChapterOrder[swapIdx], newChapterOrder[idx]]

      // Rewrite this project's chapters, in the new order, back into the
      // exact slots they occupied in the shared global array — every other
      // project's chapters stay exactly where they are.
      const chapterSlots: number[] = []
      state.chapters.forEach((c, i) => {
        if (c.projectId === action.projectId) chapterSlots.push(i)
      })
      const chapters = [...state.chapters]
      chapterSlots.forEach((slot, k) => {
        chapters[slot] = newChapterOrder[k]
      })

      // Keep the flat scenes array's regular-group order in sync with the
      // new chapter order — this is the invariant every other chapter/
      // scene operation relies on: a project's regular-group array order
      // always matches chapter order, one contiguous block per chapter.
      // Rebuild it by flattening this project's regular scenes chapter by
      // chapter in the NEW order (each chapter's own scenes keep their
      // existing mutual order), then write that back into the exact slots
      // this project's regular scenes occupied before.
      const currentRegularOrder = groupMembers(state.scenes, action.projectId, 'regular')
      const byChapter = new Map<string, Scene[]>()
      for (const s of currentRegularOrder) {
        const key = s.chapterId ?? ''
        const arr = byChapter.get(key) ?? []
        arr.push(s)
        byChapter.set(key, arr)
      }
      const newRegularOrder = newChapterOrder.flatMap((c) => byChapter.get(c.id) ?? [])
      // A scene with no valid chapterId at all shouldn't happen, but never
      // silently drop one from the list — keep it, at the end.
      const leftover = byChapter.get('') ?? []
      const finalRegularOrder = [...newRegularOrder, ...leftover]
      const sceneSlots: number[] = []
      state.scenes.forEach((s, i) => {
        if (s.projectId === action.projectId && sceneGroupOf(s) === 'regular') sceneSlots.push(i)
      })
      const scenes = [...state.scenes]
      sceneSlots.forEach((slot, k) => {
        scenes[slot] = finalRegularOrder[k]
      })

      return { ...state, chapters, scenes }
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
    chapters: mergeArrays(local.chapters, incoming.chapters, (c) => ({
      ...c,
      id: makeId(),
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
