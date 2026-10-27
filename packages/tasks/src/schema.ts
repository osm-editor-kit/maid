/**
 * The task file: a GeoJSON FeatureCollection with a `maid_tasks` foreign member. Zod schemas and the types
 * inferred from them. `parse.ts` is the authority: it runs these schemas. `json-schema.ts` exports what they state.
 */
import { z } from 'zod'

/** Ids of the list, of tasks and of options: letters, digits and `. _ : -`, up to 64 characters */
export const ID_PATTERN = /^[A-Za-z0-9._:-]{1,64}$/
/** An OSM element reference such as `way/123`: no leading zero */
const OSM_REF_PATTERN = /^(node|way|relation)\/[1-9][0-9]*$/
/** A Mapillary image id: digits only */
const MAPILLARY_PATTERN = /^[0-9]{1,20}$/

const MAX_TITLE = 200
const MAX_DESCRIPTION = 10_000
const MAX_TAG_TEXT = 255
const MAX_OSM_REFS = 50
const MAX_LINKS = 20
const MAX_MAPILLARY = 20
const MAX_OPTIONS = 10
/** The most tasks (features) one task file may hold */
export const MAX_TASKS = 20_000

const idField = (what: string) =>
  z.string().regex(ID_PATTERN, `${what} must be 1 to 64 letters, digits, "." "_" ":" or "-"`)

const textField = (what: string, max: number) =>
  z
    .string()
    .min(1, `${what} must not be empty`)
    .max(max, `${what} must be at most ${max} characters`)

const markdownField = (what: string) =>
  z.string().max(MAX_DESCRIPTION, `${what} must be at most ${MAX_DESCRIPTION} characters`)

/** The `maid_tasks` member: what the list is and says */
export const taskListInfoSchema = z.looseObject({
  /** Must be 1: the only version of the format */
  version: z.literal(1, 'maid_tasks.version must be 1'),
  list_id: idField('list_id'),
  title: textField('title', MAX_TITLE),
  /** Markdown; may be empty */
  description: markdownField('description'),
})
/** The list's own info (`maid_tasks`) */
export type TaskListInfo = z.infer<typeof taskListInfoSchema>

const longitude = z
  .number()
  .min(-180, 'longitude must be between -180 and 180')
  .max(180, 'longitude must be between -180 and 180')
const latitude = z
  .number()
  .min(-90, 'latitude must be between -90 and 90')
  .max(90, 'latitude must be between -90 and 90')

/** A longitude and latitude in degrees, with an optional altitude after them (GeoJSON) */
const positionSchema = z.tuple([longitude, latitude]).rest(z.number())

/** A GeoJSON ring: at least four positions, the last one equal to the first */
const ringSchema = z
  .array(positionSchema)
  .min(4, 'a ring needs at least 4 positions')
  .refine((ring) => {
    const first = ring[0]
    const last = ring.at(-1)
    return first !== undefined && last !== undefined && first.every((v, i) => v === last[i])
  }, 'a ring must be closed: the last position equals the first')

const lineSchema = z.array(positionSchema).min(2, 'a line needs at least 2 positions')

/** The five geometry types a task may have. Geometry is required. */
export const geometrySchema = z.discriminatedUnion('type', [
  z.looseObject({ type: z.literal('Point'), coordinates: positionSchema }),
  z.looseObject({ type: z.literal('LineString'), coordinates: lineSchema }),
  z.looseObject({ type: z.literal('Polygon'), coordinates: z.array(ringSchema).min(1) }),
  z.looseObject({ type: z.literal('MultiLineString'), coordinates: z.array(lineSchema).min(1) }),
  z.looseObject({
    type: z.literal('MultiPolygon'),
    coordinates: z.array(z.array(ringSchema).min(1)).min(1),
  }),
])
/** A GeoJSON geometry of one of the five types */
export type Geometry = z.infer<typeof geometrySchema>

/**
 * One answer a mapper can pick. `set` adds or changes tags, `remove` deletes keys. A key may not be in both, and
 * at least one of the two must be non-empty.
 */
export const taskOptionSchema = z
  .looseObject({
    id: idField('option id'),
    label: textField('label', MAX_TITLE),
    /** Markdown; optional */
    description: markdownField('option description').optional(),
    set: z
      .record(
        textField('a tag key in set', MAX_TAG_TEXT),
        textField('a tag value in set', MAX_TAG_TEXT),
      )
      .optional(),
    remove: z.array(textField('a tag key in remove', MAX_TAG_TEXT)).optional(),
  })
  .superRefine((option, ctx) => {
    const set = option.set ?? {}
    const remove = option.remove ?? []
    if (Object.keys(set).length === 0 && remove.length === 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'an option needs at least one tag in set or remove',
        input: option,
      })
    }
    remove.forEach((key, index) => {
      if (Object.hasOwn(set, key)) {
        ctx.addIssue({
          code: 'custom',
          message: `the key "${key}" is in both set and remove`,
          path: ['remove', index],
          input: option,
        })
      }
    })
  })
/** One option of a task */
export type TaskOption = z.infer<typeof taskOptionSchema>

/**
 * Adds an issue at each repeat of a value in a list. The first copy is fine; each later one is reported at the
 * path `pathOf` gives for its index.
 */
function reportRepeats<T>(
  items: readonly T[] | undefined,
  keyOf: (item: T) => string,
  pathOf: (index: number) => PropertyKey[],
  what: string,
  ctx: z.RefinementCtx,
) {
  const seen = new Set<string>()
  items?.forEach((item, index) => {
    const key = keyOf(item)
    if (seen.has(key)) {
      ctx.addIssue({
        code: 'custom',
        message: `duplicate ${what} "${key}"`,
        path: pathOf(index),
        input: item,
      })
    }
    seen.add(key)
  })
}

/**
 * The properties of a task: what Maid shows and offers. Unknown properties are kept and ignored, so that a newer
 * file still reads in this version.
 */
export const taskPropertiesSchema = z
  .looseObject({
    task_id: idField('task_id'),
    title: textField('title', MAX_TITLE),
    /** Markdown; may be empty */
    description: markdownField('description'),
    osm: z
      .array(
        z
          .string()
          .regex(OSM_REF_PATTERN, 'an OSM reference must look like way/123, node/5 or relation/7'),
      )
      .max(MAX_OSM_REFS, `at most ${MAX_OSM_REFS} OSM references`)
      .optional(),
    links: z
      .array(
        z.string().refine((link) => {
          try {
            return new URL(link).protocol === 'https:'
          } catch {
            return false
          }
        }, 'a link must be an https:// URL'),
      )
      .max(MAX_LINKS, `at most ${MAX_LINKS} links`)
      .optional(),
    mapillary: z
      .array(z.string().regex(MAPILLARY_PATTERN, 'a Mapillary id is digits only'))
      .max(MAX_MAPILLARY, `at most ${MAX_MAPILLARY} Mapillary ids`)
      .optional(),
    options: z
      .array(taskOptionSchema)
      .max(MAX_OPTIONS, `at most ${MAX_OPTIONS} options`)
      .optional(),
  })
  .superRefine((properties, ctx) => {
    reportRepeats(
      properties.osm,
      (ref) => ref,
      (i) => ['osm', i],
      'OSM reference',
      ctx,
    )
    reportRepeats(
      properties.options,
      (option) => option.id,
      (i) => ['options', i, 'id'],
      'option id',
      ctx,
    )
  })
/** The properties of a task */
export type TaskProperties = z.infer<typeof taskPropertiesSchema>

/** One task: a GeoJSON Feature with task properties */
export const taskSchema = z.looseObject({
  type: z.literal('Feature', 'type must be "Feature"'),
  geometry: geometrySchema,
  properties: taskPropertiesSchema,
})
/** One task of the file */
export type Task = z.infer<typeof taskSchema>

/** The whole task file: a FeatureCollection with `maid_tasks` and the tasks as features */
export const taskFileSchema = z
  .looseObject({
    type: z.literal('FeatureCollection', 'type must be "FeatureCollection"'),
    maid_tasks: taskListInfoSchema,
    features: z.array(taskSchema).max(MAX_TASKS, `at most ${MAX_TASKS} tasks in one file`),
  })
  .superRefine((file, ctx) => {
    reportRepeats(
      file.features,
      (task) => task.properties.task_id,
      (i) => ['features', i, 'properties', 'task_id'],
      'task_id',
      ctx,
    )
  })
  .meta({
    title: 'Maid task file',
    description: 'A GeoJSON FeatureCollection of map tasks for the Maid editor.',
  })
/** The whole task file */
export type TaskFile = z.infer<typeof taskFileSchema>
