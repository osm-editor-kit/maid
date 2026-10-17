import type { SignType } from '@osm-traffic-signs/converter'

/**
 * "Never use with this sign": a candidate is excluded when an existing sign lists it in
 * `compatibility.incompatibleModifiers`, or when the candidate lists an existing sign (the data is not symmetric).
 * `existing` are the catalogue signs of the rows; rows the catalogue does not know are left out by the caller.
 */
export function isExcludedByCompatibility(
  candidate: SignType,
  existing: readonly SignType[],
): boolean {
  const existingIds = new Set<string>()
  const disallowedIds = new Set<string>()
  for (const sign of existing) {
    if (!sign.signId) continue
    existingIds.add(sign.signId)
    for (const id of sign.compatibility?.incompatibleModifiers ?? []) disallowedIds.add(id)
  }
  if (candidate.signId && disallowedIds.has(candidate.signId)) return true
  return (candidate.compatibility?.incompatibleModifiers ?? []).some((id) => existingIds.has(id))
}
