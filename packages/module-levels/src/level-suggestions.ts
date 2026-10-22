import { levelsOf } from '@osm-editor-kit/maid-levels'

/** The reason of the edited level's offer: the menu shows it in the current look */
export const EDITED_REASON = 'edited level'

/**
 * The levels offered for a feature that has no level yet (LevelMenu.tsx). Pure: the engine's data comes in through
 * the input, so the rules can be tested without a map.
 */

/** Whether a point lies inside a ring (ray casting); the ring may or may not repeat its first point */
export function pointInPolygon(
  point: [number, number],
  ring: readonly (readonly [number, number])[],
): boolean {
  const [x, y] = point
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]
    const b = ring[j]
    if (!a || !b) continue
    const [xi, yi] = a
    const [xj, yj] = b
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

export type LevelSuggestion = {
  value: string
  reasons: string[]
  ids: string[]
  /** For a connector that joins two levels (`0;1`): whether its way goes up or down from the first level */
  incline?: 'up' | 'down'
}

/** What the connected ways are, for the reason text: singular and plural */
const KIND_NAMES = {
  corridor: ['corridor', 'corridors'],
  step: ['step', 'steps'],
  path: ['path', 'paths'],
  room: ['room', 'rooms'],
  feature: ['feature', 'features'],
} as const
type Kind = keyof typeof KIND_NAMES

/**
 * The level most of the other ways at a node share, with those ways. A way on several levels (`repeat_on`, a range)
 * does not say which level the node is on, so it does not count.
 */
function levelAt(
  node: string,
  input: Pick<Parameters<typeof suggestLevels>[0], 'id' | 'waysOfNode' | 'tagsOf'>,
): { level: number; ids: string[] } | undefined {
  const byLevel = new Map<number, string[]>()
  for (const way of input.waysOfNode(node)) {
    if (way === input.id) continue
    const tags = input.tagsOf(way)
    if (!tags) continue
    const { levels } = levelsOf(tags)
    const level = levels[0]
    if (levels.length !== 1 || level === undefined) continue
    const ids = byLevel.get(level) ?? []
    ids.push(way)
    byLevel.set(level, ids)
  }
  // on a tie the level met first wins
  let best: { level: number; ids: string[] } | undefined
  for (const [level, ids] of byLevel)
    if (!best || ids.length > best.ids.length) best = { level, ids }
  return best
}

function kindOf(tags: Readonly<Record<string, string>>): Kind {
  if (tags.indoor === 'corridor') return 'corridor'
  if (tags.highway === 'steps') return 'step'
  if (tags.highway === 'footway' || tags.highway === 'path') return 'path'
  if (tags.indoor === 'room') return 'room'
  return 'feature'
}

/**
 * Whether a way connects two levels: steps, an escalator or moving walkway (`conveying`), a ramp, a footway or path
 * with an `incline`, indoor or other stairs. A corridor is not one.
 */
export function isConnector(tags: Readonly<Record<string, string>>): boolean {
  if (tags.highway === 'steps') return true
  if (tags.conveying !== undefined) return true
  if (tags.ramp === 'yes') return true
  if (tags.incline !== undefined && (tags.highway === 'footway' || tags.highway === 'path'))
    return true
  return tags.indoor === 'stairs' || tags.stairs === 'yes'
}

/** The incline of a connector from the first level to the last: OSM's `incline` follows the way's direction */
export function inclineOf(firstLevel: number, lastLevel: number): 'up' | 'down' {
  return firstLevel < lastLevel ? 'up' : 'down'
}

/**
 * Suggested levels, the edited level first, then the levels of the ways connected through the feature's nodes (most
 * ways first), then the rooms and areas the feature lies in. A value that several sources give is one suggestion
 * with all their reasons, in that order.
 */
export function suggestLevels(input: {
  id: string
  nodeIds: readonly string[]
  edited: number | null
  waysOfNode: (node: string) => readonly string[]
  tagsOf: (id: string) => Readonly<Record<string, string>> | undefined
  enclosing: readonly { id: string; value: string; name: string }[]
}): LevelSuggestion[] {
  const suggestions = new Map<string, LevelSuggestion>()
  const add = (
    value: string,
    reason: string,
    ids: readonly string[] = [],
  ): LevelSuggestion | undefined => {
    if (value.trim() === '') return undefined
    let suggestion = suggestions.get(value)
    if (!suggestion) {
      suggestion = { value, reasons: [], ids: [] }
      suggestions.set(value, suggestion)
    }
    suggestion.reasons.push(reason)
    for (const id of ids) if (!suggestion.ids.includes(id)) suggestion.ids.push(id)
    return suggestion
  }

  if (input.edited !== null) add(String(input.edited), EDITED_REASON)

  // a connector (steps, a ramp, an escalator) joins the level at its first end and the level at its last end
  const own = input.tagsOf(input.id)
  if (own && isConnector(own) && input.nodeIds.length >= 2) {
    const first = input.nodeIds[0]
    const last = input.nodeIds.at(-1)
    const a = first === undefined ? undefined : levelAt(first, input)
    const b = last === undefined ? undefined : levelAt(last, input)
    if (a && b && a.level !== b.level) {
      const pair = add(
        `${Math.min(a.level, b.level)};${Math.max(a.level, b.level)}`,
        `connects ${a.level} and ${b.level}`,
        [...a.ids, ...b.ids],
      )
      if (pair) pair.incline ??= inclineOf(a.level, b.level)
    }
  }

  // the ways through the feature's nodes, each once (a way can share two nodes), grouped by their level
  const seen = new Set<string>()
  const groups = new Map<string, { ids: string[]; kinds: Kind[] }>()
  for (const node of input.nodeIds) {
    for (const way of input.waysOfNode(node)) {
      if (way === input.id || seen.has(way)) continue
      seen.add(way)
      const tags = input.tagsOf(way)
      const level = tags?.level
      if (!tags || level === undefined || level.trim() === '') continue
      let group = groups.get(level)
      if (!group) {
        group = { ids: [], kinds: [] }
        groups.set(level, group)
      }
      group.ids.push(way)
      group.kinds.push(kindOf(tags))
    }
  }
  const byCount = [...groups].sort((a, b) => b[1].ids.length - a[1].ids.length)
  for (const [value, group] of byCount) {
    // the most common kind of the group; on a tie the one met first
    const counts = new Map<Kind, number>()
    for (const kind of group.kinds) counts.set(kind, (counts.get(kind) ?? 0) + 1)
    let kind: Kind = 'feature'
    let best = 0
    for (const [candidate, count] of counts) {
      if (count > best) {
        kind = candidate
        best = count
      }
    }
    const n = group.ids.length
    const [singular, plural] = KIND_NAMES[kind]
    add(value, `connected: ${n} ${n === 1 ? singular : plural}`, group.ids)
  }

  for (const room of input.enclosing) {
    if (room.id === input.id) continue
    add(room.value, `inside: ${room.name}`, [room.id])
  }

  return [...suggestions.values()]
}

/** The reason of a level that is only in view: nothing next to the feature is on it */
export const IN_VIEW_REASON = 'in view'

/**
 * Every level to offer, highest first, as the level picker lists them: the suggestions (the edited level, the levels
 * around the feature) and every other level of the features in view, because what is around the feature can be wrong
 * or missing (a sculpture in a room on level 0 that hangs on level 1). A list such as "0;1" sorts by its first level.
 */
export function withLevelsInView(
  suggestions: readonly LevelSuggestion[],
  idsInView: Iterable<string | number | undefined>,
  levelsOf: (id: string) => readonly number[],
): LevelSuggestion[] {
  const levels = new Set<number>()
  for (const id of idsInView)
    if (typeof id === 'string') for (const level of levelsOf(id)) levels.add(level)
  const known = new Set(suggestions.map((suggestion) => suggestion.value))
  const more = [...levels]
    .map(String)
    .filter((value) => !known.has(value))
    .map((value): LevelSuggestion => ({ value, reasons: [IN_VIEW_REASON], ids: [] }))
  const first = (value: string) => Number(value.split(';')[0])
  return [...suggestions, ...more].sort((a, b) => first(b.value) - first(a.value))
}

/** True when something around the feature suggests the level (a connected way, a room it is in): shown in bold */
export function isRecommended(suggestion: LevelSuggestion): boolean {
  return suggestion.reasons.some((reason) => reason !== EDITED_REASON && reason !== IN_VIEW_REASON)
}
