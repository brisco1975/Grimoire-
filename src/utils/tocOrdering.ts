import type { Scene } from '../types'

/**
 * Five fixed buckets a Table of Contents entry can fall into. Display order
 * is always this sequence, regardless of how entries were created or
 * physically ordered in storage:
 *   front matter → prologues → the regular numbered sequence → epilogues → back matter
 *
 * Position NUMBERS/MARKERS (below) are always derived live from an entry's
 * index within its bucket — never stored, never influenced by title text.
 */
export type TocGroup = 'matter-start' | 'prologue' | 'regular' | 'epilogue' | 'matter-end'

const GROUP_SEQUENCE: TocGroup[] = ['matter-start', 'prologue', 'regular', 'epilogue', 'matter-end']

export function sceneGroupOf(scene: Scene): TocGroup {
  if (scene.behavior === 'matter') {
    return scene.matterPosition === 'start' ? 'matter-start' : 'matter-end'
  }
  if (scene.kind === 'prologue') return 'prologue'
  if (scene.kind === 'epilogue') return 'epilogue'
  return 'regular'
}

/**
 * Relative order within a group/project is whatever order the scenes
 * currently appear in the passed-in array — the reducer maintains that
 * array order directly via splice/swap so no separate numeric "order"
 * field is needed. `scenes` may be the full dataset or already
 * project-filtered; both work since this filters by projectId itself.
 */
export function orderedProjectScenes(scenes: Scene[], projectId: string): Scene[] {
  const buckets: Record<TocGroup, Scene[]> = {
    'matter-start': [],
    prologue: [],
    regular: [],
    epilogue: [],
    'matter-end': [],
  }
  for (const s of scenes) {
    if (s.projectId !== projectId) continue
    buckets[sceneGroupOf(s)].push(s)
  }
  return GROUP_SEQUENCE.flatMap((g) => buckets[g])
}

export function groupMembers(scenes: Scene[], projectId: string, group: TocGroup): Scene[] {
  return scenes.filter((s) => s.projectId === projectId && sceneGroupOf(s) === group)
}

/**
 * Live-computed position marker: "3" for a regular entry, "PR1"/"PR2" for
 * prologues, "EP1"/"EP2" for epilogues, or null for Matter-type entries
 * (which never show a marker). Purely a function of current list order —
 * never persisted, never affected by title text.
 */
export function sceneMarker(scenes: Scene[], scene: Scene): string | null {
  if (scene.behavior === 'matter') return null
  const group = sceneGroupOf(scene)
  const siblings = groupMembers(scenes, scene.projectId, group)
  const idx = siblings.findIndex((s) => s.id === scene.id)
  const pos = idx === -1 ? siblings.length + 1 : idx + 1
  if (group === 'prologue') return `PR${pos}`
  if (group === 'epilogue') return `EP${pos}`
  return `${pos}`
}

/** "3 — The Academy" / "PR1 — A Storm Gathers" / "3" (untitled) / "The Dedication" (matter, no marker). */
export function sceneHeading(scenes: Scene[], scene: Scene): string {
  const marker = sceneMarker(scenes, scene)
  const title = scene.title.trim()
  if (!marker) return title || '(untitled)'
  return title ? `${marker} — ${title}` : marker
}

export type InsertPosition = 'group-start' | 'group-end' | { after: string }

/** Where in the flat scenes array a new entry should be spliced so it lands correctly within its group. */
export function computeInsertIndex(
  scenes: Scene[],
  projectId: string,
  group: TocGroup,
  position: InsertPosition,
): number {
  if (typeof position === 'object') {
    const idx = scenes.findIndex((s) => s.id === position.after)
    return idx === -1 ? scenes.length : idx + 1
  }
  const members = scenes
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.projectId === projectId && sceneGroupOf(s) === group)
  if (position === 'group-start') {
    return members.length ? members[0].i : scenes.length
  }
  // group-end
  return members.length ? members[members.length - 1].i + 1 : scenes.length
}

/** Swaps two scenes' positions in the flat array — used for Move Up/Down within a group. */
export function swapScenePositions(scenes: Scene[], idA: string, idB: string): Scene[] {
  const idxA = scenes.findIndex((s) => s.id === idA)
  const idxB = scenes.findIndex((s) => s.id === idB)
  if (idxA === -1 || idxB === -1) return scenes
  const next = [...scenes]
  const tmp = next[idxA]
  next[idxA] = next[idxB]
  next[idxB] = tmp
  return next
}

export const GROUP_LABELS: Record<TocGroup, string> = {
  'matter-start': 'Front Matter',
  prologue: 'Prologue',
  regular: 'Chapters',
  epilogue: 'Epilogue',
  'matter-end': 'Back Matter',
}
