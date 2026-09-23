import type { Chapter, Scene } from '../types'

/** A project's chapters, in chapter order (array order = display/number order, like every other ordered list in this schema). */
export function projectChapters(chapters: Chapter[], projectId: string): Chapter[] {
  return chapters.filter((c) => c.projectId === projectId)
}

/** Live-computed "Chapter N" number — never stored, purely this chapter's index among its project's chapters. */
export function chapterNumber(chapters: Chapter[], projectId: string, chapterId: string): number {
  const idx = projectChapters(chapters, projectId).findIndex((c) => c.id === chapterId)
  return idx === -1 ? projectChapters(chapters, projectId).length + 1 : idx + 1
}

/** "Chapter 1" (unnamed) / "Chapter 2 — The Beginning" (named). */
export function chapterHeading(chapters: Chapter[], projectId: string, chapter: Chapter): string {
  const n = chapterNumber(chapters, projectId, chapter.id)
  const name = chapter.name.trim()
  return name ? `Chapter ${n} — ${name}` : `Chapter ${n}`
}

export interface ChapterGroup {
  chapter: Chapter
  number: number
  scenes: Scene[]
}

/**
 * Buckets a project's already-ordered regular-group scenes (pass the exact
 * result of `groupMembers(scenes, projectId, 'regular')` — this never
 * re-derives that order) into their chapters, in chapter order. Any scene
 * whose chapterId doesn't match a live chapter (e.g. its chapter was
 * deleted through data corruption or a bad hand-edited import) is returned
 * separately as `orphans` instead of being silently dropped from the view.
 */
export function groupScenesByChapter(
  regularScenesInOrder: Scene[],
  chapters: Chapter[],
  projectId: string,
): { groups: ChapterGroup[]; orphans: Scene[] } {
  const chaptersForProject = projectChapters(chapters, projectId)
  const byChapter = new Map<string, Scene[]>(chaptersForProject.map((c) => [c.id, []]))
  const orphans: Scene[] = []
  for (const s of regularScenesInOrder) {
    const bucket = s.chapterId ? byChapter.get(s.chapterId) : undefined
    if (bucket) bucket.push(s)
    else orphans.push(s)
  }
  const groups = chaptersForProject.map((chapter, i) => ({
    chapter,
    number: i + 1,
    scenes: byChapter.get(chapter.id) ?? [],
  }))
  return { groups, orphans }
}
