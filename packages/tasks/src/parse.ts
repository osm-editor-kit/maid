/**
 * Reads a task file: the JSON text or the parsed value, checked against the format. Returns the typed file or the
 * errors, each with the path of the value that broke the rule. No network, no file reads.
 */
import { type TaskFile, taskFileSchema } from './schema.ts'

/** One rule that a value broke: where it is, as `features[3].properties.osm[0]`, and what is wrong */
export type TaskFileError = { path: string; message: string }

/** The most errors one parse reports; the rest are counted in `omitted` */
export const MAX_REPORTED_ERRORS = 100

/** The result of a parse: the file, or the errors (at most `MAX_REPORTED_ERRORS`) and how many were left out */
export type ParseResult =
  | { ok: true; file: TaskFile }
  | { ok: false; errors: TaskFileError[]; omitted?: number }

const identifier = /^[A-Za-z_][A-Za-z0-9_]*$/

/**
 * Writes a Zod issue path the way people read it: `features[3].properties.osm[0]`. A key that is not a plain
 * identifier is written in brackets, as `set["cycleway:both"]`. The root is `$`.
 */
export function formatPath(path: readonly PropertyKey[]) {
  if (path.length === 0) return '$'
  let text = ''
  path.forEach((part, index) => {
    if (typeof part === 'number') {
      text += `[${part}]`
    } else {
      const key = String(part)
      if (identifier.test(key)) text += index === 0 ? key : `.${key}`
      else text += `[${JSON.stringify(key)}]`
    }
  })
  return text
}

/**
 * Checks a parsed value against the task file format. Every rule the schemas state is checked, including the unique
 * task ids, the unique OSM references and option ids, and a tag key that is both set and removed.
 */
export function parseTaskFile(input: unknown): ParseResult {
  const result = taskFileSchema.safeParse(input)
  if (result.success) return { ok: true, file: result.data }
  const errors = result.error.issues.map((issue) => ({
    path: formatPath(issue.path),
    message: issue.message,
  }))
  if (errors.length <= MAX_REPORTED_ERRORS) return { ok: false, errors }
  return {
    ok: false,
    errors: errors.slice(0, MAX_REPORTED_ERRORS),
    omitted: errors.length - MAX_REPORTED_ERRORS,
  }
}

/**
 * Parses the text of a task file. Text that is not JSON is one error at the root (`$`); the rest is `parseTaskFile`.
 */
export function parseTaskFileText(text: string): ParseResult {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return { ok: false, errors: [{ path: '$', message: `Not valid JSON: ${reason}` }] }
  }
  return parseTaskFile(value)
}
