/**
 * Resolves the look of a way from iD's stylesheet rules (see scripts/extract.ts).
 * Works like the CSS cascade: matching rules are applied in order of specificity, then source order.
 */
import rulesJson from './generated/id-rules.json'

type Rule = {
  part: 'stroke' | 'casing' | 'shadow' | 'fill'
  geom: 'line' | 'area' | 'any'
  lowZoom: boolean
  tags: string[]
  not: string[]
  decl: Record<string, string>
  specificity: number
}

export type PartStyle = {
  color?: string
  width: number
  /** Width at low zoom (below OSM zoom 17) */
  widthLow: number
  dash?: number[]
  dashLow?: number[]
  opacity: number
  cap: 'round' | 'butt' | 'square'
}

export type WayStyle = {
  stroke: PartStyle
  casing: PartStyle
  shadow: PartStyle
  /** Colour of the area fill, only for areas */
  fill?: string
}

const RULES = (rulesJson as unknown as Rule[]).map((rule, order) => ({ ...rule, order }))
const BASE = RULES.filter((r) => r.tags.length === 0)
const BY_TAG = new Map<string, typeof RULES>()
for (const rule of RULES) {
  if (rule.tags.length === 0) continue
  const list = BY_TAG.get(rule.tags[0]!)
  if (list) list.push(rule)
  else BY_TAG.set(rule.tags[0]!, [rule])
}

const cache = new Map<string, WayStyle>()

function parseDash(value: string | undefined) {
  if (!value || value === 'none') return undefined
  return value.split(/[\s,]+/).map(Number)
}

function fold(rules: typeof RULES, part: Rule['part'], lowZoom: boolean) {
  const decl: Record<string, string> = {}
  for (const rule of rules) {
    if (rule.part !== part || (rule.lowZoom && !lowZoom)) continue
    Object.assign(decl, rule.decl)
  }
  return decl
}

function partStyle(rules: typeof RULES, part: Rule['part']): PartStyle {
  const normal = fold(rules, part, false)
  const low = fold(rules, part, true)
  const hidden = normal.display === 'none' || !normal.stroke || normal.stroke === 'none'
  return {
    color: hidden ? undefined : normal.stroke,
    width: Number.parseFloat(normal['stroke-width'] ?? '1'),
    widthLow: Number.parseFloat(low['stroke-width'] ?? '1'),
    dash: parseDash(normal['stroke-dasharray']),
    dashLow: parseDash(low['stroke-dasharray']),
    opacity: Number.parseFloat(normal['stroke-opacity'] ?? '1'),
    // `path.line { stroke-linecap: round }` is iD's base rule for every line path
    cap: (normal['stroke-linecap'] as PartStyle['cap']) ?? 'round',
  }
}

/** @param classes from tagClasses() @param geom whether the way is drawn as a line or as an area outline */
export function resolveWayStyle(classes: string[], geom: 'line' | 'area'): WayStyle {
  const key = `${geom}|${classes.join(' ')}`
  const cached = cache.get(key)
  if (cached) return cached

  const set = new Set(classes)
  const matching = [...BASE]
  for (const cls of classes) {
    for (const rule of BY_TAG.get(cls) ?? []) {
      if (rule.tags.every((t) => set.has(t)) && !rule.not.some((t) => set.has(t))) matching.push(rule)
    }
  }
  const rules = matching
    .filter((r) => r.geom === 'any' || r.geom === geom)
    .sort((a, b) => a.specificity - b.specificity || a.order - b.order)

  const style: WayStyle = {
    stroke: partStyle(rules, 'stroke'),
    casing: partStyle(rules, 'casing'),
    shadow: partStyle(rules, 'shadow'),
  }
  if (geom === 'area') {
    const fill = fold(rules, 'fill', false)
    style.fill = fill.fill && fill.fill !== 'none' ? fill.fill : undefined
  }
  cache.set(key, style)
  return style
}
