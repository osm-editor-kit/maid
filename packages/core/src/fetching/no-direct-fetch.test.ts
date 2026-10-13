/**
 * Every request of the editor goes through `editor.fetch` (remote-fetch.ts): the host gate, the automation
 * refusal, the time limit and the pause on 429 and 509 apply only there (AGENTS.md, core rule 1;
 * fetching-audit.md). This test scans the source of every package and app for the direct ways of sending
 * a request, and fails with the file and line of each one that is not on the allow list below.
 *
 * Not scanned: tests, this folder (it is the fetch itself), `tools/`, and `node_modules`. A third-party
 * library that fetches on its own is out of reach and is listed here, not scanned:
 * - `@osm-editor-kit/street-imagery` (packages/module-street-imagery): the photo tiles, the Mapillary graph,
 *   the capabilities and the infra3D WFS are fetched inside its `dist`, with no way to pass a fetch in.
 * - `pmtiles` (packages/module-data-layers/src/pmtiles.ts): `new PMTiles(url)` reads with its own default
 *   source, which calls the global fetch. Passing a `Source` that uses `editor.fetch` would move it.
 * - MapLibre: raster, vector and GeoJSON sources and the PMTiles protocol are loaded by MapLibre itself.
 *   Maid keeps the lock for these in the modules (`allowedWhenAutomated`, `automated` flags), not in the gate.
 */
import { describe, expect, test } from 'bun:test'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'

const ROOT = resolve(import.meta.dir, '../../../..')
const SCAN_PARENTS = ['packages', 'apps'] as const
const EXCLUDED_PREFIX = 'packages/core/src/fetching/'
const SOURCE_FILE = /\.(ts|tsx|js|jsx|mjs|mts)$/
const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/

/**
 * The direct ways of sending a request. A bare `fetch(` is matched only when it is not a method call
 * (`editor.fetch(`, `deps.fetch(`), so the editor's own fetch and an injected one are not flagged.
 */
const PATTERNS: readonly { name: string; pattern: RegExp }[] = [
  { name: 'fetch(', pattern: /(^|[^.\w$])fetch\s*\(/ },
  { name: 'globalThis.fetch', pattern: /\bglobalThis\s*\.\s*fetch\b/ },
  { name: 'window.fetch', pattern: /\bwindow\s*\.\s*fetch\b/ },
  { name: 'new XMLHttpRequest', pattern: /\bnew\s+XMLHttpRequest\b/ },
  { name: 'navigator.sendBeacon', pattern: /\bnavigator\s*\.\s*sendBeacon\b/ },
  { name: 'new EventSource', pattern: /\bnew\s+EventSource\b/ },
  { name: 'new WebSocket', pattern: /\bnew\s+WebSocket\b/ },
]

/**
 * A direct call that stays, with the reason. An entry allows every line of that file whose text (trimmed,
 * trailing comment removed) is `text`, so it survives edits above and below the line. An entry that matches
 * nothing fails the test: the list does not keep calls that have moved.
 */
interface Allowed {
  /** The file, from the repository root, with `/` as separator */
  file: string
  /** The line as it is in the file, trimmed */
  text: string
  /** Why the call stays: `TODO move to editor.fetch` for a call that should move, or the reason it cannot */
  reason: string
}

const ALLOWED: readonly Allowed[] = [
  {
    file: 'packages/shell/src/images.ts',
    text: 'sprite = fetch(`/sprites/${name}-sprite.svg`)',
    reason:
      'TODO move to editor.fetch. The sprite of an icon set, read from the app\u2019s own origin (/sprites), not from a remote host.',
  },
]

interface Hit {
  file: string
  line: number
  /** The line as the entry matches it (trimmed, trailing comment removed) */
  text: string
  pattern: string
}

/** The names of the patterns that a line of code matches. Strings are not parsed: a line that names one is flagged. */
function directCalls(code: string): string[] {
  return PATTERNS.filter(({ pattern }) => pattern.test(code)).map(({ name }) => name)
}

/** The lines that are code: no blank lines, no comment lines, and no trailing `// comment`. */
function codeLines(source: string): { line: number; text: string }[] {
  const lines: { line: number; text: string }[] = []
  source.split('\n').forEach((raw, index) => {
    const trimmed = raw.trim()
    if (trimmed === '' || trimmed.startsWith('//') || trimmed.startsWith('/*')) return
    if (trimmed.startsWith('*')) return
    lines.push({ line: index + 1, text: trimmed.replace(/\s\/\/.*$/, '').trim() })
  })
  return lines
}

function* sourceFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) yield* sourceFiles(path)
    else if (SOURCE_FILE.test(entry.name) && !TEST_FILE.test(entry.name)) yield path
  }
}

/** Every source file of every package and app, from the repository root. */
function scannedFiles(root: string = ROOT): string[] {
  const files: string[] = []
  for (const parent of SCAN_PARENTS) {
    const parentDir = join(root, parent)
    if (!existsSync(parentDir)) continue
    for (const name of readdirSync(parentDir, { withFileTypes: true })) {
      if (!name.isDirectory()) continue
      const src = join(parentDir, name.name, 'src')
      if (!existsSync(src)) continue
      for (const path of sourceFiles(src)) {
        const rel = relative(root, path).split(sep).join('/')
        if (!rel.startsWith(EXCLUDED_PREFIX)) files.push(rel)
      }
    }
  }
  return files.sort()
}

function findHits(root: string, files: readonly string[]): Hit[] {
  const hits: Hit[] = []
  for (const file of files) {
    const source = readFileSync(join(root, file), 'utf8')
    for (const { line, text } of codeLines(source)) {
      for (const pattern of directCalls(text)) hits.push({ file, line, text, pattern })
    }
  }
  return hits
}

function isAllowed(hit: Hit): boolean {
  return ALLOWED.some((entry) => entry.file === hit.file && entry.text === hit.text)
}

const files = scannedFiles()
const hits = findHits(ROOT, files)

describe('the pattern check', () => {
  test('finds the direct ways of sending a request', () => {
    expect(directCalls('const res = await fetch(url)')).toEqual(['fetch('])
    expect(directCalls('return fetch(`/x`)')).toEqual(['fetch('])
    expect(directCalls('return (fetch (url))')).toEqual(['fetch('])
    expect(directCalls('await globalThis.fetch(url, init)')).toEqual(['globalThis.fetch'])
    expect(directCalls('window.fetch(url)')).toEqual(['window.fetch'])
    expect(directCalls('const x = new XMLHttpRequest()')).toEqual(['new XMLHttpRequest'])
    expect(directCalls('navigator.sendBeacon(url, data)')).toEqual(['navigator.sendBeacon'])
    expect(directCalls('new EventSource(url)')).toEqual(['new EventSource'])
    expect(directCalls('new WebSocket(url)')).toEqual(['new WebSocket'])
  })

  test('does not flag the editor fetch, an injected fetch, or other names', () => {
    expect(directCalls('await editor.fetch(url)')).toEqual([])
    expect(directCalls('return deps.fetch(url, init)')).toEqual([])
    expect(directCalls('return send(url, init)')).toEqual([])
    expect(directCalls('const x = prefetch(url)')).toEqual([])
    expect(directCalls('queries.fetchQuery({ queryKey })')).toEqual([])
    expect(directCalls('const fetchAnswer = (url) => url')).toEqual([])
  })

  test('the scan sees the source of the packages and the apps, and nothing of the fetch folder or tests', () => {
    expect(files.length).toBeGreaterThan(200)
    expect(files.some((file) => file.startsWith('apps/'))).toBe(true)
    expect(files).toContain('packages/module-data-layers/src/add.ts')
    expect(files.some((file) => file.startsWith(EXCLUDED_PREFIX))).toBe(false)
    expect(files.some((file) => TEST_FILE.test(file))).toBe(false)
    expect(files.some((file) => file.startsWith('tools/'))).toBe(false)
  })
})

describe('direct requests', () => {
  test('every direct request is on the allow list, with a reason', () => {
    const unexpected = hits
      .filter((hit) => !isAllowed(hit))
      .map((hit) => `${hit.file}:${hit.line}: ${hit.text} (${hit.pattern})`)
    expect(unexpected).toEqual([])
  })

  test('every allow-list entry has a reason and still matches a call', () => {
    for (const entry of ALLOWED) {
      expect(entry.reason.trim(), `reason of ${entry.file}`).not.toBe('')
      const found = hits.some((hit) => hit.file === entry.file && hit.text === entry.text)
      expect(found, `${entry.file}: no call matches "${entry.text}"`).toBe(true)
    }
  })
})
