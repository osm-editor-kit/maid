// A selection made from the route overview: the relation column then leaves its scroll alone, so the diagram the
// person reads stays in view instead of jumping to the member's row in the groups below it.

let fromOverview: string | null = null

/** Called by the overview right before it selects `id` */
export function markSelectedFromOverview(id: string) {
  fromOverview = id
}

/** True once when `id` was selected from the overview; the mark is cleared either way (also by a selection of nothing) */
export function takeSelectedFromOverview(id: string | null): boolean {
  const was = id !== null && fromOverview === id
  fromOverview = null
  return was
}
