import { useNavigate } from 'react-router-dom'

export default function AppHeader({
  title,
  onBack,
  showSettings = true,
}: {
  title: string
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
      <h1 className="font-display text-gold text-xl sm:text-2xl m-0 truncate flex-1">{title}</h1>
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
