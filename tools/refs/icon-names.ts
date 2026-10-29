// Every icon name Maid can show, and where each one is used. Read by tools/refs/subset-sprites.ts (which icons to keep)
// and by tools/refs/subset-sprites.test.ts (that the subset files hold all of them). Reads files only: no network.
//
// Three sources:
//  1. The preset data that packages/presets loads (default.ts): id-tagging-schema's presets.min.json (`icon` of each
//     preset), preset_categories.min.json (`icon` of each category) and fields.min.json (`icon` of each field, and the
//     `icons` map of each field's values). It is resolved from packages/presets, so it is the same package.
//  2. Source code: every string literal that is a sprite name (`'maki-cafe'`, `` `iD-icon-area` ``) in the src folders of
//     packages and apps. That covers the modules' presets and icons, the operations' icons and the command bar. Test
//     files (`*.test.ts`) are not read: their fixtures use made-up names (`maki-x`), which Maid does not show.
//  3. Not found: a sprite name built at run time (a template with `${}` after the prefix, or a quoted prefix that ends
//     in a dash). Those are listed in `dynamic` so that a person can check them.

import { join } from 'node:path'
import { SPRITE_OF_PREFIX, spriteOf } from '../../packages/shell/src/sprite-sets.ts'

export const ROOT = join(import.meta.dir, '../..')

/**
 * Icon names the data uses that the full iD sprites do not have. Maid (like iD) draws no icon for them. Kept here so
 * that the subset script and the test tell a new gap from a known one. Each one needs its reason.
 */
export const KNOWN_MISSING: Record<string, string> = {
  'roentgen-power_pole_armless':
    "id-tagging-schema 7.3.0 names it as the `armless` value of the power-pole field's icons; the roentgen sprite of the pinned iD build does not have it, so iD shows no icon for that value either",
}

/** A sprite name and the places that use it, in a fixed order. */
export type IconSources = Map<string, string[]>

export type IconNames = {
  /** Every icon name Maid can show, sorted, with where it is used */
  uses: IconSources
  /** Places where a sprite name is built at run time (`'iD-operation-' + name`, `` `maki-${x}` ``) */
  dynamic: string[]
}

const PREFIXES = Object.keys(SPRITE_OF_PREFIX).join('|')
/** A quoted literal that is a sprite name (ends in a letter, digit or underscore): the quote on each side is the same */
const LITERAL = new RegExp(`(['"\`])((?:${PREFIXES})-[A-Za-z0-9_.+-]*[A-Za-z0-9_])\\1`, 'g')
/** A quoted sprite prefix that is followed by a substitution, or ends in a dash: the name is built at run time */
const DYNAMIC = new RegExp(`(['"\`])((?:${PREFIXES})-[A-Za-z0-9_.+-]*)(\\$\\{|\\1)`, 'g')

const PRESET_DATA = '@openstreetmap/id-tagging-schema/dist'

function add(uses: IconSources, name: string | undefined, source: string) {
  if (name === undefined || spriteOf(name) === undefined) return
  const list = uses.get(name) ?? []
  list.push(source)
  uses.set(name, list)
}

async function readJson(file: string): Promise<Record<string, Record<string, unknown>>> {
  const path = Bun.resolveSync(`${PRESET_DATA}/${file}`, join(ROOT, 'packages/presets'))
  return Bun.file(path).json()
}

/** The icon of each preset, category, field, and field value of the preset data packages/presets loads. */
async function presetIcons(uses: IconSources) {
  const presets = await readJson('presets.min.json')
  for (const [id, preset] of Object.entries(presets)) {
    if (typeof preset.icon === 'string') add(uses, preset.icon, `preset ${id}`)
  }
  const categories = await readJson('preset_categories.min.json')
  for (const [id, category] of Object.entries(categories)) {
    if (typeof category.icon === 'string') add(uses, category.icon, `category ${id}`)
  }
  const fields = await readJson('fields.min.json')
  for (const [id, field] of Object.entries(fields)) {
    if (typeof field.icon === 'string') add(uses, field.icon, `field ${id}`)
    const icons = field.icons
    if (typeof icons === 'object' && icons !== null) {
      for (const [value, icon] of Object.entries(icons)) {
        if (typeof icon === 'string') add(uses, icon, `field ${id} value ${value}`)
      }
    }
  }
}

/** Sprite names in the src folders of packages and apps: string literals, and the dynamic places. */
async function sourceIcons(uses: IconSources, dynamic: string[]) {
  const glob = new Bun.Glob('{packages,apps}/*/src/**/*.{ts,tsx}')
  const files: string[] = []
  for await (const rel of glob.scan({ cwd: ROOT, onlyFiles: true })) {
    if (!rel.includes('node_modules') && !/\.test\.tsx?$/.test(rel)) files.push(rel)
  }
  files.sort()
  for (const rel of files) {
    const text = await Bun.file(join(ROOT, rel)).text()
    for (const match of text.matchAll(LITERAL)) {
      add(uses, match[2], `${rel}:${lineOf(text, match.index)}`)
    }
    for (const match of text.matchAll(DYNAMIC)) {
      if (match[3] === '${' || match[2]!.endsWith('-')) {
        dynamic.push(`${rel}:${lineOf(text, match.index)} ${match[0]}`)
      }
    }
  }
}

function lineOf(text: string, index: number) {
  let line = 1
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) line++
  return line
}

/** Every sprite name Maid can show, from the preset data and the source code, with where it is used. */
export async function iconNames(): Promise<IconNames> {
  const uses: IconSources = new Map()
  const dynamic: string[] = []
  await presetIcons(uses)
  await sourceIcons(uses, dynamic)
  const sorted: IconSources = new Map()
  for (const name of [...uses.keys()].sort()) sorted.set(name, uses.get(name)!)
  return { uses: sorted, dynamic }
}
