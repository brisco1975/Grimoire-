import { useEffect, useState } from 'react'

/**
 * 768px matches Tailwind's `md` breakpoint — roughly tablet-portrait and up
 * (iPad portrait is exactly 768px; an unfolded Z Fold-class device's inner
 * screen sits close by). Below it: phone, single page, page-turn nav.
 * At/above it: two-page spread. This is a genuine behavioral fork (see
 * TableOfContents/ScenePage), not just a CSS reflow, so it's read once via
 * matchMedia rather than handled with responsive utility classes.
 */
const WIDE_QUERY = '(min-width: 768px)'

export function useIsWide(): boolean {
  const [isWide, setIsWide] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(WIDE_QUERY).matches : false,
  )

  useEffect(() => {
    const mql = window.matchMedia(WIDE_QUERY)
    const handler = (e: MediaQueryListEvent) => setIsWide(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  return isWide
}
