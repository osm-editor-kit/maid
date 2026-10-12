/** The most features a click lists at one place: a crowded place does not make a long menu */
export const PICK_LIMIT = 20

/** One feature at a place: its id, its layer priority (lower is on top: vertex 0 ... area 3), its size */
export type PickCandidate = { id: string; priority: number; size: number }

/**
 * The features at a place in the order a click lists them. `picked` (what `pick` returns) comes
 * first, so that a click still selects what it always did. The rest follow by priority, then by
 * size, smaller first: what is on top and harder to hit comes first. Ties keep their order.
 */
export function orderPicks(
  candidates: readonly PickCandidate[],
  picked: string | null,
  limit = PICK_LIMIT,
): string[] {
  const sorted = candidates
    .map((candidate, index) => ({ ...candidate, index }))
    .sort((a, b) => a.priority - b.priority || a.size - b.size || a.index - b.index)
    .map((candidate) => candidate.id)
  const ordered =
    picked !== null && sorted.includes(picked)
      ? [picked, ...sorted.filter((id) => id !== picked)]
      : sorted
  return ordered.slice(0, limit)
}

/** Metres per degree of latitude, roughly; enough to order sizes, not to measure them */
const METRES_PER_DEGREE = 111_320

/**
 * The size of a way for ordering picks: the area in square metres of a closed outline that is an
 * area, else the length in metres of the line. Flat-earth and rough: it only has to put the smaller
 * one first. Points are [lon, lat]; nothing is measured for fewer than two of them.
 */
export function extentOf(points: readonly (readonly [number, number])[], area: boolean): number {
  if (points.length < 2) return 0
  if (!area) {
    let length = 0
    for (let i = 1; i < points.length; i++) {
      const [lon1, lat1] = points[i - 1]!
      const [lon2, lat2] = points[i]!
      const cos = Math.cos(((lat1 + lat2) / 2) * (Math.PI / 180))
      length += Math.hypot((lon2 - lon1) * cos, lat2 - lat1) * METRES_PER_DEGREE
    }
    return length
  }
  // shoelace formula on a flat projection around the outline's middle latitude
  const meanLat = points.reduce((sum, p) => sum + p[1], 0) / points.length
  const cos = Math.cos((meanLat * Math.PI) / 180)
  let twice = 0
  for (let i = 1; i < points.length; i++) {
    const [lon1, lat1] = points[i - 1]!
    const [lon2, lat2] = points[i]!
    twice += lon1 * cos * lat2 - lon2 * cos * lat1
  }
  return (Math.abs(twice) / 2) * METRES_PER_DEGREE * METRES_PER_DEGREE
}
