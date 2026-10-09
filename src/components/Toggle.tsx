/**
 * Shared ON/OFF switch — the one toggle control for the whole app (card
 * visibility on the Cards screen, built-in and custom alike, and anywhere
 * else a boolean setting needs one). A single definition here, rather than
 * each screen rolling its own, is what keeps every switch in the app
 * visually identical and correctly contained by construction.
 *
 * The knob is positioned with an explicit `left` anchor plus a `translate`
 * for the ON offset — not translate-from-an-implicit-static-position (the
 * previous approach) — so its resting position never depends on how the
 * browser resolves an absolutely-positioned child with no `left`/`right`
 * set, which is what let the knob render outside the track's right edge in
 * the ON state. Track and knob sizes are fixed and shared by every caller,
 * so they can never drift apart between rows.
 */
export default function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean
  onChange: (next: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative shrink-0 h-6 w-11 rounded-full border transition-colors ${
        on ? 'bg-accent border-accent' : 'bg-surface-2 border-inset'
      }`}
    >
      <span
        className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-parchment transition-transform ${
          on ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  )
}
