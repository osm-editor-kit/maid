/** Which lists of the account the cleanup offers to delete. */
import { type ListEntry, staleLists } from '@osm-editor-kit/maid-osm-prefs'

/** Days without a save after which a list is offered for deletion */
export const STALE_DAYS = 30

/**
 * The lists nobody has saved for 30 days, except the list that is open here (never offered). Order: oldest first.
 * Nothing is deleted by this: the person decides in the dialog.
 */
export function cleanupOffers(
  entries: readonly ListEntry[],
  loadedListKey: string | undefined,
  nowSeconds: number,
): ListEntry[] {
  return staleLists(entries, nowSeconds, STALE_DAYS)
    .filter((entry) => entry.listKey !== loadedListKey)
    .toSorted((a, b) => a.meta.u - b.meta.u)
}
