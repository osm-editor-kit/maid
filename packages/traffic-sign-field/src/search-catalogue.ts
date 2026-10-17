import type { SignType } from '@osm-traffic-signs/converter'

export type SearchCatalogueOptions = {
  /** Signs for which this returns true are hidden (incompatible combinations) */
  exclude?: (sign: SignType) => boolean
}

/** "Häufig verwendet": any focus view of the sign is marked 'highlight' */
export function isPromotedSign(sign: SignType): boolean {
  const focus = sign.catalogue?.focus
  return focus ? Object.values(focus).includes('highlight') : false
}

/**
 * Lower is better, null is no match. A mapper who knows the code gets it first (id, then name prefix, then a
 * word, then anywhere in the name, then in the id, then in the description). Port of the d3 field's searchCatalogue.
 */
function scoreSign(sign: SignType, q: string): number | null {
  const id = (sign.signId ?? '').toLowerCase()
  const code = sign.osmValuePart.toLowerCase()
  if (id === q || code === q) return 0
  if (id.startsWith(q) || code.startsWith(q)) return 1

  const names = [sign.name, sign.descriptiveName]
    .filter((name): name is string => !!name)
    .map((name) => name.toLowerCase())
  if (names.some((name) => name.startsWith(q))) return 2
  if (names.some((name) => name.split(/\s+/).some((word) => word.startsWith(q)))) return 3
  if (names.some((name) => name.includes(q))) return 4

  if (id.includes(q) || code.includes(q)) return 5
  if (sign.description?.toLowerCase().includes(q)) return 6
  return null
}

/**
 * Empty query: the whole catalogue, promoted signs first, in catalogue order. With a query: the matches ranked by
 * score, promoted first among equals (a stable sort keeps the catalogue order after that). No cap.
 */
export function searchCatalogue(
  catalogue: readonly SignType[],
  query: string,
  options?: SearchCatalogueOptions,
): SignType[] {
  const exclude = options?.exclude
  const candidates = exclude ? catalogue.filter((sign) => !exclude(sign)) : [...catalogue]

  const q = query.trim().toLowerCase()
  if (!q) {
    return candidates
      .map((sign, index) => ({ sign, index, promoted: isPromotedSign(sign) }))
      .sort((a, b) => Number(b.promoted) - Number(a.promoted) || a.index - b.index)
      .map((entry) => entry.sign)
  }

  const scored: { sign: SignType; score: number; promoted: boolean }[] = []
  for (const sign of candidates) {
    const score = scoreSign(sign, q)
    if (score !== null) scored.push({ sign, score, promoted: isPromotedSign(sign) })
  }
  return scored
    .sort((a, b) => a.score - b.score || Number(b.promoted) - Number(a.promoted))
    .map((entry) => entry.sign)
}
