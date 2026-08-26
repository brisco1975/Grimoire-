import { useLocation, useNavigate } from 'react-router-dom'

/**
 * Floating access point to the per-project Index — present on every screen
 * that has project context (everywhere except the Bookshelf, which has no
 * current project). `position: fixed` means it stays correctly placed
 * whether the phone single-page layout or the tablet/desktop two-page
 * spread is active, with no extra breakpoint handling needed here.
 */
export default function IndexFAB({ projectId }: { projectId: string }) {
  const navigate = useNavigate()
  const location = useLocation()

  const isOnIndex = location.pathname === `/project/${projectId}/index`
  if (isOnIndex) return null

  return (
    <button
      type="button"
      onClick={() => navigate(`/project/${projectId}/index`)}
      aria-label="Open Index"
      className="fixed bottom-5 right-5 z-40 h-14 w-14 rounded-full border-2 border-gold bg-accent hover:bg-accent-bright text-gold shadow-lg shadow-black/50 flex items-center justify-center transition-colors"
    >
      <span className="font-display text-xl leading-none">✦</span>
    </button>
  )
}
