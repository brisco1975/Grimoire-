import { useLocation, useNavigate } from 'react-router-dom'

/**
 * Floating access point to the per-project Index — present on every screen
 * that has project context (everywhere except the Bookshelf, which has no
 * current project). `position: fixed` means it stays correctly placed
 * whether the phone single-page layout or the tablet/desktop two-page
 * spread is active, with no extra breakpoint handling needed here.
 *
 * Index's place in the back-navigation hierarchy is always directly above
 * the Table of Contents, regardless of which screen the FAB was tapped
 * from. From the Table of Contents itself that's a normal push (Index is
 * one level deeper). From a Scene Page — which is ALSO one push above the
 * Table of Contents — reaching Index the same way would stack a second
 * entry on top of Scene's, so the Scene Page usage passes `replace`: it
 * swaps the Scene Page's entry for Index's, landing Index in the exact
 * same spot in history that the Table of Contents occupies one level
 * down — one pop (arrow tap, "Done", or the system back gesture) out of
 * Index always reaches the Table of Contents, never the Scene Page.
 */
export default function IndexFAB({ projectId, replace = false }: { projectId: string; replace?: boolean }) {
  const navigate = useNavigate()
  const location = useLocation()

  const isOnIndex = location.pathname === `/project/${projectId}/index`
  if (isOnIndex) return null

  return (
    <button
      type="button"
      onClick={() => navigate(`/project/${projectId}/index`, { replace })}
      aria-label="Open Index"
      className="fixed bottom-5 right-5 z-40 h-14 w-14 rounded-full border-2 border-gold bg-accent hover:bg-accent-bright text-gold shadow-lg shadow-black/50 flex items-center justify-center transition-colors"
    >
      <span className="font-display text-xl leading-none">✦</span>
    </button>
  )
}
