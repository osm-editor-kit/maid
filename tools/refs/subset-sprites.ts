/**
 * Cuts Maid's icon sprites down to the icons Maid can show.
 *
 *   bun tools/refs/subset-sprites.ts      (or: bun run sprites-subset)
 *
 * Reads iD's full sprite files from .reference/sprites-full (copy-sprites.ts fills it from the iD build, see
 * `bun run refs-setup`) and writes each one into packages/shell/public/sprites with only the symbols of the icons that
 * the presets, the modules and the code use (icon-names.ts), plus the <defs> those symbols reference. Symbols are copied
 * byte for byte, in their source order, so the output is deterministic.
 *
 * Writes reports/sprites-subset.json (sizes, kept ids, icons missing from the full files). Exits 1 when a used icon is
 * not in the full files and not in KNOWN_MISSING (icon-names.ts): the data or the code names an icon that iD does not have.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { gzipSync } from 'node:zlib'
import { spriteOf } from '../../packages/shell/src/sprite-sets.ts'
import { iconNames, KNOWN_MISSING, ROOT } from './icon-names.ts'

/** The icon sets Maid ships (the sprite file of each is `<set>-sprite.svg`) */
export const SPRITE_SETS = ['maki', 'temaki', 'fa', 'roentgen', 'pinhead', 'iD'] as const
export const FULL_DIR = join(ROOT, '.reference/sprites-full')
export const SUBSET_DIR = join(ROOT, 'packages/shell/public/sprites')
const REPORT = join(ROOT, 'reports/sprites-subset.json')

type Piece = {
  text: string
  kind: 'symbol' | 'defs'
  /** A symbol's own id (its `id` attribute in the opening tag) */
  id?: string
  /** Every id defined inside the piece */
  ids: string[]
}

/** The sprite split into its header, its top-level symbols and <defs> blocks (in order), and its footer. */
function parseSprite(source: string) {
  const found = [...source.matchAll(/<defs\b[\s\S]*?<\/defs>|<symbol\b[\s\S]*?<\/symbol>/g)]
  if (found.length === 0) throw new Error('the sprite has no <symbol> or <defs>')
  const header = source.slice(0, found[0]!.index)
  const pieces: Piece[] = []
  let cursor = found[0]!.index
  for (const match of found) {
    const text = match[0]
    const between = source.slice(cursor, match.index).trim()
    if (between !== '')
      throw new Error(`unexpected content in the sprite at ${cursor}: ${between.slice(0, 80)}`)
    const kind = text.startsWith('<defs') ? 'defs' : 'symbol'
    if (kind === 'symbol' && text.indexOf('<symbol', 1) !== -1)
      throw new Error('nested <symbol> in the sprite')
    const ids = [...text.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]!)
    const open = kind === 'symbol' ? /^<symbol\b[^>]*>/.exec(text)![0] : ''
    const id = kind === 'symbol' ? /\sid="([^"]+)"/.exec(open)?.[1] : undefined
    pieces.push({ text, kind, id, ids })
    cursor = match.index + text.length
  }
  const footer = source.slice(cursor)
  if (footer.trim() !== '</svg>')
    throw new Error(`unexpected content after the sprite: ${footer.trim().slice(0, 80)}`)
  return { header, pieces, footer }
}

/** The ids a piece refers to: `url(#id)` and `href="#id"` (also `xlink:href`) */
function refsOf(text: string) {
  return [...text.matchAll(/(?:url\(#|href="#)([^")\s]+)/g)].map((m) => m[1]!)
}

export type Cut = {
  text: string
  /** The symbols kept, in source order */
  keptSymbols: string[]
  keptDefs: number
  symbolsInFull: number
  /** Used icons that the full sprite does not have */
  missing: string[]
  /** Ids a kept piece refers to that the full sprite does not define */
  unresolved: string[]
}

/** The sprite with only the symbols of `used` and the pieces they need (<defs>, other symbols they `use`). */
export function cutSprite(source: string, used: ReadonlySet<string>): Cut {
  const { header, pieces, footer } = parseSprite(source)
  // the owner of each id: a symbol's own id first, then the ids inside the pieces
  const owner = new Map<string, number>()
  const ownSymbol = new Map<string, number>()
  pieces.forEach((piece, i) => {
    if (piece.id !== undefined) {
      ownSymbol.set(piece.id, i)
      owner.set(piece.id, i)
    }
  })
  pieces.forEach((piece, i) => {
    for (const id of piece.ids) if (!owner.has(id)) owner.set(id, i)
  })

  const keep = new Set<number>()
  const missing: string[] = []
  for (const name of [...used].sort()) {
    const i = ownSymbol.get(name)
    if (i === undefined) missing.push(name)
    else keep.add(i)
  }
  const stack = [...keep]
  const unresolved = new Set<string>()
  while (stack.length > 0) {
    const i = stack.pop()!
    for (const ref of refsOf(pieces[i]!.text)) {
      const j = owner.get(ref)
      if (j === undefined) unresolved.add(ref)
      else if (!keep.has(j)) {
        keep.add(j)
        stack.push(j)
      }
    }
  }

  const kept = pieces.filter((_, i) => keep.has(i))
  return {
    text: header + kept.map((piece) => piece.text).join('') + footer,
    keptSymbols: kept.filter((p) => p.kind === 'symbol').map((p) => p.id!),
    keptDefs: kept.filter((p) => p.kind === 'defs').length,
    symbolsInFull: pieces.filter((p) => p.kind === 'symbol').length,
    missing,
    unresolved: [...unresolved].sort(),
  }
}

/** The gzip size at level 9, with no file name or time in the header, so that the numbers do not depend on the file's name. */
export function gzipBytes(text: string) {
  return gzipSync(Buffer.from(text, 'utf8'), { level: 9 }).length
}

export type SetReport = {
  full: { raw: number; gzip: number }
  subset: { raw: number; gzip: number }
  symbolsInFull: number
  symbolsKept: number
  defsKept: number
  kept: string[]
  missing: string[]
  unresolved: string[]
}

export type SubsetReport = {
  sets: Record<string, SetReport>
  /** Icon names by set, as collected (icon-names.ts) */
  names: { total: number; bySet: Record<string, number> }
  dynamic: string[]
  /** Used icons the full sprites do not have, and that are not in KNOWN_MISSING: a broken reference */
  missing: string[]
  /** Used icons the full sprites do not have, with the reason (KNOWN_MISSING) */
  knownMissing: Record<string, string>
}

/**
 * Writes the subset sprite files and returns the report. Throws when the full files are not there (run refs-setup).
 * Names are collected with where each one is used; a name is kept in the set its prefix names (spriteOf).
 */
export async function subsetSprites(): Promise<SubsetReport> {
  const fullOf = (set: string) => join(FULL_DIR, `${set}-sprite.svg`)
  for (const set of SPRITE_SETS) {
    if (!existsSync(fullOf(set))) {
      throw new Error(
        `${fullOf(set)} is missing. Run: bun run refs-setup (it copies iD's sprites there)`,
      )
    }
  }
  const { uses, dynamic } = await iconNames()
  mkdirSync(SUBSET_DIR, { recursive: true })

  const sets: Record<string, SetReport> = {}
  const missing: string[] = []
  const knownMissing: Record<string, string> = {}
  for (const set of SPRITE_SETS) {
    const source = readFileSync(fullOf(set), 'utf8')
    const names = new Set([...uses.keys()].filter((name) => spriteOf(name) === set))
    const cut = cutSprite(source, names)
    writeFileSync(join(SUBSET_DIR, `${set}-sprite.svg`), cut.text)
    sets[set] = {
      full: { raw: Buffer.byteLength(source), gzip: gzipBytes(source) },
      subset: { raw: Buffer.byteLength(cut.text), gzip: gzipBytes(cut.text) },
      symbolsInFull: cut.symbolsInFull,
      symbolsKept: cut.keptSymbols.length,
      defsKept: cut.keptDefs,
      kept: cut.keptSymbols,
      missing: cut.missing,
      unresolved: cut.unresolved,
    }
    for (const name of cut.missing) {
      if (KNOWN_MISSING[name] !== undefined) knownMissing[name] = KNOWN_MISSING[name]
      else missing.push(`${name} (${set}-sprite.svg)`)
    }
  }

  const bySet: Record<string, number> = {}
  for (const name of uses.keys()) bySet[spriteOf(name)!] = (bySet[spriteOf(name)!] ?? 0) + 1
  const report: SubsetReport = {
    sets,
    names: { total: uses.size, bySet },
    dynamic,
    missing,
    knownMissing,
  }
  mkdirSync(join(ROOT, 'reports'), { recursive: true })
  writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`)
  return report
}

if (import.meta.main) {
  const report = await subsetSprites()
  const rel = (path: string) => relative(ROOT, path)
  console.log(
    `Icon names: ${report.names.total} (${Object.entries(report.names.bySet)
      .map(([s, n]) => `${s} ${n}`)
      .join(', ')})`,
  )
  for (const [set, r] of Object.entries(report.sets)) {
    console.log(
      `${set}-sprite.svg: ${r.full.raw} -> ${r.subset.raw} bytes raw, ${r.full.gzip} -> ${r.subset.gzip} gzip -9; ` +
        `${r.symbolsKept} of ${r.symbolsInFull} symbols, ${r.defsKept} defs`,
    )
  }
  console.log(`Wrote ${rel(SUBSET_DIR)}/ and ${rel(REPORT)}`)
  if (report.dynamic.length > 0)
    console.log(`Dynamic sprite names (check by hand): ${report.dynamic.length}`)
  for (const name of Object.keys(report.knownMissing))
    console.log(`Known gap, not in iD's sprites: ${name}`)
  if (report.missing.length > 0) {
    console.error(
      `${report.missing.length} used icons are not in the full sprites:\n  ${report.missing.join('\n  ')}`,
    )
    process.exit(1)
  }
}
