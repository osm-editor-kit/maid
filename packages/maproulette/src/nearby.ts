/** The challenges near you, from the tasks in view */
import { distanceMeters } from './geo.ts'
import { isOpen } from './status.ts'

/** What a row needs of a task of a box request */
export type NearbyTask = {
  id: string | number
  parentId: string | number
  point?: { lng: number; lat: number } | null
  loc?: readonly [number, number] | null
  status?: number | null
}

/** One challenge in the list */
export type NearbyChallenge = {
  challengeId: string
  name?: string
  openCount: number
  /** Metres from the centre to the nearest open task of the challenge */
  nearestDistance: number
}

/**
 * Group tasks by challenge (`parentId`) into rows sorted by the distance of the nearest open task to `centre`
 * ([lng, lat]); equal distances sort by challenge id. Only open tasks count (a challenge without one has no row).
 * `names` maps a challenge id to its name, when the caller has loaded it.
 */
export function nearbyChallenges(
  tasks: readonly NearbyTask[],
  centre: readonly [number, number],
  names: Readonly<Record<string, string | undefined>> = {},
): NearbyChallenge[] {
  const rows = new Map<string, NearbyChallenge>()
  for (const task of tasks) {
    if (!isOpen(task)) continue
    const loc = task.loc ?? (task.point ? ([task.point.lng, task.point.lat] as const) : null)
    if (!loc) continue
    const challengeId = String(task.parentId)
    const distance = distanceMeters(centre, loc)
    const row = rows.get(challengeId)
    if (row) {
      row.openCount += 1
      row.nearestDistance = Math.min(row.nearestDistance, distance)
    } else {
      const name = names[challengeId]
      rows.set(challengeId, {
        challengeId,
        ...(name ? { name } : {}),
        openCount: 1,
        nearestDistance: distance,
      })
    }
  }
  return [...rows.values()].sort(
    (a, b) =>
      a.nearestDistance - b.nearestDistance ||
      a.challengeId.localeCompare(b.challengeId, 'en', { numeric: true }),
  )
}
