/**
 * Reads and writes lens files: JSON with one lens, or a list of lenses. Unknown fields are
 * ignored, so a file from a newer version still loads. Each problem is a plain sentence that
 * names where it is in the file.
 */
import { parseColour, type Lens, type LensGeometry } from '@osm-editor-kit/maid-style'
import { z } from 'zod'
import { m } from './messages.ts'
import { NO_LENS } from './url.ts'

export const MAX_FILE_BYTES = 256 * 1024
const MAX_RULES = 200
const MAX_ERRORS = 20
const GEOMETRIES = ['line', 'area', 'point'] as const
const REST = ['dim', 'normal', 'hide'] as const
const ID = /^[a-z0-9][a-z0-9_-]{0,63}$/

// The sentences are made when a problem is reported (zod calls an `error` function then), never at module level
const ID_MESSAGE = () => m.lenses_file_expected_id()
const TEXT_MESSAGE = () => m.lenses_file_expected_text()
const COLOUR_MESSAGE = () => m.lenses_file_expected_colour()
const MATCH_MESSAGE = () => m.lenses_file_expected_match()
const WIDTH_MESSAGE = () => m.lenses_file_expected_width()
const OPACITY_MESSAGE = () => m.lenses_file_expected_opacity()
const DASH_MESSAGE = () => m.lenses_file_expected_dash()
const GEOMETRY_MESSAGE = () => m.lenses_file_expected_geometry()
const RULES_MESSAGE = () => m.lenses_file_expected_rules()

export type LensFileResult = { ok: true; lenses: Lens[] } | { ok: false; errors: string[] }

/** A text that is not blank and has at most `max` characters */
const text = (max: number) =>
  z
    .string({ error: TEXT_MESSAGE })
    .refine((value) => value.trim() !== '', { error: TEXT_MESSAGE })
    .max(max, { error: () => m.lenses_file_at_most_characters({ max }) })

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
      z.string().refine((key) => key.trim() !== '', { error: () => m.lenses_file_tag_key_empty() }),
      matchValue,
      { error: () => m.lenses_file_expected_tags() },
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
    fillColor: colour.optional(),
    fillOpacity: z
      .number({ error: OPACITY_MESSAGE })
      .min(0, { error: OPACITY_MESSAGE })
      .max(1, { error: OPACITY_MESSAGE })
      .optional(),
    label: text(60).optional(),
  },
  { error: () => m.lenses_file_expected_object() },
)

/** A row of a chosen legend (`Lens.legend`) */
const legendEntry = z.object(
  {
    label: text(80),
    color: colour.optional(),
    width: z
      .number({ error: WIDTH_MESSAGE })
      .gt(0, { error: WIDTH_MESSAGE })
      .lte(20, { error: WIDTH_MESSAGE })
      .optional(),
    dash: dashList.optional(),
    casing: z.boolean().optional(),
    kerbs: z.boolean().optional(),
    road: z.boolean().optional(),
    sign: z.boolean().optional(),
  },
  { error: () => m.lenses_file_expected_object() },
)

const legend = z.object(
  {
    entries: z
      .array(legendEntry)
      .min(1)
      .max(20, { error: () => m.lenses_file_at_most_legend_entries() }),
    note: text(300).optional(),
  },
  { error: () => m.lenses_file_expected_entries() },
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
      .max(MAX_RULES, { error: () => m.lenses_file_at_most_rules({ max: MAX_RULES }) }),
    rest: z.enum(REST, { error: () => m.lenses_file_expected_rest() }).optional(),
    geometry: geometryList.optional(),
    legend: legend.optional(),
  },
  { error: () => m.lenses_file_expected_object() },
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
  return m.lenses_file_problem({ where: `${root}${where}`, message })
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
    const reason = error instanceof Error ? error.message : m.lenses_file_unknown_error()
    return { ok: false, errors: [m.lenses_file_invalid_json({ reason })] }
  }
  let items: unknown[]
  if (Array.isArray(data)) items = data
  else if (typeof data === 'object' && data !== null && 'rules' in data) items = [data]
  else {
    return {
      ok: false,
      errors: [m.lenses_file_expected_lens_or_list()],
    }
  }
  if (items.length === 0) return { ok: false, errors: [m.lenses_file_no_lenses()] }

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
    if (lens.id === NO_LENS)
      problems.push(m.lenses_file_id_means_none({ path: `${path}.id`, id: NO_LENS }))
    else if (reserved.includes(lens.id))
      problems.push(m.lenses_file_id_built_in({ path: `${path}.id`, id: lens.id }))
    else if (seen.has(lens.id))
      problems.push(m.lenses_file_id_twice({ path: `${path}.id`, id: lens.id }))
    seen.add(lens.id)
    lenses.push(lens)
  })
  if (problems.length > 0) {
    const errors = problems.slice(0, MAX_ERRORS)
    if (problems.length > MAX_ERRORS)
      errors.push(m.lenses_file_and_more({ count: problems.length - MAX_ERRORS }))
    return { ok: false, errors }
  }
  return { ok: true, lenses }
}

/** The file for a list of lenses: a JSON list, which parseLensFile reads back */
export function serialiseLenses(lenses: readonly Lens[]) {
  return `${JSON.stringify(lenses, null, 2)}\n`
}
