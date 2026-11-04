/**
 * Deterministic task files for tests and benchmarks. `generateTasks` cuts tasks from an OSM fixture (its ways and
 * tagged nodes); `syntheticTasks` makes tasks with no OSM reference, for size tests. The same seed gives the same
 * output on every run and every machine. No network.
 */
import type { Geometry, Task, TaskFile, TaskListInfo, TaskOption } from './schema.ts'

/** An element of an OSM fixture, as `fixtures/*.json.gz` holds it */
export type FixtureElement = {
  type: 'node' | 'way' | 'relation'
  id: number
  lat?: number
  lon?: number
  nodes?: number[]
  tags?: Record<string, string>
}

/** The `maid_tasks` info of the generated fixture */
export const FIXTURE_LIST: TaskListInfo = {
  version: 1,
  list_id: 'fixture-small-tasks',
  title: 'Fixture: check the streets of small',
  description:
    'Tasks cut from the `small` fixture by `bun run tasks-fixture`. Generated, not edited by hand.',
}

/** The box of the small fixture, `[west, south, east, north]` */
const SMALL_BOX = [13.393, 52.385, 13.407, 52.393] as const

/**
 * A seeded pseudo-random generator (mulberry32): the same seed gives the same numbers in the same order. Returns
 * values in [0, 1).
 */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A copy of the list in a random order (Fisher-Yates with the generator) */
function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    const a = out[i]
    const b = out[j]
    if (a === undefined || b === undefined) continue
    out[i] = b
    out[j] = a
  }
  return out
}

/** A task id: `t-0001`, `t-0002`, ... in file order */
function taskId(prefix: string, index: number) {
  return `${prefix}-${String(index + 1).padStart(4, '0')}`
}

/** A tag change an option can offer. `value` absent means the option removes the key. */
type Template = { id: string; label: string; key: string; value?: string }

const WAY_TEMPLATES: readonly Template[] = [
  { id: 'cycle-lane', label: 'It has a marked cycle lane', key: 'cycleway', value: 'lane' },
  { id: 'surface-asphalt', label: 'The surface is asphalt', key: 'surface', value: 'asphalt' },
  { id: 'lit', label: 'It is lit at night', key: 'lit', value: 'yes' },
  { id: 'sidewalk-both', label: 'It has a sidewalk on both sides', key: 'sidewalk', value: 'both' },
  { id: 'no-maxspeed', label: 'The speed limit tag is not needed', key: 'maxspeed' },
]

const POINT_TEMPLATES: readonly Template[] = [
  { id: 'tactile', label: 'It has tactile paving', key: 'tactile_paving', value: 'yes' },
  { id: 'zebra', label: 'It has zebra markings', key: 'crossing:markings', value: 'zebra' },
  { id: 'no-crossing-tag', label: 'The crossing tag is not needed', key: 'crossing' },
]

/**
 * One option for a template. About a third of the set options are already done (they set the value the feature
 * has, or remove a key it lacks), so that "already done" shows in the editor. Random numbers are drawn in every
 * case, so the sequence stays the same.
 */
function optionFor(template: Template, tags: Record<string, string>, random: () => number) {
  const current = Object.hasOwn(tags, template.key) ? tags[template.key] : undefined
  const done = random() < 0.35
  const withNote = random() < 0.3
  let change: Pick<TaskOption, 'set' | 'remove'>
  if (template.value === undefined) change = { remove: [template.key] }
  else if (!done) change = { set: { [template.key]: template.value } }
  else if (current !== undefined) change = { set: { [template.key]: current } }
  else change = { remove: [template.key] }
  // a done option that is not the template's change says what it keeps, so that its label fits its tags
  const label =
    change.set && change.set[template.key] !== template.value
      ? `As mapped: ${template.key}=${change.set[template.key]}`
      : change.remove && template.value !== undefined
        ? `No ${template.key} tag`
        : template.label
  return {
    id: template.id,
    label,
    ...(withNote ? { description: 'Compare with the imagery before you pick it.' } : {}),
    ...change,
  } satisfies TaskOption
}

/** A way or a node of the fixture with its coordinates, ready to become a task */
type Source = { element: FixtureElement; geometry: Geometry; highway: string }

/** The coordinates of each node of a way, or null when the fixture lacks one of them */
function lineOf(way: FixtureElement, coords: ReadonlyMap<number, [number, number]>) {
  const line: [number, number][] = []
  for (const id of way.nodes ?? []) {
    const at = coords.get(id)
    if (at === undefined) return null
    line.push(at)
  }
  return line.length >= 2 ? line : null
}

/** The task for one source: its geometry, OSM reference, Markdown text and 1 to 3 options */
function taskOf(source: Source, index: number, random: () => number): Task {
  const { element, geometry, highway } = source
  const tags = element.tags ?? {}
  const isWay = element.type === 'way'
  const name = tags.name ?? (isWay ? `unnamed ${highway}` : 'node')
  const title = isWay ? `Check ${name}` : `Check the ${highway} at node ${element.id}`
  const description = [
    `**${highway}** ${isWay ? 'street' : 'point'}, OpenStreetMap ${element.type} ${element.id}. Compare the tags below with the place as it is now.`,
    '',
    '- Look at the spot in the imagery or on the ground.',
    '- Pick the option that fits. If none fits, skip the task.',
  ].join('\n')
  const templates = isWay ? WAY_TEMPLATES : POINT_TEMPLATES
  const count = 1 + Math.floor(random() * 3)
  const options = shuffled(templates, random)
    .slice(0, count)
    .map((template) => optionFor(template, tags, random))
  return {
    type: 'Feature',
    geometry,
    properties: {
      task_id: taskId('t', index),
      title: title.slice(0, 200),
      description,
      osm: [`${element.type}/${element.id}`],
      options,
    },
  }
}

/** Options for `generateTasks` */
export type GenerateOptions = {
  /** The seed of the generator: the same seed, the same file */
  seed: number
  /** How many tasks to make; three quarters from ways, one quarter from tagged nodes */
  count: number
  /** The elements of an OSM fixture, as `fixtures/<scene>.json.gz` holds them */
  elements: readonly FixtureElement[]
  /** The list info of the file (`FIXTURE_LIST` when omitted) */
  list?: TaskListInfo
}

/**
 * Cuts `count` tasks from an OSM fixture. Ways with a `highway` tag become LineStrings, tagged nodes become Points.
 * Each task has its OSM reference, a Markdown description and 1 to 3 options, some already done. The output is
 * deterministic for a given seed and elements. Throws when the fixture has too few ways and nodes for `count`.
 */
export function generateTasks({
  seed,
  count,
  elements,
  list = FIXTURE_LIST,
}: GenerateOptions): TaskFile {
  const coords = new Map<number, [number, number]>()
  for (const element of elements) {
    if (element.type === 'node' && element.lon !== undefined && element.lat !== undefined) {
      coords.set(element.id, [element.lon, element.lat])
    }
  }
  const ways: Source[] = []
  const points: Source[] = []
  for (const element of elements) {
    const highway = element.tags?.highway
    if (highway === undefined) continue
    if (element.type === 'way') {
      const line = lineOf(element, coords)
      if (line) ways.push({ element, geometry: { type: 'LineString', coordinates: line }, highway })
    } else if (element.type === 'node') {
      const at = coords.get(element.id)
      if (at) points.push({ element, geometry: { type: 'Point', coordinates: at }, highway })
    }
  }
  const random = mulberry32(seed)
  const wayPool = shuffled(ways, random)
  const pointPool = shuffled(points, random)
  const features: Task[] = []
  for (let index = 0; index < count; index++) {
    const wantPoint = index % 4 === 3
    const source = wantPoint && pointPool.length > 0 ? pointPool.shift() : wayPool.shift()
    if (source === undefined) {
      throw new Error(
        `The fixture has too few ways and nodes for ${count} tasks (stopped at ${index})`,
      )
    }
    features.push(taskOf(source, index, random))
  }
  return { type: 'FeatureCollection', maid_tasks: list, features }
}

/** The options of a synthetic task: a set and a remove, with one of them already done on some tasks */
const SYNTHETIC_OPTIONS: readonly {
  id: string
  label: string
  set?: Record<string, string>
  remove?: string[]
}[] = [
  { id: 'asphalt', label: 'The surface is asphalt', set: { surface: 'asphalt' } },
  { id: 'paved', label: 'The surface is paved', set: { surface: 'paved' } },
  { id: 'no-lit', label: 'The lit tag is not needed', remove: ['lit'] },
]

/**
 * A task file of `count` tasks with no OSM reference, for size and speed tests. The points lie in the small fixture's
 * box. One task in four is a Point, the others a LineString of 2 to 4 positions. Deterministic for a seed.
 */
export function syntheticTasks(count: number, seed: number): TaskFile {
  const random = mulberry32(seed)
  const [west, south, east, north] = SMALL_BOX
  const inBox = (): [number, number] => [
    west + random() * (east - west),
    south + random() * (north - south),
  ]
  const features: Task[] = []
  for (let index = 0; index < count; index++) {
    const id = `s${String(index + 1).padStart(5, '0')}`
    let geometry: Geometry
    if (index % 4 === 3) {
      geometry = { type: 'Point', coordinates: inBox() }
    } else {
      const [lon, lat] = inBox()
      const length = 2 + Math.floor(random() * 3)
      const coordinates: [number, number][] = [[lon, lat]]
      for (let p = 1; p < length; p++) {
        const last = coordinates.at(-1) ?? [lon, lat]
        coordinates.push([last[0] + (random() - 0.5) * 0.001, last[1] + (random() - 0.5) * 0.001])
      }
      geometry = { type: 'LineString', coordinates }
    }
    const optionCount = 1 + (index % 3)
    const options = SYNTHETIC_OPTIONS.slice(0, optionCount)
    features.push({
      type: 'Feature',
      geometry,
      properties: {
        task_id: id,
        title: `Synthetic task ${index + 1}`,
        description: `A generated task for size tests. See [the notes](https://example.org/synthetic).`,
        options,
      },
    })
  }
  return {
    type: 'FeatureCollection',
    maid_tasks: {
      version: 1,
      list_id: 'synthetic-tasks',
      title: 'Synthetic tasks',
      description: 'Generated for size and speed tests. Not a real list.',
    },
    features,
  }
}
