/**
 * Small, fast, non-cryptographic string hash (djb2 variant) — used only to
 * cheaply detect "has the exported content changed since last time", not
 * for anything security-sensitive. Deterministic across runs/devices since
 * it just walks char codes.
 */
export function hashString(input: string): string {
  let h1 = 5381
  let h2 = 52711
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i)
    h1 = (h1 * 33) ^ c
    h2 = (h2 * 33) ^ c
  }
  return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36)
}
