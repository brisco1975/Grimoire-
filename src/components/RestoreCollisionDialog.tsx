import Modal from './Modal'

export interface CollisionSidePreview {
  title: string
  subtitle: string
  preview: string
  /** Shown only for the live side — the deleted side's identity is already implied by being in Recently Deleted. */
  idLabel?: string
}

/**
 * Shown instead of silently restoring OR silently refusing, whenever
 * restoring a Recently Deleted item would otherwise create two live items
 * sharing one id (or, for an Index entry, reintroduce a duplicate name) —
 * see utils/recentlyDeleted.findRestoreCollision. Always requires an
 * explicit choice; never auto-picks an outcome.
 */
export default function RestoreCollisionDialog({
  open,
  deleted,
  live,
  onSwap,
  onDiscard,
  onCancel,
}: {
  open: boolean
  deleted: CollisionSidePreview
  live: CollisionSidePreview
  /** Restore the deleted item, moving the current live item into Recently Deleted in its place. */
  onSwap: () => void
  /** Keep the live item as-is; delete the trashed item forever (not re-added to Recently Deleted). */
  onDiscard: () => void
  onCancel: () => void
}) {
  return (
    <Modal open={open} onClose={onCancel} title="Can't restore — already in use" wide>
      <p className="text-parchment-muted text-sm mb-4">
        Something else now exists where this would go. Nothing happens until you choose one of the options below.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
        <div className="rounded border border-inset bg-canvas p-3 flex flex-col gap-1">
          <div className="text-gold-dim text-xs uppercase tracking-wide">In Recently Deleted</div>
          <div className="text-parchment font-heading text-sm">{deleted.title}</div>
          <div className="text-parchment-muted text-xs">{deleted.subtitle}</div>
          {deleted.preview && <div className="text-parchment-muted text-sm mt-1">{deleted.preview}</div>}
        </div>
        <div className="rounded border border-inset bg-canvas p-3 flex flex-col gap-1">
          <div className="text-gold-dim text-xs uppercase tracking-wide">Currently here</div>
          <div className="text-parchment font-heading text-sm">{live.title}</div>
          <div className="text-parchment-muted text-xs">
            {live.subtitle}
            {live.idLabel ? ` · ${live.idLabel}` : ''}
          </div>
          {live.preview && <div className="text-parchment-muted text-sm mt-1">{live.preview}</div>}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={onSwap}
          className="px-4 py-2.5 rounded bg-accent hover:bg-accent-bright text-parchment font-heading tracking-wide transition-colors text-left"
        >
          Restore the deleted item — move the current one into Recently Deleted instead
        </button>
        <button
          type="button"
          onClick={onDiscard}
          className="px-4 py-2.5 rounded border border-accent-bright text-accent-bright hover:bg-accent-bright/10 transition-colors text-left"
        >
          Keep the current item — delete the one in Recently Deleted forever
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2.5 rounded border border-inset text-parchment-muted hover:text-parchment hover:border-gold-dim transition-colors text-left"
        >
          Cancel — change nothing
        </button>
      </div>
    </Modal>
  )
}
