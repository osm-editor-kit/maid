import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
/**
 * Benchmark runner. Drives every editor through the same scenarios and writes
 * reports/<run-id>/results.json plus screenshots.
 *
 *   bun run bench [--editor maid,id,rapid] [--scene small,medium,dense] [--repeat 3]
 *                 [--label text] [--maid-query "fill=full"] [--variant name]
 *                 [--app maid|bicycle|parking] [--maid-lens <lens id>] [--edit-reps 5]
 *
 * `--app` picks the Maid build that is measured (its production build, on the benchmark's port); iD and Rapid ignore it.
 * `--maid-lens` switches that lens on after load, through the lens store the app's lenses module reads, and the
 * variant of the Maid results says so (`lens-<id>`) unless `--variant` names it.
 * `--edit-reps` is how many times each edit interaction is measured after its warm-up (see the edit phases below).
 *
 * Starts the servers it needs. Blocks every non-localhost request (core rule 1) and
 * fails a run when an editor tries to reach OSM infrastructure.
 */
import {
  chromium,
  firefox,
  webkit,
  type Browser,
  type BrowserContext,
  type CDPSession,
  type Page,
} from '@playwright/test'
import { spawn, type Subprocess } from 'bun'
import { getScene, type Scene } from '../fixtures/scenes'
import { PORTS } from '../ports'
import { APPS, takeApp, type AppName } from './args'
import { installProbe, type Recording } from './probe-page'
import { median, quantile, summarizeFrames, type FrameSummary } from './stats'

const ROOT = join(import.meta.dir, '../..')
const VIEWPORT = { width: 1600, height: 1000 }
const OSM_HOSTS = /(^|\.)(openstreetmap\.(org|de|fr)|osm\.org|overpass-api\.de|osmfoundation\.org)$/
/** One phase of a run (load, pan, zoom, hover, select, drag) may take this long before the run is given up */
const PHASE_LIMIT_MS = 60_000
/** The whole run, as a backstop for anything the phase limits do not cover */
const RUN_LIMIT_MS = 300_000

type Editor = 'maid' | 'id' | 'rapid'
type Phase = FrameSummary & { cpuMs: number; settleMs: number }

/**
 * One edit interaction measured N times: milliseconds from its input (a pointer event, or the editor call) to the first
 * draw of the map that shows the change. The warm-up is not in `samples`. `missed` counts the repetitions that no draw
 * showed within the timeout. Nothing is filled in for a value that was not measured.
 */
export type EditSamples = {
  reps: number
  samples: number[]
  /** Latency in ms (the frame summary of the same phase has its own medianMs, p95Ms and maxMs) */
  latencyMedianMs?: number
  latencyP95Ms?: number
  latencyMaxMs?: number
  missed: number
  /** The feature the interaction was made on: one id, or the ids of the roads it cycled through */
  target?: string
}

/** An edit interaction with the frames, main-thread work and settle time of its whole measured loop */
export type EditRun = Phase & EditSamples

export type RunResult = {
  editor: Editor
  variant: string
  /** The Maid app that was measured (maid editor only) */
  app?: AppName
  /** The lens switched on after load (maid editor, `--maid-lens`) */
  lens?: string
  /** Edit phases that did not run for this editor, with the reason: the report shows "not measured" */
  notMeasured?: Record<string, string>
  scene: string
  repeat: number
  ok: boolean
  error?: string
  /** Set when a phase did not finish: the phase, the page's own state (`window.__maid.debug()`, or `{ error }` if it did not answer), and the console warnings and errors so far */
  stuck?: { phase: string; limitSeconds: number; page: unknown; console: string[] }
  /** Marker images the editor could not draw (bench: the run fails, the numbers would look better than they are) */
  imageFailures?: { id: string; reason: string }[]
  version?: string
  gpu?: string
  load?: { readyMs: number; settledMs: number; cpuMs: number }
  stats?: unknown
  panCold?: Phase
  panWarm?: Phase
  zoomIn?: Phase
  zoomOut?: Phase
  hoverSweep?: FrameSummary & { cpuMs: number; distinctHovered: number }
  hoverLatencyMs?: number[]
  selectMs?: number[]
  /** Real mouse drag of a road junction vertex in a small circle for two seconds */
  dragVertex?: FrameSummary & {
    cpuMs: number
    settleMs: number
    node: string
    movedMetres: number
    tries: number
  }
  /** Edit latency, from a real pointer move: 20 steps of one drag of a vertex, per repetition */
  dragNode?: EditRun
  /** A tag set through the editor's own edit path, with a way selected */
  tagEdit?: EditRun
  /** Undo and redo of those tag edits */
  undoRedo?: Phase & { undo: EditSamples; redo: EditSamples }
  /** A real click on a road until the editor shows it selected in the inspector and has drawn it */
  selectLatency?: EditRun
  heapMb?: number
  blocked: Record<string, number>
  screenshots: Record<string, string>
}

/** The pointer events of the edit phases, counted in the page. `moves`/`ups` count all of them since the page loaded. */
type EditProbe = {
  moves: number
  move: { count: number; ts: number; seq: number }
  ups: number
  up: { count: number; ts: number; seq: number }
}

declare global {
  interface Window {
    __edit?: EditProbe
  }
}

function args() {
  const get = (name: string, fallback: string) => {
    const i = process.argv.indexOf(`--${name}`)
    return i > -1 ? process.argv[i + 1]! : fallback
  }
  // removes `--app` from argv, so the other options keep their place
  const app = takeApp()
  return {
    editors: get('editor', 'maid,id,rapid').split(',') as Editor[],
    scenes: get('scene', 'small,medium,dense').split(','),
    repeat: Number(get('repeat', '3')),
    label: get('label', ''),
    app,
    maidLens: get('maid-lens', ''),
    editReps: Number(get('edit-reps', '5')),
    maidQuery: get('maid-query', ''),
    idQuery: get('id-query', ''),
    // iD's host page runs without the name-suggestion-index, so Rapid does too by default
    rapidQuery: get('rapid-query', 'nsi=0'),
    variant: get('variant', 'default'),
    dpr: Number(get('dpr', '2')),
    /** chromium (system Chrome), firefox or webkit (Playwright's builds). Main-thread work and heap are Chrome only. */
    browser: get('browser', 'chromium') as 'chromium' | 'firefox' | 'webkit',
  }
}

async function portOpen(port: number) {
  try {
    await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(1000) })
    return true
  } catch {
    return false
  }
}

async function ensureServer(name: string, port: number, cmd: string[], started: Subprocess[]) {
  if (await portOpen(port)) return
  console.log(`starting ${name} on :${port}`)
  started.push(spawn(cmd, { cwd: ROOT, stdout: 'ignore', stderr: 'inherit' }))
  for (let i = 0; i < 100; i++) {
    if (await portOpen(port)) return
    await Bun.sleep(200)
  }
  throw new Error(`${name} did not come up on port ${port}`)
}

/** Ways near the scene centre that a pointer can hover: [id, lng, lat] of a point on the way */
async function hoverTargets(scene: Scene) {
  const gz = await Bun.file(join(ROOT, `fixtures/${scene.name}.json.gz`)).arrayBuffer()
  const { elements } = JSON.parse(new TextDecoder().decode(Bun.gunzipSync(new Uint8Array(gz)))) as {
    elements: any[]
  }
  const nodes = new Map<number, [number, number]>()
  for (const e of elements) if (e.type === 'node') nodes.set(e.id, [e.lon, e.lat])
  const mPerPx = (156543.03 * Math.cos((scene.center[1] * Math.PI) / 180)) / 2 ** scene.zoom
  const maxDx =
    ((VIEWPORT.width / 2 - 150) * mPerPx) / (111320 * Math.cos((scene.center[1] * Math.PI) / 180))
  const maxDy = ((VIEWPORT.height / 2 - 150) * mPerPx) / 110540
  const candidates: { id: string; lng: number; lat: number; length: number }[] = []
  for (const e of elements) {
    if (
      e.type !== 'way' ||
      !e.tags?.highway ||
      !/^(residential|tertiary|secondary|primary|living_street|unclassified)$/.test(e.tags.highway)
    )
      continue
    if (e.nodes.length < 3) continue
    const mid = Math.floor(e.nodes.length / 2)
    const a = nodes.get(e.nodes[mid - 1])
    const b = nodes.get(e.nodes[mid])
    if (!a || !b) continue
    const lng = (a[0] + b[0]) / 2
    const lat = (a[1] + b[1]) / 2
    if (Math.abs(lng - scene.center[0]) > maxDx || Math.abs(lat - scene.center[1]) > maxDy) continue
    candidates.push({ id: `w${e.id}`, lng, lat, length: e.nodes.length })
  }
  candidates.sort((x, y) => y.length - x.length)
  return candidates.slice(0, 8)
}

/** Junction nodes of two or more roads near the scene centre: drawn as vertices by every editor */
async function vertexTargets(scene: Scene) {
  const gz = await Bun.file(join(ROOT, `fixtures/${scene.name}.json.gz`)).arrayBuffer()
  const { elements } = JSON.parse(new TextDecoder().decode(Bun.gunzipSync(new Uint8Array(gz)))) as {
    elements: any[]
  }
  const uses = new Map<number, number>()
  for (const e of elements) {
    if (
      e.type !== 'way' ||
      !/^(residential|tertiary|secondary|living_street|unclassified|service)$/.test(
        e.tags?.highway ?? '',
      )
    )
      continue
    for (const n of new Set<number>(e.nodes)) uses.set(n, (uses.get(n) ?? 0) + 1)
  }
  const out: { id: string; lng: number; lat: number; d: number }[] = []
  for (const e of elements) {
    if (e.type !== 'node' || (uses.get(e.id) ?? 0) < 2 || e.tags) continue
    const d = Math.hypot(
      (e.lon - scene.center[0]) * Math.cos((e.lat * Math.PI) / 180),
      e.lat - scene.center[1],
    )
    out.push({ id: `n${e.id}`, lng: e.lon, lat: e.lat, d })
  }
  return out.sort((a, b) => a.d - b.d).slice(2, 12)
}

async function cpuMs(cdp: CDPSession | undefined) {
  if (!cdp) return Number.NaN
  const { metrics } = await cdp.send('Performance.getMetrics')
  return (metrics.find((m) => m.name === 'TaskDuration')?.value ?? 0) * 1000
}

async function recordPhase(
  page: Page,
  cdp: CDPSession | undefined,
  action: () => Promise<void>,
): Promise<Phase> {
  const cpu0 = await cpuMs(cdp)
  await page.evaluate(() => window.__probe.start())
  await action()
  const rec: Recording = await page.evaluate(() => window.__probe.stop())
  const cpu1 = await cpuMs(cdp)
  const settleMs = await page.evaluate(async () => {
    const t = performance.now()
    await window.__bench.settled()
    return performance.now() - t
  })
  return {
    ...summarizeFrames(rec.frames, rec.longTasks, rec.durationMs),
    cpuMs: Math.round(cpu1 - cpu0),
    settleMs: Math.round(settleMs),
  }
}

/**
 * Runs in the page, once per page. Records every pointer move and release in the window's capture phase, so the time
 * and the draw count are taken before the editor handles the event. Everything else about the event is left alone.
 */
function pageInstallEditProbe() {
  if (window.__edit) return
  const probe: EditProbe = {
    moves: 0,
    move: { count: 0, ts: 0, seq: 0 },
    ups: 0,
    up: { count: 0, ts: 0, seq: 0 },
  }
  window.__edit = probe
  window.addEventListener(
    'pointermove',
    (event) => {
      probe.moves++
      probe.move = { count: probe.moves, ts: event.timeStamp, seq: window.__bench.paint().seq }
    },
    true,
  )
  window.addEventListener(
    'pointerup',
    (event) => {
      probe.ups++
      probe.up = { count: probe.ups, ts: event.timeStamp, seq: window.__bench.paint().seq }
    },
    true,
  )
}

/** One change to time. `pointer`: the Node side has sent the event (its count before the send is `before`). */
type EditStep = {
  action: 'setTag' | 'undo' | 'redo' | 'pointer'
  /** The feature the change is about */
  id: string
  key?: string
  value?: string
  pointer?: 'move' | 'up'
  before?: number
  /**
   * What the change must show before its draw counts: nothing (a call changes the data when it returns), a node moved
   * from `prev`, or the feature selected with its inspector drawn
   */
  check: 'none' | 'moved' | 'selected'
  prev?: [number, number]
  timeoutMs: number
}

type EditStepResult = { ms: number; loc?: [number, number] } | { missed: string }

/**
 * Runs in the page. Times one change from its input to the first draw that shows it. The input is the editor call
 * (the draw count and the time are taken just before it), or the pointer event that arrived (taken when it arrived).
 * The draw counts when the change is in the editor and the draw came after the input. Resolves with the time of
 * that draw, or with `missed` when none came within the timeout. Frame-driven: it looks once per frame.
 */
function pageEditStep(step: EditStep): Promise<EditStepResult> {
  return new Promise<EditStepResult>((resolve) => {
    const bench = window.__bench
    const started = performance.now()
    let mark: { ts: number; seq: number } | undefined
    if (step.action !== 'pointer') {
      mark = { seq: bench.paint().seq, ts: performance.now() }
      if (step.action === 'setTag') bench.setTag(step.id, step.key!, step.value)
      else if (step.action === 'undo') bench.undo()
      else bench.redo()
    }
    let loc: [number, number] | undefined = step.prev
    const frame = () => {
      if (!mark && window.__edit) {
        const probe = window.__edit
        if (
          step.pointer === 'up' ? probe.ups > (step.before ?? 0) : probe.moves > (step.before ?? 0)
        ) {
          const arrived = step.pointer === 'up' ? probe.up : probe.move
          mark = { ts: arrived.ts, seq: arrived.seq }
        }
      }
      if (mark) {
        let ready = true
        if (step.check === 'moved') {
          const now = bench.nodeLoc(step.id)
          if (now) loc = [now[0], now[1]]
          ready = !!now && (!step.prev || now[0] !== step.prev[0] || now[1] !== step.prev[1])
        } else if (step.check === 'selected') {
          ready = bench.selected().includes(step.id) && bench.inspectorShows(step.id)
        }
        const paint = bench.paint()
        if (ready && paint.seq > mark.seq) {
          return resolve({ ms: paint.at - mark.ts, loc: step.check === 'moved' ? loc : undefined })
        }
      }
      if (performance.now() - started > step.timeoutMs) {
        return resolve({
          missed: mark
            ? `${step.check === 'none' ? 'the change' : step.check} not drawn within ${step.timeoutMs} ms`
            : `the ${step.pointer ?? 'call'} input did not arrive within ${step.timeoutMs} ms`,
        })
      }
      requestAnimationFrame(frame)
    }
    frame()
  })
}

/**
 * Runs one timed step in the page. The step is typed here, so the literal types in the call ('setTag', 'moved' ...)
 * are not widened to string by Playwright's argument inference.
 */
function runStep(page: Page, step: EditStep): Promise<EditStepResult> {
  return page.evaluate(pageEditStep, step)
}

/** The summary of the measured repetitions: median, p95 and max in ms, the samples kept in the order measured */
function samplesOf(samples: number[], reps: number, missed: number, target?: string): EditSamples {
  const r = (n: number) => Math.round(n * 10) / 10
  return {
    reps,
    samples: samples.map(r),
    missed,
    target,
    ...(samples.length
      ? {
          latencyMedianMs: r(median(samples)),
          latencyP95Ms: r(quantile(samples, 0.95)),
          latencyMaxMs: r(Math.max(...samples)),
        }
      : {}),
  }
}

/** The context of the run in progress, and its phase: the run's backstop closes the one and names the other */
let openContext: BrowserContext | undefined
let lastPhase = ''

/**
 * Waits for a call to a page that may never answer (a stuck main thread answers no call). Resolves with the
 * call's value, or with `{ error }` after `ms`. The call itself is left behind.
 */
function bounded<T>(work: Promise<T>, ms: number): Promise<T | { error: string }> {
  return Promise.race([
    work.catch((error: unknown) => ({ error: String(error).slice(0, 300) })),
    Bun.sleep(ms).then(() => ({ error: `no answer within ${ms / 1000} s` })),
  ])
}

async function runOnce(
  browser: Browser,
  editor: Editor,
  scene: Scene,
  repeat: number,
  outDir: string,
  opts: ReturnType<typeof args>,
) {
  // a lens with no variant named: the Maid results say which lens they were measured with
  const variant =
    editor === 'maid' && opts.maidLens && opts.variant === 'default'
      ? `lens-${opts.maidLens}`
      : opts.variant
  const result: RunResult = {
    editor,
    variant,
    ...(editor === 'maid' ? { app: opts.app } : {}),
    scene: scene.name,
    repeat,
    ok: false,
    blocked: {},
    screenshots: {},
  }
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: opts.dpr,
    bypassCSP: true,
  })
  await context.route(
    (url) => !['localhost', '127.0.0.1'].includes(url.hostname),
    (route) => {
      const host = new URL(route.request().url()).hostname
      result.blocked[host] = (result.blocked[host] ?? 0) + 1
      return route.abort()
    },
  )
  await context.addInitScript(installProbe)
  const page = await context.newPage()
  page.setDefaultTimeout(90_000) // a hanging editor fails its run instead of blocking the benchmark
  openContext = context
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const consoleLines: string[] = []
  page.on('console', (message) => {
    if ((message.type() === 'warning' || message.type() === 'error') && consoleLines.length < 30)
      consoleLines.push(`${message.type()}: ${message.text()}`.slice(0, 300))
  })
  const cdp = opts.browser === 'chromium' ? await context.newCDPSession(page) : undefined
  await cdp?.send('Performance.enable')
  // Every phase has PHASE_LIMIT_MS. A phase that runs over is given up: the page is asked what it holds, a
  // screenshot is kept, and the context is closed, so the call the phase waits on fails and the run is recorded
  // as stuck in that phase. A stuck page answers no calls, so nothing here waits on the page without a bound.
  let watchdog: ReturnType<typeof setTimeout> | undefined
  let stuckPhase: string | undefined
  const giveUp = async (name: string) => {
    stuckPhase = name
    const state = await bounded(
      page.evaluate(() => window.__maid?.debug?.() ?? null),
      5_000,
    )
    result.stuck = {
      phase: name,
      limitSeconds: PHASE_LIMIT_MS / 1000,
      page: state,
      console: [...consoleLines],
    }
    await bounded(
      page.screenshot({
        path: join(outDir, `stuck-${editor}-${opts.variant}-${scene.name}-${repeat}.png`),
        timeout: 10_000,
      }),
      15_000,
    )
    console.log(
      `  [${editor} ${scene.name} #${repeat}] phase "${name}" did not finish within ${PHASE_LIMIT_MS / 1000} s; page: ${JSON.stringify(state).slice(0, 2000)}`,
    )
    await bounded(context.close(), 10_000)
  }
  // BENCH_DEBUG=1 also prints each phase as it starts, to see where a run hangs
  const enter = (name: string) => {
    lastPhase = name
    if (process.env.BENCH_DEBUG) console.log(`  [${editor} ${scene.name} #${repeat}] ${name}`)
    clearTimeout(watchdog)
    watchdog = setTimeout(() => void giveUp(name), PHASE_LIMIT_MS)
  }
  const shot = async (name: string) => {
    const file = `${editor}-${opts.variant}-${scene.name}-${name}.png`
    if (repeat === 0) await page.screenshot({ path: join(outDir, file) })
    result.screenshots[name] = file
  }
  try {
    const port = editor === 'maid' ? PORTS.maidBuild : PORTS[editor]
    const [lng, lat] = scene.center
    const extra =
      editor === 'maid' ? opts.maidQuery : editor === 'id' ? opts.idQuery : opts.rapidQuery
    const query = extra ? `&${extra}` : ''
    const start = { lng, lat, zoom: scene.zoom }

    enter('load')
    // --- Load: from navigation to a complete picture ---
    const t0 = performance.now()
    await page.goto(
      `http://localhost:${port}/?scene=${scene.name}${query}#map=${scene.zoom}/${lat}/${lng}`,
    )
    await page.waitForFunction(() => window.__bench !== undefined, undefined, { timeout: 60000 })
    await page.evaluate(() => window.__bench.ready())
    const readyMs = performance.now() - t0
    await page.evaluate(() => window.__bench.settled())
    result.load = {
      readyMs: Math.round(readyMs),
      settledMs: Math.round(performance.now() - t0),
      cpuMs: Math.round(await cpuMs(cdp)),
    }
    result.version = await page.evaluate(() => window.__bench.version)
    result.gpu = await page.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl2')
      const ext = gl?.getExtension('WEBGL_debug_renderer_info')
      return ext ? String(gl!.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown'
    })
    result.stats = await page.evaluate(() => window.__bench.stats())
    await shot('load')
    if (editor === 'maid' && opts.maidLens) {
      // switched on the way a person does it: the lens store, which the engine follows. Checked: a lens the app does not
      // have would leave the map in its default look, and the run would measure that without saying so.
      await page.evaluate((id) => window.__bench.setLens?.(id), opts.maidLens)
      await page.evaluate(() => window.__bench.settled())
      const active = await page.evaluate(() => window.__maid?.engine.lens?.id ?? null)
      if (active !== opts.maidLens) {
        throw new Error(
          `lens "${opts.maidLens}" is not on the map after switching it on (${active ?? 'no lens'} is): this app may not have it`,
        )
      }
      result.lens = opts.maidLens
    }

    enter('pan')
    // --- Pan: a real mouse drag into data that is not loaded yet (cold), then back (warm) ---
    // Real input on purpose: iD and Rapid move a stale picture while dragging and redraw later,
    // and only a real gesture goes through that path.
    const mPerPx = (156543.03 * Math.cos((lat * Math.PI) / 180)) / 2 ** scene.zoom
    const halfW = ((scene.bbox[2] - scene.bbox[0]) / 2) * 111320 * Math.cos((lat * Math.PI) / 180)
    const halfH = ((scene.bbox[3] - scene.bbox[1]) / 2) * 110540
    const dx = Math.round(Math.min(1100, Math.max(0, halfW / mPerPx - VIEWPORT.width / 2 - 30)))
    const dy = Math.round(Math.min(700, Math.max(0, halfH / mPerPx - VIEWPORT.height / 2 - 30)))
    const drag =
      (fromX: number, fromY: number, toX: number, toY: number, ms: number) => async () => {
        await page.mouse.move(fromX, fromY)
        await page.mouse.down()
        const t = performance.now()
        for (;;) {
          const k = Math.min(1, (performance.now() - t) / ms)
          await page.mouse.move(fromX + (toX - fromX) * k, fromY + (toY - fromY) * k)
          if (k >= 1) break
          await page.waitForTimeout(8)
        }
        await page.waitForTimeout(150) // rest before release, so that no editor adds a fling
        await page.mouse.up()
      }
    // start where nothing is under the pointer: iD and Rapid drag a vertex if there is one
    let grab = { x: VIEWPORT.width / 2 + dx / 2, y: VIEWPORT.height / 2 - dy / 2 }
    for (let i = 0; i < 25; i++) {
      const candidate = { x: grab.x + ((i * 37) % 120) - 60, y: grab.y + ((i * 53) % 120) - 60 }
      await page.mouse.move(candidate.x, candidate.y)
      await page.waitForTimeout(120)
      if ((await page.evaluate(() => window.__bench.hovered())).length === 0) {
        grab = candidate
        break
      }
    }
    result.panCold = await recordPhase(
      page,
      cdp,
      drag(grab.x, grab.y, grab.x - dx, grab.y + dy, 3000),
    )
    result.panWarm = await recordPhase(
      page,
      cdp,
      drag(grab.x - dx, grab.y + dy, grab.x, grab.y, 3000),
    )
    await page.evaluate((c) => window.__bench.setCamera(c), start)
    await page.evaluate(() => window.__bench.settled())

    enter('zoom')
    // --- Zoom with the mouse wheel: in two levels, then back out ---
    const wheel = (direction: 1 | -1, target: number) => async () => {
      await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height / 2)
      const t = performance.now()
      while (performance.now() - t < 5000) {
        await page.mouse.wheel(0, -40 * direction)
        await page.waitForTimeout(12)
        const zoom = await page.evaluate(() => window.__bench.getCamera().zoom)
        if (direction > 0 ? zoom >= target : zoom <= target) break
      }
    }
    result.zoomIn = await recordPhase(page, cdp, wheel(1, scene.zoom + 2))
    await page.evaluate((c) => window.__bench.setCamera(c), { ...start, zoom: scene.zoom + 2 })
    await page.evaluate(() => window.__bench.settled())
    await shot('zoom')
    result.zoomOut = await recordPhase(page, cdp, wheel(-1, scene.zoom))
    await page.evaluate((c) => window.__bench.setCamera(c), start)
    await page.evaluate(() => window.__bench.settled())

    enter('hover')
    // --- Hover: latency on known ways, then a sweep across the map ---
    const targets = await hoverTargets(scene)
    result.hoverLatencyMs = []
    for (const target of targets) {
      const pos = await page.evaluate(([x, y]) => window.__bench.project(x, y), [
        target.lng,
        target.lat,
      ] as const)
      // park the pointer where nothing is hovered
      for (const [x, y] of [
        [3, 3],
        [VIEWPORT.width - 3, 3],
        [3, VIEWPORT.height - 3],
      ] as const) {
        await page.mouse.move(x, y)
        await page.waitForTimeout(200)
        if ((await page.evaluate(() => window.__bench.hovered())).length === 0) break
      }
      const latency = page.evaluate(() => window.__probe.hoverLatency())
      await page.mouse.move(pos.x, pos.y)
      result.hoverLatencyMs.push(Math.round((await latency) * 10) / 10)
    }
    const hoveredIds = new Set<string>()
    const cpu0 = await cpuMs(cdp)
    await page.evaluate(() => window.__probe.start())
    for (let i = 0; i <= 90; i++) {
      await page.mouse.move(
        100 + (i / 90) * (VIEWPORT.width - 200),
        VIEWPORT.height / 2 + Math.sin(i / 6) * 250,
      )
      await page.waitForTimeout(25)
      if (i % 5 === 0)
        for (const id of await page.evaluate(() => window.__bench.hovered())) hoveredIds.add(id)
    }
    const sweep: Recording = await page.evaluate(() => window.__probe.stop())
    result.hoverSweep = {
      ...summarizeFrames(sweep.frames, sweep.longTasks, sweep.durationMs),
      cpuMs: Math.round((await cpuMs(cdp)) - cpu0),
      distinctHovered: hoveredIds.size,
    }
    await page.mouse.move(3, 3)

    enter('select')
    // --- Select: until the selection is drawn ---
    result.selectMs = []
    for (const target of targets.slice(0, 4)) {
      const ms = await page.evaluate(async (id) => {
        const t = performance.now()
        await window.__bench.select(id)
        await new Promise((resolve) => requestAnimationFrame(resolve))
        return performance.now() - t
      }, target.id)
      result.selectMs.push(Math.round(ms * 10) / 10)
      if (target === targets[0]) await shot('select')
      await page.evaluate(() => window.__bench.select(null))
    }

    enter('drag')
    // --- Edit: drag a road junction with the real mouse ---
    if (await page.evaluate(() => typeof window.__bench.nodeLoc === 'function')) {
      let tries = 0
      for (const target of await vertexTargets(scene)) {
        tries++
        const before = await page.evaluate((id) => window.__bench.nodeLoc(id), target.id)
        if (!before) continue
        // one level closer and centred on the vertex: at the scene's zoom neighbouring vertices
        // are so close that Rapid picks up a different one
        await page.mouse.move(3, 3)
        await page.evaluate(
          ([c, z]) => window.__bench.setCamera({ lng: c[0], lat: c[1], zoom: z }),
          [before, scene.zoom + 1] as const,
        )
        await page.evaluate(() => window.__bench.settled())
        const pos = await page.evaluate(([x, y]) => window.__bench.project(x, y), before)
        await page.mouse.move(pos.x - 30, pos.y - 30)
        await page.mouse.move(pos.x, pos.y, { steps: 5 })
        await page.waitForTimeout(250)
        // Alt: iD otherwise snaps the vertex to whatever is under the pointer and may merge it
        await page.keyboard.down('Alt')
        const phase = await recordPhase(page, cdp, async () => {
          await page.mouse.down()
          const t = performance.now()
          for (;;) {
            const k = Math.min(1, (performance.now() - t) / 2000)
            const angle = k * Math.PI * 3
            await page.mouse.move(
              pos.x + Math.sin(angle) * 40 + k * 20,
              pos.y + (1 - Math.cos(angle)) * 25,
            )
            if (k >= 1) break
            await page.waitForTimeout(8)
          }
          await page.waitForTimeout(100)
          await page.mouse.up()
        })
        await page.keyboard.up('Alt')
        const after = await page.evaluate((id) => window.__bench.nodeLoc(id), target.id)
        const movedMetres = after
          ? Math.hypot(
              (after[0] - before[0]) * 111320 * Math.cos((before[1] * Math.PI) / 180),
              (after[1] - before[1]) * 110540,
            )
          : 0
        if (movedMetres > 1) {
          result.dragVertex = {
            ...phase,
            node: target.id,
            movedMetres: Math.round(movedMetres * 10) / 10,
            tries,
          }
          await shot('drag')
          break
        }
        await page.keyboard.press('Escape')
        await page.evaluate(() => window.__bench.select(null)).catch(() => {})
        if (tries >= 6) break
      }
    }

    // --- Edit latency, all editors (EditSamples): from an input, or from an editor call, to the first draw of the map
    // that shows the change. Each interaction runs once as a warm-up, which is not measured, then `--edit-reps`
    // times. The frames and the main-thread work are recorded over the measured repetitions only.
    await page.evaluate(pageInstallEditProbe)
    const reps = opts.editReps
    const notMeasured: Record<string, string> = {}

    enter('dragNode')
    // Input to paint for every step of a drag: the vertex the drag phase moved is pressed, moved 20 times by 3 px and
    // released. The side alternates from one repetition to the next, so the vertex stays near where it was.
    if (!result.dragVertex) {
      notMeasured.dragNode = 'the drag phase moved no road junction, so there is no vertex to drag'
    } else {
      const node = result.dragVertex.node
      const dragSamples: number[] = []
      let dragMissed = 0
      const at0 = await page.evaluate((id) => window.__bench.nodeLoc(id), node)
      if (!at0) {
        notMeasured.dragNode = `node ${node} is not in the editor's data`
      } else {
        // one level closer and centred on the vertex, as the drag phase does
        await page.mouse.move(3, 3)
        await page.evaluate(
          ([c, z]) => window.__bench.setCamera({ lng: c[0], lat: c[1], zoom: z }),
          [at0, scene.zoom + 1] as const,
        )
        await page.evaluate(() => window.__bench.settled())
        const dragOnce = async (rep: number, record: boolean) => {
          const loc = await page.evaluate((id) => window.__bench.nodeLoc(id), node)
          if (!loc) return
          const pos = await page.evaluate(([x, y]) => window.__bench.project(x, y), loc)
          const side = rep % 2 === 0 ? 1 : -1
          await page.mouse.move(pos.x, pos.y)
          await page.waitForTimeout(120)
          await page.mouse.down()
          let prev: [number, number] = loc
          for (let i = 1; i <= 20; i++) {
            const before = await page.evaluate(() => window.__edit?.moves ?? 0)
            await page.mouse.move(pos.x + side * i * 3, pos.y)
            const step = await runStep(page, {
              action: 'pointer',
              id: node,
              pointer: 'move',
              before,
              check: 'moved',
              prev,
              timeoutMs: 1000,
            })
            if ('missed' in step) {
              if (record) dragMissed++
            } else {
              if (record) dragSamples.push(step.ms)
              if (step.loc) prev = step.loc
            }
          }
          await page.waitForTimeout(150) // rest before release, so that no editor adds a fling
          await page.mouse.up()
        }
        await page.keyboard.down('Alt') // as the drag phase: iD would otherwise snap the vertex to what is under it
        await dragOnce(-1, false)
        const phase = await recordPhase(page, cdp, async () => {
          for (let rep = 0; rep < reps; rep++) await dragOnce(rep, true)
        })
        await page.keyboard.up('Alt')
        result.dragNode = { ...phase, ...samplesOf(dragSamples, reps, dragMissed, node) }
      }
    }

    enter('tagEdit')
    // A tag set through the editor's own edit path, with a way selected. The way is the first road near the centre.
    const way = targets[0]
    const noRoad = 'no road near the centre of the scene'
    if (!way) {
      notMeasured.tagEdit = noRoad
      notMeasured.undoRedo = noRoad
    } else {
      // selected through the editor's own selection path: the click itself is measured by selectLatency
      await page.evaluate((id) => window.__bench.select(id), way.id)
      const tagSamples: number[] = []
      let tagMissed = 0
      // the name alternates, so that each edit changes the way; the warm-up writes a third value
      const setName = async (rep: number, record: boolean) => {
        const value = rep < 0 ? 'Bench W' : rep % 2 === 0 ? 'Bench A' : 'Bench B'
        const step = await runStep(page, {
          action: 'setTag',
          id: way.id,
          key: 'name',
          value,
          check: 'none',
          timeoutMs: 2000,
        })
        if ('missed' in step) {
          if (record) tagMissed++
        } else if (record) tagSamples.push(step.ms)
      }
      await setName(-1, false)
      const tagPhase = await recordPhase(page, cdp, async () => {
        for (let rep = 0; rep < reps; rep++) await setName(rep, true)
      })
      result.tagEdit = { ...tagPhase, ...samplesOf(tagSamples, reps, tagMissed, way.id) }

      enter('undoRedo')
      // undo and redo of the last tag edit, one after the other: the state is the same after each pair
      const undoSamples: number[] = []
      const redoSamples: number[] = []
      let undoMissed = 0
      let redoMissed = 0
      const undoRedoOnce = async (record: boolean) => {
        const undo = await runStep(page, {
          action: 'undo',
          id: way.id,
          check: 'none',
          timeoutMs: 2000,
        })
        if ('missed' in undo) {
          if (record) undoMissed++
        } else if (record) undoSamples.push(undo.ms)
        const redo = await runStep(page, {
          action: 'redo',
          id: way.id,
          check: 'none',
          timeoutMs: 2000,
        })
        if ('missed' in redo) {
          if (record) redoMissed++
        } else if (record) redoSamples.push(redo.ms)
      }
      await undoRedoOnce(false)
      const undoPhase = await recordPhase(page, cdp, async () => {
        for (let rep = 0; rep < reps; rep++) await undoRedoOnce(true)
      })
      result.undoRedo = {
        ...undoPhase,
        undo: samplesOf(undoSamples, reps, undoMissed, way.id),
        redo: samplesOf(redoSamples, reps, redoMissed, way.id),
      }
    }

    enter('selectLatency')
    // A real click on a road: the pointer goes to the road, presses and releases. Measured until the editor has the
    // feature selected, its inspector holds it, and a draw came after the release. Roads cycle through the same list in
    // every editor (the ids come from the fixture).
    if (targets.length === 0) {
      notMeasured.selectLatency = 'no road near the centre of the scene'
    } else {
      await page.evaluate(() => window.__bench.select(null))
      await page.evaluate((c) => window.__bench.setCamera(c), start)
      await page.evaluate(() => window.__bench.settled())
      const clickSamples: number[] = []
      let clickMissed = 0
      const clickOnce = async (rep: number, record: boolean) => {
        const target = targets[Math.max(rep, 0) % targets.length]!
        await page.evaluate(() => window.__bench.select(null))
        const pos = await page.evaluate(([lng, lat]) => window.__bench.project(lng, lat), [
          target.lng,
          target.lat,
        ] as const)
        await page.mouse.move(pos.x, pos.y)
        await page.waitForTimeout(150) // the pointer rests on the road first, as a person's would
        const before = await page.evaluate(() => window.__edit?.ups ?? 0)
        await page.mouse.down()
        await page.mouse.up()
        const step = await runStep(page, {
          action: 'pointer',
          id: target.id,
          pointer: 'up',
          before,
          check: 'selected',
          timeoutMs: 2000,
        })
        if ('missed' in step) {
          if (record) clickMissed++
        } else if (record) clickSamples.push(step.ms)
      }
      await clickOnce(-1, false)
      const clickPhase = await recordPhase(page, cdp, async () => {
        for (let rep = 0; rep < reps; rep++) await clickOnce(rep, true)
      })
      await page.evaluate(() => window.__bench.select(null))
      result.selectLatency = {
        ...clickPhase,
        ...samplesOf(
          clickSamples,
          reps,
          clickMissed,
          targets
            .slice(0, 4)
            .map((t) => t.id)
            .join(' '),
        ),
      }
    }
    if (Object.keys(notMeasured).length) result.notMeasured = notMeasured

    if (editor === 'maid') {
      // a marker image that was not drawn makes the picture differ from the other runs: such a run fails
      const debug = await page.evaluate(() => window.__maid?.debug?.())
      const images = (debug as { images?: { failed?: { id: string; reason: string }[] } } | null)
        ?.images
      const failed = images?.failed ?? []
      if (failed.length) {
        result.imageFailures = failed
        throw new Error(
          `${failed.length} marker image(s) not drawn: ${failed.map((f) => `${f.id} (${f.reason})`).join('; ')}`,
        )
      }
    }

    if (cdp) {
      await cdp.send('HeapProfiler.collectGarbage')
      const { metrics } = await cdp.send('Performance.getMetrics')
      result.heapMb =
        Math.round((metrics.find((m) => m.name === 'JSHeapUsedSize')?.value ?? 0) / 1e5) / 10
    }
    result.ok = true
  } catch (error) {
    result.error = stuckPhase
      ? `phase "${stuckPhase}" did not finish within ${PHASE_LIMIT_MS / 1000} s`
      : String(error).slice(0, 500)
    if (!stuckPhase)
      await page
        .screenshot({
          path: join(outDir, `error-${editor}-${scene.name}-${repeat}.png`),
          timeout: 10_000,
        })
        .catch(() => {})
  }
  clearTimeout(watchdog)
  if (errors.length)
    result.error = [result.error, ...errors.slice(0, 3)].filter(Boolean).join(' | ')
  const osmHosts = Object.keys(result.blocked).filter((host) => OSM_HOSTS.test(host))
  if (osmHosts.length) {
    result.ok = false
    result.error =
      `${result.error ?? ''} tried to reach OSM infrastructure: ${osmHosts.join(', ')}`.trim()
  }
  openContext = undefined
  await context.close().catch(() => {})
  return result
}

const opts = args()
const runId = `${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}${opts.label ? `-${opts.label}` : ''}`
const outDir = join(ROOT, 'reports', runId)
mkdirSync(outDir, { recursive: true })

const started: Subprocess[] = []
let failed = false
try {
  await ensureServer(
    'mock-osm-api',
    PORTS.mockApi,
    ['bun', 'tools/mock-osm-api/server.ts'],
    started,
  )
  if (opts.editors.includes('maid')) {
    // The preview serves the build of one app from its own folder. A server already on the port could be serving
    // another app's build, so the run stops instead of measuring it under this app's name.
    if (await portOpen(PORTS.maidBuild)) {
      throw new Error(
        `port ${PORTS.maidBuild} is in use by another server: stop it, the benchmark serves the build of --app ${opts.app} there`,
      )
    }
    const appDir = APPS[opts.app].dir
    console.log(`building Maid (${opts.app}: ${appDir})`)
    const build = spawn(['bun', 'run', '--cwd', appDir, 'build'], {
      cwd: ROOT,
      stdout: 'ignore',
      stderr: 'inherit',
    })
    if ((await build.exited) !== 0) throw new Error(`build of ${appDir} failed`)
    await ensureServer(
      'maid',
      PORTS.maidBuild,
      ['bun', 'run', '--cwd', appDir, 'preview', '--port', String(PORTS.maidBuild)],
      started,
    )
  }
  if (opts.editors.includes('id'))
    await ensureServer('iD', PORTS.id, ['bun', 'tools/refs/id/serve.ts'], started)
  if (opts.editors.includes('rapid'))
    await ensureServer('Rapid', PORTS.rapid, ['bun', 'tools/refs/rapid/serve.ts'], started)

  const browser =
    opts.browser === 'chromium'
      ? await chromium.launch({ channel: 'chrome', headless: true })
      : await { firefox, webkit }[opts.browser].launch({ headless: true })
  const results: RunResult[] = []
  for (const sceneName of opts.scenes) {
    const scene = getScene(sceneName)
    for (let repeat = 0; repeat < opts.repeat; repeat++) {
      for (const editor of opts.editors) {
        // the backstop belongs to this run only: once the run is over its timer must do nothing, or it would
        // close the context of a later run five minutes after this one started
        let over = false
        const result = await Promise.race([
          runOnce(browser, editor, scene, repeat, outDir, opts).finally(() => {
            over = true
          }),
          Bun.sleep(RUN_LIMIT_MS).then(async (): Promise<RunResult> => {
            if (over) return new Promise<RunResult>(() => {})
            // close what is still open, so the run's calls end and the next run starts clean
            const phase = lastPhase
            await openContext?.close().catch(() => {})
            openContext = undefined
            return {
              editor,
              variant: opts.variant,
              scene: scene.name,
              repeat,
              ok: false,
              error: `run did not finish within ${RUN_LIMIT_MS / 60_000} minutes (last phase: ${phase || 'none'})`,
              blocked: {},
              screenshots: {},
            }
          }),
        ])
        results.push(result)
        if (!result.ok) failed = true
        console.log(
          `${scene.name} ${editor} #${repeat}: ${result.ok ? 'ok' : 'FAILED'} load ${result.load?.settledMs}ms, pan p95 ${result.panWarm?.p95Ms}ms, settle ${result.panWarm?.settleMs}ms${result.error ? ` — ${result.error}` : ''}`,
        )
      }
    }
  }
  const environment = {
    runId,
    date: new Date().toISOString(),
    label: opts.label,
    variant: opts.variant,
    app: opts.app,
    maidLens: opts.maidLens || undefined,
    editReps: opts.editReps,
    maidQuery: opts.maidQuery,
    idQuery: opts.idQuery,
    rapidQuery: opts.rapidQuery,
    viewport: VIEWPORT,
    deviceScaleFactor: opts.dpr,
    repeat: opts.repeat,
    browser: `${opts.browser === 'chromium' ? 'Chrome' : opts.browser} ${browser.version()}`,
    machine: `${process.platform} ${process.arch}`,
    gpu: results.find((r) => r.gpu)?.gpu,
    git: (await Bun.$`git -C ${ROOT} rev-parse --short HEAD`.text()).trim(),
    pins: {
      id: await Bun.file(join(ROOT, 'tools/refs/id/pin.json'))
        .json()
        .catch(() => null),
      rapid: await Bun.file(join(ROOT, 'tools/refs/rapid/pin.json'))
        .json()
        .catch(() => null),
    },
  }
  await browser.close()
  await Bun.write(join(outDir, 'results.json'), JSON.stringify({ environment, results }, null, 1))
  console.log(`results: ${join(outDir, 'results.json')}`)
} finally {
  for (const proc of started) proc.kill()
}
process.exit(failed ? 1 : 0)
