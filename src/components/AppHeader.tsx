import { useNavigate } from 'react-router-dom'

export default function AppHeader({
  title,
  subtitle,
  onBack,
  showSettings = true,
}: {
  title: string
  /** A short, fixed label shown on its own line below the title (e.g.
   * "Index", "Cards") — for a screen whose title is itself a variable,
   * possibly-long project name that a suffix like "Project — Index" would
   * risk truncating away entirely. Never truncates; the title above it
   * still truncates on its own if the project name itself is too long. */
  subtitle?: string
  onBack?: () => void
  showSettings?: boolean
}) {
  const navigate = useNavigate()

  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-inset bg-canvas/95 backdrop-blur px-4 py-3">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="shrink-0 text-gold text-2xl leading-none px-1 py-1 hover:text-parchment transition-colors"
        >
          ‹
        </button>
      )}
      <div className="flex-1 min-w-0">
        <h1 className="font-display text-gold text-xl sm:text-2xl m-0 truncate">{title}</h1>
        {subtitle && <div className="font-display text-gold text-lg sm:text-xl leading-tight">{subtitle}</div>}
      </div>
      {showSettings && (
        <button
          type="button"
          onClick={() => navigate('/settings')}
          aria-label="Settings"
          className="shrink-0 text-gold text-xl leading-none px-1 py-1 hover:text-parchment transition-colors"
        >
          ⚙
        </button>
      )}
    </header>
  )
}
