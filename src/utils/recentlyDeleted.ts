import type { Chapter, DeletedItem, GrimoireDataset, IndexEntry, Scene } from '../types'

/**
 * What a Recently Deleted item's ORIGINAL id (or, for card content, its
 * original scene+card slot) currently collides with in the live dataset —
 * only ever produced when restoring-as-is would either create two live
 * items sharing one id, or (Index entries specifically) reintroduce a
 * duplicate name. `null` from findRestoreCollision means none of that
 * applies and a plain restore is safe exactly as before.
 */
export type RestoreCollision =
  | { kind: 'scene'; live: Scene }
  | { kind: 'chapter'; live: Chapter }
  | { kind: 'indexEntry'; live: IndexEntry }
  | { kind: 'cardContent'; live: { sceneId: string; cardKey: string; cardLabel: string; value: string } }

type CollisionCheckDataset = Pick<GrimoireDataset, 'scenes' | 'chapters' | 'indexEntries'>

/**
 * Checks whether restoring `item` as-is would collide with something that
 * already exists live — the only cases restoring must never do silently:
 *
 * - scene / chapter / Index entry: a live item already has the SAME id.
 *   This can only happen if something else (typically a merge-import that
 *   inserted a "new" live item, since the original was no longer present
 *   locally to conflict with) ended up reusing an id that's also sitting
 *   in Recently Deleted.
 * - Index entry, specifically: a DIFFERENT live entry in the same project
 *   already has the same NAME. Names are meant to be unique per project —
 *   restoring would silently reintroduce exactly the duplicate the
 *   collision-detection system (see LinkedTextEditor) exists to prevent.
 * - Card content: the scene's card slot already holds different, non-empty
 *   content — i.e. something was written there again since it was cleared.
 *   Restoring would silently clobber that newer text.
 *
 * Called twice for the same item: once by the UI before offering "Restore"
 * (to decide whether to show the resolution dialog), and again inside the
 * reducer when actually resolving (RESTORE_DELETED_ITEM's own safety net,
 * and RESOLVE_RESTORE_COLLISION re-deriving the current live item rather
 * than trusting whatever the UI saw when the dialog was opened).
 */
export function findRestoreCollision(dataset: CollisionCheckDataset, item: DeletedItem): RestoreCollision | null {
  if (item.kind === 'scene' && item.scene) {
    const live = dataset.scenes.find((s) => s.id === item.scene!.id)
    return live ? { kind: 'scene', live } : null
  }
  if (item.kind === 'chapter' && item.chapter) {
    const live = dataset.chapters.find((c) => c.id === item.chapter!.id)
    return live ? { kind: 'chapter', live } : null
  }
  if (item.kind === 'indexEntry' && item.indexEntry) {
    const entry = item.indexEntry
    const byId = dataset.indexEntries.find((e) => e.id === entry.id)
    if (byId) return { kind: 'indexEntry', live: byId }
    const byName = dataset.indexEntries.find(
      (e) => e.projectId === entry.projectId && e.id !== entry.id && e.name.toLowerCase() === entry.name.toLowerCase(),
    )
    return byName ? { kind: 'indexEntry', live: byName } : null
  }
  if (item.kind === 'cardContent' && item.cardContent) {
    const { sceneId, cardKey, isCustomCard, cardLabel } = item.cardContent
    const scene = dataset.scenes.find((s) => s.id === sceneId)
    if (!scene) return null
    const currentValue = isCustomCard
      ? (scene.customCardContent[cardKey] ?? '')
      : ((scene as unknown as Record<string, string>)[cardKey] ?? '')
    if (!currentValue.trim()) return null
    return { kind: 'cardContent', live: { sceneId, cardKey, cardLabel, value: currentValue } }
  }
  return null
}
