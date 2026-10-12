/**
 * Guards a refactoring of the renderer: takes a screenshot of Maid for every scene and compares
 * it, pixel by pixel, with a reference set. Needs the Maid dev server and the mock API
 * (`bun run dev`) and ImageMagick (`compare`).
 *
 *   bun tools/bench/shot-diff.ts save <name>          take the reference set reports/shots/<name>/
 *   bun tools/bench/shot-diff.ts check <name> [query] compare the current state with it
 *
 * `check` exits non-zero when a scene differs in more than 1% of its pixels or its counts differ
 * (what is on screen may differ by 0.5%).
 * Two runs of the same code are not identical: tiles arrive in a different order, which moves a
 * few labels and decides a handful of shared vertices differently (measured: up to 0.4% of pixels).
 */
import { mkdirSync } from 'node:fs'
import { $ } from 'bun'

const [mode = 'check', name = 'reference', query = ''] = process.argv.slice(2)
const SCENES = ['small', 'medium', 'dense']
const dir = `reports/shots/${name}`
mkdirSync(dir, { recursive: true })

type Counts = Record<string, number>
type Stats = { entities: Counts; drawn: Counts; hidden: Counts; loaded: Counts }

/**
 * What must not change: the number of entities, of layers and of features per kind. Timings are
 * left out. So is what is drawn on screen: it depends on which tiles are in the view when the
 * count is taken and differs by a feature or two between runs of the same code (`drift` checks it).
 */
function counts(stats: Stats) {
  const { vertices: _loadedVertices, ...loaded } = stats.loaded
  const layers = stats.drawn.layers
  return JSON.stringify({ entities: stats.entities, layers, hidden: stats.hidden, loaded })
}

/** Largest relative difference of the counts that vary between runs */
function drift(now: Stats, expected: Stats) {
  const pairs = [
    [now.loaded.vertices, expected.loaded.vertices],
    ...Object.keys(expected.drawn).map((key) => [now.drawn[key], expected.drawn[key]]),
  ]
  return Math.max(...pairs.map(([a = 0, b = 0]) => Math.abs(a - b) / Math.max(1, b)))
}

async function shoot(scene: string, out: string) {
  const text = await $`bun tools/bench/shot.ts maid ${scene} 17 ${out} ${query}`.text()
  const stats = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) as Stats
  const problems = text.split('\n').filter((line) => /^\[(error|pageerror)\]/.test(line))
  return { stats, problems }
}

let failed = false
for (const scene of SCENES) {
  if (mode === 'save') {
    const { stats, problems } = await shoot(scene, `${dir}/${scene}.png`)
    await Bun.write(`${dir}/${scene}.stats.json`, JSON.stringify(stats))
    console.log(`${scene}: saved ${counts(stats)}`, problems.join(' '))
    continue
  }
  const current = `${dir}/${scene}.current.png`
  const { stats, problems } = await shoot(scene, current)
  const expected = (await Bun.file(`${dir}/${scene}.stats.json`).json()) as Stats
  // `compare` prints the number of differing pixels to stderr and exits 1 when there are any
  const result =
    await $`compare -metric AE -fuzz 2% ${dir}/${scene}.png ${current} ${dir}/${scene}.diff.png`
      .nothrow()
      .quiet()
  const pixels = Number.parseFloat(result.stderr.toString())
  const share = pixels / (3200 * 2000)
  const same = counts(stats) === counts(expected) && drift(stats, expected) <= 0.005
  const ok = same && share <= 0.01 && problems.length === 0
  if (!ok) failed = true
  console.log(
    `${scene}: ${ok ? 'ok' : 'DIFFERENT'} pixels=${(share * 100).toFixed(2)}% counts ${same ? 'equal' : `now ${JSON.stringify(stats)}, expected ${JSON.stringify(expected)}`}`,
    problems.join(' '),
  )
}
if (failed) process.exit(1)
