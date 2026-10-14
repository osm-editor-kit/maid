/**
 * The FROM road that the section starts with, so that the turns show at once and there is no "nothing chosen" state.
 * iD leaves the choice to the person; here the most important arm is picked: the highest road class, then a road that
 * already has restrictions (its turns are the ones to look at), then the longest. A link counts as the road it leads
 * from, after that road. The person can pick another road. Headless and pure.
 */
export type FromCandidate = {
  id: EntityID
  /** The highway tag of the road: `primary`, `residential_link`, ... */
  highway: string | undefined
  /** Whether a direct restriction starts on this road */
  restricted: boolean
  /** Metres of the road within the search distance */
  length: number
}

/** iD's order of highway classes, the most important first. Other highways come after them. */
const CLASS_ORDER: readonly string[] = [
  'motorway',
  'trunk',
  'primary',
  'secondary',
  'tertiary',
  'unclassified',
  'residential',
  'living_street',
  'road',
  'service',
]

/** A smaller rank is more important: the class, and a link after its road of the same class */
export function roadRank(highway: string | undefined): number {
  const isLink = (highway ?? '').endsWith('_link')
  const base = isLink ? (highway ?? '').slice(0, -'_link'.length) : (highway ?? '')
  const index = CLASS_ORDER.indexOf(base)
  const classRank = index === -1 ? CLASS_ORDER.length : index
  return classRank * 2 + (isLink ? 1 : 0)
}

/** Whether `a` is picked before `b`. Equal roads keep their order: the first candidate wins. */
function pickedBefore(a: FromCandidate, b: FromCandidate): boolean {
  const rankA = roadRank(a.highway)
  const rankB = roadRank(b.highway)
  if (rankA !== rankB) return rankA < rankB
  if (a.restricted !== b.restricted) return a.restricted
  return a.length > b.length
}

/** The candidate to start with, or undefined when there is none (a junction with no road that turns can start on) */
export function pickFromRoad(candidates: readonly FromCandidate[]): EntityID | undefined {
  let best: FromCandidate | undefined
  for (const candidate of candidates) {
    if (best === undefined || pickedBefore(candidate, best)) best = candidate
  }
  return best?.id
}
