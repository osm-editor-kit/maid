/**
 * Reads and writes lens files: JSON with one lens, or a list of lenses. Unknown fields are
 * ignored, so a file from a newer version still loads. Each problem is a plain sentence that
 * names where it is in the file.
 */
import { parseColour, type Lens, type LensGeometry } from '@osm-editor-kit/maid-style'
import { z } from 'zod'
import { NO_LENS } from './url.ts'

export const MAX_FILE_BYTES = 256 * 1024
const MAX_RULES = 200
const MAX_ERRORS = 20
const GEOMETRIES = ['line', 'area', 'point'] as const
const REST = ['dim', 'normal', 'hide'] as const
const ID = /^[a-z0-9][a-z0-9_-]{0,63}$/

const ID_MESSAGE =
  'expected 1 to 64 lower-case letters, digits, dashes or underscores, starting with a letter or digit'
const TEXT_MESSAGE = 'expected a text'
const COLOUR_MESSAGE = 'expected a colour like #1a7f37 or rgb(26, 127, 55)'
const MATCH_MESSAGE =
  'expected a value, a list of values, true (the tag is set) or false (the tag is missing)'
const WIDTH_MESSAGE = 'expected a number above 0 and up to 20 (px)'
const OPACITY_MESSAGE = 'expected a number from 0 to 1'
const DASH_MESSAGE = 'expected 1 to 8 lengths in px, each above 0 and up to 100'
const GEOMETRY_MESSAGE = 'expected a list of line, area or point'
const RULES_MESSAGE = 'expected a list with at least one rule'

export type LensFileResult = { ok: true; lenses: Lens[] } | { ok: false; errors: string[] }

/** A text that is not blank and has at most `max` characters */
const text = (max: number) =>
  z
    .string({ error: TEXT_MESSAGE })
    .refine((value) => value.trim() !== '', { error: TEXT_MESSAGE })
    .max(max, { error: `at most ${max} characters` })

const colour = z
  .string({ error: COLOUR_MESSAGE })
  .refine((value) => parseColour(value) !== undefined, { error: COLOUR_MESSAGE })

/** A tag value: any value (`true`), none (`false`), one value or a list of values */
const matchValue = z.union(
  [
    z.boolean(),
    text(200),
    z.array(text(200), { error: MATCH_MESSAGE }).min(1, { error: MATCH_MESSAGE }),
  ],
  { error: MATCH_MESSAGE },
)

const dashList = z
  .array(z.number({ error: DASH_MESSAGE }), { error: DASH_MESSAGE })
  .min(1, { error: DASH_MESSAGE, abort: true })
  .max(8, { error: DASH_MESSAGE, abort: true })
  .refine((list) => list.every((dash) => dash > 0 && dash <= 100), { error: DASH_MESSAGE })

const isGeometry = (value: string): value is LensGeometry =>
  GEOMETRIES.some((known) => known === value)

/** A geometry the list does not know is reported at `geometry`, not at its item */
const geometryList = z
  .array(z.string({ error: GEOMETRY_MESSAGE }), { error: GEOMETRY_MESSAGE })
  .min(1, { error: GEOMETRY_MESSAGE, abort: true })
  .refine((list): list is LensGeometry[] => list.every(isGeometry), { error: GEOMETRY_MESSAGE })

const rule = z.object(
  {
    match: z.record(
      z.string().refine((key) => key.trim() !== '', { error: 'a tag key is empty' }),
      matchValue,
      { error: 'expected an object with the tags to match' },
    ),
    color: colour.optional(),
    width: z
      .number({ error: WIDTH_MESSAGE })
      .gt(0, { error: WIDTH_MESSAGE })
      .lte(20, { error: WIDTH_MESSAGE })
      .optional(),
    opacity: z
      .number({ error: OPACITY_MESSAGE })
      .min(0, { error: OPACITY_MESSAGE })
      .max(1, { error: OPACITY_MESSAGE })
      .optional(),
    dash: dashList.optional(),
    label: text(60).optional(),
  },
  { error: 'expected an object' },
)

/** One lens as the file gives it. The ids that are reserved or used twice are checked by the caller. */
export const lensSchema = z.object(
  {
    id: z.string({ error: ID_MESSAGE }).regex(ID, { error: ID_MESSAGE }),
    name: text(60),
    description: text(300).optional(),
    rules: z
      .array(rule, { error: RULES_MESSAGE })
      .min(1, { error: RULES_MESSAGE, abort: true })
      .max(MAX_RULES, { error: `at most ${MAX_RULES} rules` }),
    rest: z.enum(REST, { error: 'expected one of dim, normal, hide' }).optional(),
    geometry: geometryList.optional(),
  },
  { error: 'expected an object' },
)

/**
 * One problem as a sentence: the path in the file (`lens.rules[0].color`, `lenses[1].id`) and
 * what is expected there. A bad tag key is reported at its match, with the key's own sentence.
 */
function problem(root: string, issue: z.core.$ZodIssue) {
  const key = issue.code === 'invalid_key'
  const path = key ? issue.path.slice(0, -1) : issue.path
  const message = key ? (issue.issues[0]?.message ?? issue.message) : issue.message
  const where = path
    .map((part) => (typeof part === 'number' ? `[${part}]` : `.${String(part)}`))
    .join('')
  return `${root}${where}: ${message}`
}

/**
 * Parses the text of a lens file. `reserved` are the ids that a file may not use (the built-in
 * lenses). The result lists up to 20 problems, so a broken file shows what to fix first.
 */
export function parseLensFile(source: string, reserved: readonly string[] = []): LensFileResult {
  let data: unknown
  try {
    data = JSON.parse(source)
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown error'
    return { ok: false, errors: [`The file is not valid JSON: ${reason}`] }
  }
  let items: unknown[]
  if (Array.isArray(data)) items = data
  else if (typeof data === 'object' && data !== null && 'rules' in data) items = [data]
  else {
    return {
      ok: false,
      errors: ['Expected one lens (an object with id, name and rules) or a list of lenses'],
    }
  }
  if (items.length === 0) return { ok: false, errors: ['The list has no lenses'] }

  const problems: string[] = []
  const lenses: Lens[] = []
  const seen = new Set<string>()
  items.forEach((item, i) => {
    const path = Array.isArray(data) ? `lenses[${i}]` : 'lens'
    const parsed = lensSchema.safeParse(item)
    if (!parsed.success) {
      problems.push(...parsed.error.issues.map((issue) => problem(path, issue)))
      return
    }
    const lens = parsed.data
    if (lens.id === NO_LENS) problems.push(`${path}.id: "${NO_LENS}" means no lens in a link`)
    else if (reserved.includes(lens.id))
      problems.push(`${path}.id: "${lens.id}" is a built-in lens`)
    else if (seen.has(lens.id)) problems.push(`${path}.id: "${lens.id}" is used twice in the file`)
    seen.add(lens.id)
    lenses.push(lens)
  })
  if (problems.length > 0) {
    const errors = problems.slice(0, MAX_ERRORS)
    if (problems.length > MAX_ERRORS) errors.push(`and ${problems.length - MAX_ERRORS} more`)
    return { ok: false, errors }
  }
  return { ok: true, lenses }
}

/** The file for a list of lenses: a JSON list, which parseLensFile reads back */
export function serialiseLenses(lenses: readonly Lens[]) {
  return `${JSON.stringify(lenses, null, 2)}\n`
}
