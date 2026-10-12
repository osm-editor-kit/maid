/**
 * Turns iD's stylesheets into data, so the look stays iD's and is not hand-copied.
 *
 *   bun run --cwd packages/style generate [path/to/iD]
 *
 * Reads css/*.css of an iD checkout (default: .reference/id) and the presets of
 * @openstreetmap/id-tagging-schema. Writes src/generated/id-rules.json and area-keys.json.
 * Only rules for way paths (path.line.*, path.area.*, path.stroke, ...) are kept, and only
 * those that depend on tag classes and the low-zoom class. State (hover, selected, ...) and
 * modes (wireframe, highlight-edited, ...) are handled by the renderer, not by these rules.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dir, '../../..')
const idDir = process.argv[2] ?? join(root, '.reference/id')
const FILES = [
  '20_map.css',
  '25_areas.css',
  '30_highways.css',
  '35_aeroways.css',
  '40_railways.css',
  '45_waterways.css',
  '50_misc.css',
]
const PARTS = new Set(['stroke', 'casing', 'shadow', 'fill'])
const PROPS = new Set([
  'stroke',
  'stroke-width',
  'stroke-dasharray',
  'stroke-opacity',
  'stroke-linecap',
  'fill',
  'display',
])

export type Rule = {
  /** Which path of a way this styles */
  part: 'stroke' | 'casing' | 'shadow' | 'fill'
  /** 'any' applies to lines and area outlines */
  geom: 'line' | 'area' | 'any'
  lowZoom: boolean
  /** Tag classes that must all be present, without the `tag-` prefix */
  tags: string[]
  /** Tag classes that must be absent */
  not: string[]
  decl: Record<string, string>
  specificity: number
}

function parseSelector(selector: string): Omit<Rule, 'decl'> | undefined {
  const compounds = selector.trim().split(/\s+/)
  const target = compounds.pop()!
  let lowZoom = false
  for (const ancestor of compounds) {
    if (ancestor === '.low-zoom') lowZoom = true
    else return undefined // any other context (modes, groups, fill settings) is out of scope
  }
  const match = target.match(/^path((?:\.[\w-]+|:not\(\.[\w-]+\))+)$/)
  if (!match) return undefined
  let part: Rule['part'] | undefined
  let geom: Rule['geom'] = 'any'
  const tags: string[] = []
  const not: string[] = []
  let classCount = 0
  for (const token of match[1]!.match(/\.[\w-]+|:not\(\.[\w-]+\)/g)!) {
    classCount++
    if (token.startsWith(':not')) {
      const cls = token.slice(6, -1)
      if (!cls.startsWith('tag-')) return undefined
      not.push(cls.slice(4))
      continue
    }
    const cls = token.slice(1)
    if (PARTS.has(cls)) part = cls as Rule['part']
    else if (cls === 'line' || cls === 'area') geom = cls
    else if (cls.startsWith('tag-')) tags.push(cls.slice(4))
    else return undefined // state classes such as .hover, .selected, .old-multipolygon
  }
  if (!part) {
    // `path.line { stroke-linecap: round }` style base rules apply to every part
    return undefined
  }
  return { part, geom, lowZoom, tags, not, specificity: classCount + (lowZoom ? 1 : 0) }
}

const rules: Rule[] = []
for (const file of FILES) {
  const path = join(idDir, 'css', file)
  if (!existsSync(path)) throw new Error(`Missing ${path}. Pass the path of an iD checkout.`)
  const css = readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  for (const [, selectorList, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const decl: Record<string, string> = {}
    for (const line of body!.split(';')) {
      const colon = line.indexOf(':')
      if (colon < 0) continue
      const prop = line.slice(0, colon).trim()
      if (PROPS.has(prop))
        decl[prop] = line
          .slice(colon + 1)
          .trim()
          .replace(/\s*!important/, '')
    }
    if (Object.keys(decl).length === 0) continue
    for (const selector of selectorList!.split(',')) {
      const parsed = parseSelector(selector)
      if (parsed) rules.push({ ...parsed, decl })
    }
  }
}

/** iD presets decide which keys make a closed way an area (presets/index.js areaKeys) */
const presets: Record<string, any> = JSON.parse(
  readFileSync(
    join(import.meta.dir, '../node_modules/@openstreetmap/id-tagging-schema/dist/presets.json'),
    'utf8',
  ),
)
const ignore = new Set(['barrier', 'highway', 'footway', 'railway', 'junction', 'type'])
const areaKeys: Record<string, Record<string, true>> = {}
const list = Object.values(presets).filter((p) => !p.suggestion && !p.replacement)
for (const p of list) {
  const key = p.tags && Object.keys(p.tags)[0]
  if (!key || ignore.has(key)) continue
  if (p.geometry.includes('area')) areaKeys[key] ??= {}
}
for (const p of list) {
  for (const key in p.addTags ?? p.tags ?? {}) {
    const value = (p.addTags ?? p.tags)[key]
    if (key in areaKeys && p.geometry.includes('line') && value !== '*')
      areaKeys[key]![value] = true
  }
}

const out = join(import.meta.dir, '../src/generated')
await Bun.write(join(out, 'id-rules.json'), JSON.stringify(rules))
await Bun.write(join(out, 'area-keys.json'), JSON.stringify(areaKeys))
console.log(`${rules.length} rules, ${Object.keys(areaKeys).length} area keys from ${idDir}`)
