/**
 * Reads and writes lens files: JSON with one lens, or a list of lenses. Unknown fields are
 * ignored, so a file from a newer version still loads. Everything else is checked here, and each
 * problem is a plain sentence that names where it is in the file.
 */
import {
  parseColour,
  type Lens,
  type LensGeometry,
  type LensRule,
} from '@osm-editor-kit/maid-style'

export const MAX_FILE_BYTES = 256 * 1024
const MAX_RULES = 200
const MAX_ERRORS = 20
const GEOMETRIES: readonly LensGeometry[] = ['line', 'area', 'point']
const REST = ['dim', 'normal', 'hide'] as const
const ID = /^[a-z0-9][a-z0-9_-]{0,63}$/

export type LensFileResult = { ok: true; lenses: Lens[] } | { ok: false; errors: string[] }

type Problems = string[]
type Obj = Record<string, unknown>

function isObject(value: unknown): value is Obj {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value: unknown, path: string, problems: Problems, max: number) {
  if (typeof value !== 'string' || value.trim() === '') {
    problems.push(`${path}: expected a text`)
    return undefined
  }
  if (value.length > max) {
    problems.push(`${path}: at most ${max} characters`)
    return undefined
  }
  return value
}

function matchValue(value: unknown, path: string, problems: Problems) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') return text(value, path, problems, 200)
  if (Array.isArray(value) && value.length > 0) {
    const values: string[] = []
    value.forEach((item, i) => {
      const one = text(item, `${path}[${i}]`, problems, 200)
      if (one !== undefined) values.push(one)
    })
    return values
  }
  problems.push(
    `${path}: expected a value, a list of values, true (the tag is set) or false (the tag is missing)`,
  )
  return undefined
}

function rule(value: unknown, path: string, problems: Problems) {
  if (!isObject(value)) {
    problems.push(`${path}: expected an object`)
    return undefined
  }
  const before = problems.length
  const out: LensRule = { match: {} }
  if (!isObject(value.match)) {
    problems.push(`${path}.match: expected an object with the tags to match`)
  } else {
    for (const [key, want] of Object.entries(value.match)) {
      if (key.trim() === '') {
        problems.push(`${path}.match: a tag key is empty`)
        continue
      }
      const v = matchValue(want, `${path}.match.${key}`, problems)
      if (v !== undefined) out.match[key] = v
    }
  }
  if (value.color !== undefined) {
    if (typeof value.color === 'string' && parseColour(value.color)) out.color = value.color
    else problems.push(`${path}.color: expected a colour like #1a7f37 or rgb(26, 127, 55)`)
  }
  if (value.width !== undefined) {
    if (typeof value.width === 'number' && value.width > 0 && value.width <= 20)
      out.width = value.width
    else problems.push(`${path}.width: expected a number above 0 and up to 20 (px)`)
  }
  if (value.opacity !== undefined) {
    if (typeof value.opacity === 'number' && value.opacity >= 0 && value.opacity <= 1)
      out.opacity = value.opacity
    else problems.push(`${path}.opacity: expected a number from 0 to 1`)
  }
  if (value.dash !== undefined) {
    if (isDashList(value.dash)) out.dash = value.dash
    else problems.push(`${path}.dash: expected 1 to 8 lengths in px, each above 0 and up to 100`)
  }
  if (value.label !== undefined) {
    const label = text(value.label, `${path}.label`, problems, 60)
    if (label !== undefined) out.label = label
  }
  return problems.length === before ? out : undefined
}

function isDashList(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length >= 1 &&
    value.length <= 8 &&
    value.every((d) => typeof d === 'number' && d > 0 && d <= 100)
  )
}

function isGeometryList(value: unknown): value is LensGeometry[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((g) => GEOMETRIES.some((geometry) => geometry === g))
  )
}

function lens(value: unknown, path: string, problems: Problems) {
  if (!isObject(value)) {
    problems.push(`${path}: expected an object`)
    return undefined
  }
  const before = problems.length
  const id = typeof value.id === 'string' && ID.test(value.id) ? value.id : undefined
  if (id === undefined)
    problems.push(
      `${path}.id: expected 1 to 64 lower-case letters, digits, dashes or underscores, starting with a letter or digit`,
    )
  const name = text(value.name, `${path}.name`, problems, 60)
  const out: Lens = { id: id ?? '', name: name ?? '', rules: [] }
  if (value.description !== undefined) {
    const description = text(value.description, `${path}.description`, problems, 300)
    if (description !== undefined) out.description = description
  }
  if (!Array.isArray(value.rules) || value.rules.length === 0) {
    problems.push(`${path}.rules: expected a list with at least one rule`)
  } else if (value.rules.length > MAX_RULES) {
    problems.push(`${path}.rules: at most ${MAX_RULES} rules`)
  } else {
    value.rules.forEach((item, i) => {
      const parsed = rule(item, `${path}.rules[${i}]`, problems)
      if (parsed) out.rules.push(parsed)
    })
  }
  if (value.rest !== undefined) {
    const rest = REST.find((item) => item === value.rest)
    if (rest !== undefined) out.rest = rest
    else problems.push(`${path}.rest: expected one of dim, normal, hide`)
  }
  if (value.geometry !== undefined) {
    if (isGeometryList(value.geometry)) out.geometry = value.geometry
    else problems.push(`${path}.geometry: expected a list of line, area or point`)
  }
  return problems.length === before ? out : undefined
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
  const problems: Problems = []
  let items: unknown[]
  if (Array.isArray(data)) items = data
  else if (isObject(data) && 'rules' in data) items = [data]
  else {
    return {
      ok: false,
      errors: ['Expected one lens (an object with id, name and rules) or a list of lenses'],
    }
  }
  if (items.length === 0) return { ok: false, errors: ['The list has no lenses'] }

  const lenses: Lens[] = []
  const seen = new Set<string>()
  items.forEach((item, i) => {
    const path = Array.isArray(data) ? `lenses[${i}]` : 'lens'
    const parsed = lens(item, path, problems)
    if (!parsed) return
    if (reserved.includes(parsed.id)) problems.push(`${path}.id: "${parsed.id}" is a built-in lens`)
    else if (seen.has(parsed.id))
      problems.push(`${path}.id: "${parsed.id}" is used twice in the file`)
    seen.add(parsed.id)
    lenses.push(parsed)
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
