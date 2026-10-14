/**
 * react-map-gl against raw MapLibre, for the scenarios that matter to Maid.
 *
 *   bun run bench-rmgl                 all scenarios, 5 repetitions
 *   bun run bench-rmgl --reps 3
 *   bun run bench-rmgl --only mount,pointer
 *   bun run bench-rmgl --quick         one repetition and short loops: a check that it runs, no numbers to keep
 *
 * A full run writes reports/rmgl-bench.json; a run with --only or --quick writes reports/rmgl-bench-partial.json.
 *
 * Builds the page (tools/bench/rmgl/app) in production mode with the React Compiler, serves the built files
 * itself on its own port, drives two tabs (`?mode=react`, `?mode=raw`) with system Chrome and writes
 * reports/rmgl-bench.json. The method and the findings: docs/research/react-map-gl-performance.md.
 *
 * No network: the style is empty, the fonts are the shell's, the data is the dense fixture. Every request
 * that is not for this server is blocked and fails the run (AGENTS.md, core rule 1).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, normalize, resolve } from 'node:path'
import { chromium, type CDPSession, type Page } from '@playwright/test'
import { PORTS } from '../../ports'
import { median, quantile } from '../stats'
import { build, versions } from './build'
import { prepare } from './prepare'

const ROOT = resolve(import.meta.dir, '../../..')
const DIST = resolve(import.meta.dir, 'dist')
const FONTS = join(ROOT, 'packages/shell/public/fonts')
const PORT = PORTS.rmglBench
const ORIGIN = `http://127.0.0.1:${PORT}`
const VIEWPORT = { width: 1280, height: 800 }

type Samples = { sync: number[]; toRender: number[]; toIdle: number[] }
type MountOptions = {
  set?: 'maid' | number
  empty?: boolean
  hover?: boolean
  count?: boolean
  layerMode?: 'memo' | 'rerender' | 'clone'
  camera?: 'uncontrolled' | 'controlled'
  mouse?: 'interactive' | 'plain' | 'every' | 'throttled'
}
/** `window.__rmgl` of the page (tools/bench/rmgl/app/main.jsx) */
type RmglApi = {
  ready?: boolean
  mount(options: MountOptions): Promise<number>
  unmount(): void
  counts(): { sources: number; layers: number }
  layerRenders(): number
  rerender(n: number): number[]
  props(kind: string, n: number): Promise<Samples>
  data(how: string, n: number, features: string): Promise<Samples>
  hover(how: string, n: number): Promise<Samples>
  style(how: string, n: number): Promise<number[]>
  images(n: number): Promise<Samples>
  imageBurst(n: number): Promise<{ sync: number; total: number }>
  camera(): Promise<{ frames: number[]; moves: number; behind: number; stuck: number }>
  mouse(): { events: number; features: number }
  pointer(
    n: number,
    interval: number,
  ): Promise<{ events: number; features: number; seconds: number }>
}
declare global {
  interface Window {
    __rmgl: RmglApi
  }
}

const argv = process.argv.slice(2)
const option = (name: string) => {
  const at = argv.indexOf(`--${name}`)
  return at === -1 ? undefined : argv[at + 1]
}
const QUICK = argv.includes('--quick')
const REPS = QUICK ? 1 : Number(option('reps') ?? 5)
const ONLY = option('only')?.split(',')
/** Steps of a loop in one repetition. `--quick` caps them at 4. */
const steps = (n: number) => (QUICK ? Math.min(n, 4) : n)
/** A partial or quick run does not replace the full report */
const OUT = join(
  ROOT,
  QUICK || ONLY ? 'reports/rmgl-bench-partial.json' : 'reports/rmgl-bench.json',
)
if (!Number.isInteger(REPS) || REPS < 1) {
  console.error('--reps needs a whole number above 0')
  process.exit(2)
}

// ---- results ------------------------------------------------------------------------------------------------

type Row = {
  scenario: string
  case: string
  variant: string
  metric: string
  samples: number[]
}
const rows = new Map<string, Row>()
function add(
  scenario: string,
  caseName: string,
  variant: string,
  metric: string,
  values: number[],
) {
  const key = [scenario, caseName, variant, metric].join('|')
  const row = rows.get(key) ?? { scenario, case: caseName, variant, metric, samples: [] }
  row.samples.push(...values)
  rows.set(key, row)
}
const round = (n: number) => (Math.abs(n) >= 100 ? Math.round(n) : Math.round(n * 100) / 100)
const summary = (row: Row) => ({
  scenario: row.scenario,
  case: row.case,
  variant: row.variant,
  metric: row.metric,
  n: row.samples.length,
  median: round(median(row.samples)),
  p95: round(quantile(row.samples, 0.95)),
  min: round(Math.min(...row.samples)),
  max: round(Math.max(...row.samples)),
})

// ---- the two tabs -------------------------------------------------------------------------------------------

type Side = { name: 'react' | 'raw'; page: Page; cdp: CDPSession }

/** Main-thread time of the tab so far (ms): all tasks, and the script part of them */
async function cpu(side: Side) {
  const { metrics } = await side.cdp.send('Performance.getMetrics')
  const ms = (name: string) => (metrics.find((m) => m.name === name)?.value ?? 0) * 1000
  return { task: ms('TaskDuration'), script: ms('ScriptDuration') }
}

/** Runs `run` and returns its value with the main-thread time the tab spent meanwhile */
async function measured<T>(side: Side, run: () => Promise<T>) {
  const before = await cpu(side)
  const value = await run()
  const after = await cpu(side)
  return { value, task: after.task - before.task, script: after.script - before.script }
}

/** Mounts the map, runs `run`, and removes the map again. Returns what `run` returns. */
async function withMap<T>(side: Side, options: MountOptions, run: () => Promise<T>) {
  await side.page.bringToFront()
  await side.page.evaluate((o) => window.__rmgl.mount(o), options)
  try {
    return await run()
  } finally {
    await side.page.evaluate(() => window.__rmgl.unmount())
  }
}

function addSamples(
  scenario: string,
  caseName: string,
  variant: string,
  result: { value: Samples; task: number; script: number },
) {
  const { value } = result
  add(scenario, caseName, variant, 'call blocks (ms)', value.sync)
  add(scenario, caseName, variant, 'to next frame (ms)', value.toRender)
  add(scenario, caseName, variant, 'to idle (ms)', value.toIdle)
  add(scenario, caseName, variant, 'main-thread script per step (ms)', [
    result.script / value.sync.length,
  ])
  add(scenario, caseName, variant, 'main-thread tasks per step (ms)', [
    result.task / value.sync.length,
  ])
}

// ---- scenarios ----------------------------------------------------------------------------------------------

const SETS = ['maid', 20, 100, 200] as const
const setName = (set: 'maid' | number, counts: { sources: number; layers: number }) =>
  `${counts.layers} layers, ${counts.sources} sources${set === 'maid' ? ' (Maid)' : ''}`

const scenarios: Record<string, (react: Side, raw: Side, rep: number) => Promise<void>> = {
  /** 1. Mount until every layer is there and the map is idle */
  async mount(react, raw) {
    for (const set of SETS) {
      for (const empty of [true, false]) {
        for (const side of [react, raw]) {
          await side.page.bringToFront()
          const result = await measured(side, () =>
            side.page.evaluate((o) => window.__rmgl.mount(o), { set, empty }),
          )
          const counts = await side.page.evaluate(() => window.__rmgl.counts())
          await side.page.evaluate(() => window.__rmgl.unmount())
          const name = `${setName(set, counts)}, ${empty ? 'no data' : 'dense data'}`
          add('1 mount', name, side.name, 'to ready (ms)', [result.value])
          add('1 mount', name, side.name, 'main-thread script (ms)', [result.script])
        }
      }
    }
  },

  /** 2. A render of the parent that changes nothing. Raw MapLibre has no such render, so only React is measured. */
  async rerender(react, _raw, rep) {
    for (const set of SETS) {
      for (const layerMode of ['memo', 'rerender', 'clone'] as const) {
        const variant = {
          memo: 'react, compiler keeps the elements',
          rerender: 'react, every Layer renders, same objects',
          clone: 'react, every Layer renders, new objects',
        }[layerMode]
        let name = ''
        await withMap(react, { set, empty: true, layerMode }, async () => {
          const counts = await react.page.evaluate(() => window.__rmgl.counts())
          name = setName(set, counts)
          await react.page.evaluate(() => window.__rmgl.rerender(10))
          const times = await react.page.evaluate((n) => window.__rmgl.rerender(n), steps(400))
          add('2 parent render, nothing changed', name, variant, 'per render (ms)', times)
        })
        if (rep > 0) continue
        // how many <Layer> components that render reaches: counted once, apart from the timing
        await withMap(react, { set, empty: true, layerMode, count: true }, async () => {
          const perRender = await react.page.evaluate(() => {
            window.__rmgl.layerRenders()
            window.__rmgl.rerender(20)
            return window.__rmgl.layerRenders() / 20
          })
          add('2 parent render, nothing changed', name, variant, 'Layer renders per render', [
            perRender,
          ])
        })
      }
    }
  },

  /** 3. One layer's paint, filter or visibility changes */
  async props(react, raw, rep) {
    for (const side of [react, raw]) {
      await withMap(side, { set: 'maid' }, async () => {
        for (const kind of ['paint', 'filter', 'visibility']) {
          const result = await measured(side, () =>
            side.page.evaluate(([k, n]) => window.__rmgl.props(k, n), [kind, steps(20)] as const),
          )
          const variant =
            side.name === 'react'
              ? 'react, prop change'
              : `raw, ${{ paint: 'setPaintProperty', filter: 'setFilter', visibility: 'setLayoutProperty' }[kind]}`
          addSamples('3 one layer changes', kind, variant, result)
        }
      })
    }
    if (rep > 0) return
    await withMap(react, { set: 'maid', count: true }, async () => {
      const perStep = await react.page.evaluate(async () => {
        window.__rmgl.layerRenders()
        await window.__rmgl.props('paint', 10)
        return window.__rmgl.layerRenders() / 10
      })
      add('3 one layer changes', 'paint', 'react, prop change', 'Layer renders per step', [perStep])
    })
  },

  /** 4. One line of about 10,000 moves, at 10 Hz */
  async data(react, raw) {
    const n = steps(20)
    const cases: Array<[Side, string, string, string]> = [
      [react, 'prop', 'shared', 'react, data prop (same feature objects but one)'],
      [react, 'prop', 'fresh', 'react, data prop (all feature objects new)'],
      [raw, 'setData', 'shared', 'raw, setData'],
      [raw, 'updateData', 'shared', 'raw, updateData (diff of one feature)'],
    ]
    for (const [side, how, features, variant] of cases) {
      await withMap(side, { set: 'maid' }, async () => {
        const result = await measured(side, () =>
          side.page.evaluate(([h, c, f]) => window.__rmgl.data(h, c, f), [
            how,
            n,
            features,
          ] as const),
        )
        addSamples('4 GeoJSON update', 'one line of 10,457 moves', variant, result)
      })
    }
  },

  /** 5. The pointer moves over the map */
  async pointer(react, raw) {
    const cases: Array<[Side, MountOptions['mouse'], string]> = [
      [react, 'interactive', 'react, interactiveLayerIds + onMouseMove'],
      [react, 'plain', 'react, onMouseMove only'],
      [raw, 'every', 'raw, query on every mousemove'],
      [raw, 'throttled', 'raw, query once per frame'],
      [raw, 'plain', 'raw, listener only'],
    ]
    const moves = steps(300)
    const scenario = '5 pointer move'
    const caseName = '120 events a second, 67 interactive layers'
    for (const [side, mouse, variant] of cases) {
      await withMap(side, { set: 'maid', mouse }, async () => {
        const result = await measured(side, () =>
          side.page.evaluate(([n, ms]) => window.__rmgl.pointer(n, ms), [moves, 8] as const),
        )
        const { events, features, seconds } = result.value
        if (events === 0) throw new Error(`${variant}: no mousemove reached the map`)
        add(scenario, caseName, variant, 'main-thread tasks per event (ms)', [result.task / events])
        add(scenario, caseName, variant, 'main-thread script per event (ms)', [
          result.script / events,
        ])
        add(scenario, caseName, variant, 'events per second', [events / seconds])
        add(scenario, caseName, variant, 'features per event', [features / events])
      })
    }
  },

  /** 6. A scripted pan and zoom */
  async camera(react, raw) {
    const cases: Array<[Side, MountOptions, string]> = [
      [react, { camera: 'uncontrolled' }, 'react, uncontrolled (initialViewState)'],
      [react, { camera: 'controlled' }, 'react, controlled, compiler keeps the layers'],
      [
        react,
        { camera: 'controlled', layerMode: 'rerender' },
        'react, controlled, every Layer renders per frame',
      ],
      [raw, {}, 'raw'],
    ]
    for (const [side, options, variant] of cases) {
      await withMap(side, { set: 'maid', ...options }, async () => {
        const result = await measured(side, () => side.page.evaluate(() => window.__rmgl.camera()))
        const { frames, moves, behind, stuck } = result.value
        if (stuck > 0) throw new Error(`${variant}: a camera move did not end`)
        const name = 'pan 2 s, zoom 2 s'
        add('6 camera', name, variant, 'frame (ms)', frames)
        add('6 camera', name, variant, 'frames over 25 ms (share)', [
          frames.filter((f) => f > 25).length / frames.length,
        ])
        add('6 camera', name, variant, 'main-thread script per frame (ms)', [
          result.script / frames.length,
        ])
        add('6 camera', name, variant, 'main-thread tasks per frame (ms)', [
          result.task / frames.length,
        ])
        add('6 camera', name, variant, 'move events where the map is behind (share)', [
          behind / Math.max(1, moves),
        ])
      })
    }
  },

  /** 7. The highlight moves to another feature */
  async hover(react, raw) {
    for (const side of [react, raw]) {
      await withMap(side, { set: 'maid', hover: true }, async () => {
        for (const how of ['featureState', 'filter', 'data']) {
          const result = await measured(side, () =>
            side.page.evaluate(([h, n]) => window.__rmgl.hover(h, n), [how, steps(30)] as const),
          )
          const call = {
            featureState: 'setFeatureState',
            filter: side.name === 'react' ? 'filter prop' : 'setFilter',
            data:
              side.name === 'react' ? 'data prop of a small source' : 'setData of a small source',
          }[how]
          addSamples('7 hover highlight', how, `${side.name}, ${call}`, result)
        }
      })
    }
  },

  /** 8. The style is swapped, and the sources and layers come back */
  async style(react, raw) {
    const cases: Array<[Side, string, string]> = [
      [react, 'prop', 'react, mapStyle prop'],
      [raw, 'readd', 'raw, setStyle and add everything again'],
      [raw, 'keep', 'raw, setStyle with transformStyle keeping the layers'],
    ]
    for (const [side, how, variant] of cases) {
      await withMap(side, { set: 'maid' }, async () => {
        const result = await measured(side, () =>
          side.page.evaluate(([h, n]) => window.__rmgl.style(h, n), [how, steps(4)] as const),
        )
        add('8 style swap', 'Maid layers, dense data', variant, 'to ready (ms)', result.value)
        add(
          '8 style swap',
          'Maid layers, dense data',
          variant,
          'main-thread script per swap (ms)',
          [result.script / result.value.length],
        )
      })
    }
  },

  /** 9. Images are added to the style: each fires `styledata`, which every <Source> and <Layer> listens to */
  async images(react, raw, rep) {
    for (const side of [react, raw]) {
      await withMap(side, { set: 'maid' }, async () => {
        const result = await measured(side, () =>
          side.page.evaluate((n) => window.__rmgl.images(n), steps(30)),
        )
        addSamples('9 styledata', 'map.addImage, one per frame', side.name, result)
      })
    }
    // a burst: 30 images in one task, then the frame and the timers they cause
    for (const side of [react, raw]) {
      await withMap(side, { set: 'maid' }, async () => {
        for (let i = 0; i < steps(5); i++) {
          const result = await measured(side, () =>
            side.page.evaluate((n) => window.__rmgl.imageBurst(n), 30),
          )
          const caseName = 'map.addImage, 30 in one task'
          add('9 styledata', caseName, side.name, 'call blocks (ms)', [result.value.sync])
          add('9 styledata', caseName, side.name, 'to idle (ms)', [result.value.total])
          add('9 styledata', caseName, side.name, 'main-thread script per burst (ms)', [
            result.script,
          ])
        }
      })
    }
    if (rep > 0) return
    await withMap(react, { set: 'maid', count: true }, async () => {
      const perBurst = await react.page.evaluate(async () => {
        window.__rmgl.layerRenders()
        await window.__rmgl.imageBurst(30)
        return window.__rmgl.layerRenders()
      })
      add('9 styledata', 'map.addImage, 30 in one task', 'react', 'Layer renders per burst', [
        perBurst,
      ])
    })
    await withMap(react, { set: 'maid', count: true }, async () => {
      const perImage = await react.page.evaluate(async () => {
        window.__rmgl.layerRenders()
        await window.__rmgl.images(10)
        return window.__rmgl.layerRenders() / 10
      })
      add('9 styledata', 'map.addImage, one per frame', 'react', 'Layer renders per image', [
        perImage,
      ])
    })
  },
}

// ---- run ----------------------------------------------------------------------------------------------------

/** Paths the page asked this server for that are not there */
const missing = new Set<string>()

function serve() {
  const file = (root: string, path: string) => {
    const full = normalize(join(root, path))
    return full.startsWith(root) ? Bun.file(full) : undefined
  }
  return Bun.serve({
    hostname: '127.0.0.1',
    port: PORT,
    async fetch(request) {
      const path = decodeURIComponent(new URL(request.url).pathname)
      const found = path.startsWith('/fonts/')
        ? file(FONTS, path.slice('/fonts'.length))
        : file(DIST, path === '/' ? '/index.html' : path)
      if (!found || !(await found.exists())) {
        missing.add(path)
        return new Response('not found', { status: 404 })
      }
      return new Response(found)
    },
  })
}

const unknown = ONLY?.filter((name) => !(name in scenarios))
if (unknown?.length) {
  console.error(
    `Unknown scenario: ${unknown.join(', ')}. Known: ${Object.keys(scenarios).join(', ')}`,
  )
  process.exit(2)
}

console.log('Building the page and the data ...')
await build(DIST)
const prepared = prepare(join(DIST, 'data'))

// fixed port: Bun.serve throws when it is taken
const server = serve()
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const blocked: Record<string, number> = {}
const pageErrors: string[] = []
let failed = false
try {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 })
  await context.route(
    (url) => !['localhost', '127.0.0.1'].includes(url.hostname),
    (route) => {
      const host = new URL(route.request().url()).hostname
      blocked[host] = (blocked[host] ?? 0) + 1
      return route.abort()
    },
  )
  const open = async (name: Side['name']): Promise<Side> => {
    const page = await context.newPage()
    page.setDefaultTimeout(180_000)
    page.on('pageerror', (error) => pageErrors.push(`${name}: ${error.message}`))
    page.on('console', (message) => {
      // a 404 is listed by the server (`missing`): the shell's fonts have only some glyph ranges, as in Maid
      if (message.type() === 'error' && !message.text().includes('404'))
        pageErrors.push(`${name}: ${message.text()}`)
    })
    await page.goto(`${ORIGIN}/?mode=${name}`)
    await page.waitForFunction(() => window.__rmgl?.ready === true)
    const cdp = await context.newCDPSession(page)
    await cdp.send('Performance.enable')
    return { name, page, cdp }
  }
  const react = await open('react')
  const raw = await open('raw')
  // one map per tab that is not measured: the worker starts, the code is compiled
  for (const side of [react, raw]) await withMap(side, { set: 'maid' }, async () => {})

  const started = performance.now()
  for (let rep = 0; rep < REPS; rep++) {
    for (const [name, scenario] of Object.entries(scenarios)) {
      if (ONLY && !ONLY.includes(name)) continue
      const start = performance.now()
      await scenario(react, raw, rep)
      console.log(
        `  repetition ${rep + 1}/${REPS}  ${name}  ${Math.round(performance.now() - start)} ms`,
      )
    }
  }

  const summaries = [...rows.values()].map(summary)
  const report = {
    written: new Date().toISOString(),
    command: `bun run bench-rmgl ${argv.join(' ')}`.trim(),
    note: 'Medians over the repetitions. Repeat on a quiet machine before relying on a number.',
    versions: versions(),
    browser: `Chrome ${browser.version()} (headless)`,
    viewport: VIEWPORT,
    repetitions: REPS,
    quick: QUICK,
    seconds: Math.round((performance.now() - started) / 1000),
    fixture: prepared,
    blocked,
    missing: [...missing],
    pageErrors: [...new Set(pageErrors)].slice(0, 50),
    results: summaries,
    samples: [...rows.values()].map((row) => ({ ...row, samples: row.samples.map(round) })),
  }
  mkdirSync(join(ROOT, 'reports'), { recursive: true })
  writeFileSync(OUT, `${JSON.stringify(report, null, 1)}\n`)

  let last = ''
  for (const row of summaries) {
    if (row.scenario !== last) {
      console.log(`\n${row.scenario}`)
      last = row.scenario
    }
    console.log(
      `  ${row.case.padEnd(40)} ${row.variant.padEnd(52)} ${row.metric.padEnd(44)} ` +
        `median ${String(row.median).padStart(8)}  p95 ${String(row.p95).padStart(8)}  ` +
        `min ${String(row.min).padStart(8)}  max ${String(row.max).padStart(8)}  n ${row.n}`,
    )
  }
  if (missing.size > 0) console.log(`\nNot found on this server: ${[...missing].join(', ')}`)
  if (pageErrors.length > 0) {
    console.log(`\nErrors in the page (${pageErrors.length}):`)
    for (const line of [...new Set(pageErrors)].slice(0, 10)) console.log(`  ${line}`)
  }
  if (Object.keys(blocked).length > 0) {
    console.error(`\nFAIL: the page asked for other hosts: ${JSON.stringify(blocked)}`)
    failed = true
  }
  console.log(`\nWritten: ${OUT}`)
} catch (error) {
  console.error(error)
  failed = true
} finally {
  await browser.close()
  await server.stop(true)
}
process.exit(failed ? 1 : 0)
