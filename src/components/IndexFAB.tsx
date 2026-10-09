import { useLocation, useNavigate } from 'react-router-dom'

/**
 * Floating access point to the per-project Index — present on every screen
 * that has project context (everywhere except the Bookshelf, which has no
 * current project). `position: fixed` means it stays correctly placed
 * whether the phone single-page layout or the tablet/desktop two-page
 * spread is active, with no extra breakpoint handling needed here.
 *
 * Always a normal push, one level above whichever screen it was tapped
 * from (Table of Contents or a Scene Page) — so backing out of the Index
 * list (arrow tap or the system back gesture) always lands back on that
 * same screen, never collapsing past it. Opening an entry from the list
 * adds one more push of its own (see IndexScreen's openEntryFromList), so
 * backing all the way out from an open entry takes exactly two steps:
 * entry → list → wherever the FAB was tapped from.
 */
export default function IndexFAB({ projectId }: { projectId: string }) {
  const navigate = useNavigate()
  const location = useLocation()

  const isOnIndex = location.pathname === `/project/${projectId}/index`
  if (isOnIndex) return null

  // Size and offset read from the same --fab-size/--fab-offset tokens that
  // .fab-scroll-clearance (see index.css) derives its padding from, so a
  // future resize of this button can't silently leave scrollable content
  // clearing the wrong amount of space.
  return (
    <button
      type="button"
      onClick={() => navigate(`/project/${projectId}/index`)}
      aria-label="Open Index"
      style={{
        height: 'var(--fab-size)',
        width: 'var(--fab-size)',
        bottom: 'var(--fab-offset)',
        right: 'var(--fab-offset)',
      }}
      className="fixed z-40 rounded-full border-2 border-gold bg-accent hover:bg-accent-bright text-gold shadow-lg shadow-black/50 flex items-center justify-center transition-colors"
    >
      <span className="font-display text-xl leading-none">✦</span>
    </button>
  )
}
