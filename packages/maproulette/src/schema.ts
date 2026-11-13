/**
 * Zod schemas of the MapRoulette API. Parse at the boundary: every schema keeps unknown fields, because the API
 * returns many more than Maid reads, and drops nothing that a later helper (pin snapping, OSM ids, cooperative
 * work) may need.
 */
import { z } from 'zod'
import { asText } from './text.ts'

/** An id as a string; the API sends numbers in some places and strings in others */
const idLike = z.union([z.string(), z.number()]).transform((v) => asText(v))

/** A finite integer from a number or a numeric string; null and '' count as missing */
const optionalInt = z.preprocess(
  (v) => (v === null || v === undefined || v === '' ? undefined : v),
  z.coerce.number().int().finite().optional(),
)

/** A string; null counts as missing, other values are converted */
const optionalString = z.preprocess(
  (v) => (v === null || v === undefined ? undefined : asText(v)),
  z.string().optional(),
)

/** Tasks come with `parentId`, task details sometimes with `parent` only: copy it over */
function withParentId(value: unknown): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return value
  const row = value as Record<string, unknown>
  if (
    (row.parentId === undefined || row.parentId === null) &&
    row.parent !== undefined &&
    row.parent !== null
  ) {
    return { ...row, parentId: row.parent }
  }
  return value
}

/** A point of the API: longitude and latitude */
export const pointSchema = z.object({
  lng: z.coerce.number().finite(),
  lat: z.coerce.number().finite(),
})
export type MapRoulettePoint = z.infer<typeof pointSchema>

/** The geometries of a task: a GeoJSON FeatureCollection, with every unknown field kept */
export const geometriesSchema = z.looseObject({
  type: z.string().optional(),
  features: z.array(z.unknown()).optional(),
  cooperativeWork: z.unknown().optional(),
})
export type MapRouletteGeometries = z.infer<typeof geometriesSchema>

/** The cooperative work of a task (`meta.type` 1 is a tag fix, 2 an OSC change file) */
export const cooperativeWorkSchema = z.looseObject({
  meta: z.looseObject({ type: optionalInt, version: optionalInt }).optional(),
  operations: z.array(z.unknown()).optional(),
})
export type MapRouletteCooperativeWork = z.infer<typeof cooperativeWorkSchema>

/** A task as `GET /tasks/box` returns it (with `includeGeometries=true`). Rows without a point fail. */
export const taskInBoxSchema = z.preprocess(
  withParentId,
  z.looseObject({
    id: idLike,
    parentId: idLike,
    point: pointSchema,
    status: optionalInt,
    priority: optionalInt,
    mappedOn: optionalString,
    title: optionalString,
    name: optionalString,
    geometries: geometriesSchema.nullish(),
    cooperativeWork: z.unknown().optional(),
  }),
)
export type MapRouletteTaskInBox = z.infer<typeof taskInBoxSchema>

/** A task as `GET /task/{id}` returns it */
export const taskSchema = z.preprocess(
  withParentId,
  z.looseObject({
    id: idLike,
    parentId: idLike.optional(),
    name: optionalString,
    title: optionalString,
    instruction: optionalString,
    status: optionalInt,
    priority: optionalInt,
    mappedOn: optionalString,
    geometries: geometriesSchema.nullish(),
    cooperativeWork: z.unknown().optional(),
  }),
)
export type MapRouletteTask = z.infer<typeof taskSchema>

/** A challenge as `GET /challenge/{id}` returns it, with the fields Maid reads */
export const challengeSchema = z.looseObject({
  id: idLike.optional(),
  name: optionalString,
  enabled: z.boolean().optional(),
  deleted: z.boolean().optional(),
  instruction: optionalString,
  description: optionalString,
  checkinComment: optionalString,
  checkinSource: optionalString,
})
export type MapRouletteChallenge = z.infer<typeof challengeSchema>

/** A comment on a task. Shape of the MapRoulette comment list; not confirmed against the live API. */
export const commentSchema = z.looseObject({
  id: idLike.optional(),
  taskId: idLike.optional(),
  osm_id: idLike.optional(),
  osm_username: optionalString,
  comment: z.string(),
  created: optionalString,
})
export type MapRouletteComment = z.infer<typeof commentSchema>

/** Parse one task of a box; null when it is not a task with a point */
export function parseTaskInBox(row: unknown): MapRouletteTaskInBox | null {
  const parsed = taskInBoxSchema.safeParse(row)
  return parsed.success ? parsed.data : null
}

/** Parse the answer of `GET /tasks/box`: an array, or an object with `tasks`. Rows that fail are dropped. */
export function parseTasksInBox(data: unknown): MapRouletteTaskInBox[] {
  const list: unknown[] = Array.isArray(data)
    ? data
    : data !== null &&
        typeof data === 'object' &&
        Array.isArray((data as { tasks?: unknown }).tasks)
      ? (data as { tasks: unknown[] }).tasks
      : []
  const out: MapRouletteTaskInBox[] = []
  for (const row of list) {
    const task = parseTaskInBox(row)
    if (task) out.push(task)
  }
  return out
}

/** Parse a challenge; null when it is not an object */
export function parseChallenge(data: unknown): MapRouletteChallenge | null {
  const parsed = challengeSchema.safeParse(data)
  return parsed.success ? parsed.data : null
}

/** Parse a task detail; null when it has no id */
export function parseTask(data: unknown): MapRouletteTask | null {
  const parsed = taskSchema.safeParse(data)
  return parsed.success ? parsed.data : null
}

/** Parse a list of comments; rows that fail are dropped */
export function parseComments(data: unknown): MapRouletteComment[] {
  if (!Array.isArray(data)) return []
  const out: MapRouletteComment[] = []
  for (const row of data) {
    const parsed = commentSchema.safeParse(row)
    if (parsed.success) out.push(parsed.data)
  }
  return out
}

/** Whether a challenge shows its tasks: enabled and not deleted */
export function challengeIsVisible(challenge: MapRouletteChallenge | null | undefined): boolean {
  return !!(challenge && challenge.enabled && !challenge.deleted)
}

/** The features of a geometries object, a task that wraps one, or a plain feature array */
export function geometryFeatures(geometries: unknown): unknown[] {
  if (Array.isArray(geometries)) return geometries
  const parsed = geometriesSchema.safeParse(geometries)
  if (parsed.success && Array.isArray(parsed.data.features)) return parsed.data.features
  return []
}
