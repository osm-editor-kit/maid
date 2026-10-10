/**
 * Benchmark runner. Drives every editor through the same scenarios and writes
 * reports/<run-id>/results.json plus screenshots.
 *
 *   bun run bench [--editor maid,id,rapid] [--scene small,medium,dense] [--repeat 3]
 *                 [--label text] [--maid-query "update=setData"] [--variant name]
 *
 * Starts the servers it needs. Blocks every non-localhost request (core rule 1) and
 * fails a run when an editor tries to reach OSM infrastructure.
 */
import { chromium, type Browser, type CDPSession, type Page } from '@playwright/test'
import { spawn, type Subprocess } from 'bun'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { getScene, type Scene } from '../fixtures/scenes'
import { PORTS } from '../ports'
import { installProbe, type Recording } from './probe-page'
import { summarizeFrames, type FrameSummary } from './stats'

const ROOT = join(import.meta.dir, '../..')
const VIEWPORT = { width: 1600, height: 1000 }
const OSM_HOSTS = /(^|\.)(openstreetmap\.(org|de|fr)|osm\.org|overpass-api\.de|osmfoundation\.org)$/

type Editor = 'maid' | 'id' | 'rapid'
type Phase = FrameSummary & { cpuMs: number; settleMs: number }

export type RunResult = {
  editor: Editor
  variant: string
  scene: string
  repeat: number
  ok: boolean
  error?: string
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
  heapMb?: number
  blocked: Record<string, number>
  screenshots: Record<string, string>
}

function args() {
  const get = (name: string, fallback: string) => {
    const i = process.argv.indexOf(`--${name}`)
    return i > -1 ? process.argv[i + 1]! : fallback
  }
  return {
    editors: get('editor', 'maid,id,rapid').split(',') as Editor[],
    scenes: get('scene', 'small,medium,dense').split(','),
    repeat: Number(get('repeat', '3')),
    label: get('label', ''),
    maidQuery: get('maid-query', ''),
    idQuery: get('id-query', ''),
    // iD's host page runs without the name-suggestion-index, so Rapid does too by default
    rapidQuery: get('rapid-query', 'nsi=0'),
    variant: get('variant', 'default'),
    dpr: Number(get('dpr', '2')),
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
  const maxDx = ((VIEWPORT.width / 2 - 150) * mPerPx) / (111320 * Math.cos((scene.center[1] * Math.PI) / 180))
  const maxDy = ((VIEWPORT.height / 2 - 150) * mPerPx) / 110540
  const candidates: { id: string; lng: number; lat: number; length: number }[] = []
  for (const e of elements) {
    if (e.type !== 'way' || !e.tags?.highway || !/^(residential|tertiary|secondary|primary|living_street|unclassified)$/.test(e.tags.highway)) continue
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

async function cpuMs(cdp: CDPSession) {
  const { metrics } = await cdp.send('Performance.getMetrics')
  return (metrics.find((m) => m.name === 'TaskDuration')?.value ?? 0) * 1000
}

async function recordPhase(page: Page, cdp: CDPSession, action: () => Promise<void>): Promise<Phase> {
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
  return { ...summarizeFrames(rec.frames, rec.longTasks, rec.durationMs), cpuMs: Math.round(cpu1 - cpu0), settleMs: Math.round(settleMs) }
}

async function runOnce(browser: Browser, editor: Editor, scene: Scene, repeat: number, outDir: string, opts: ReturnType<typeof args>) {
  const result: RunResult = { editor, variant: opts.variant, scene: scene.name, repeat, ok: false, blocked: {}, screenshots: {} }
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: opts.dpr, bypassCSP: true })
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
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const cdp = await context.newCDPSession(page)
  await cdp.send('Performance.enable')
  const shot = async (name: string) => {
    const file = `${editor}-${opts.variant}-${scene.name}-${name}.png`
    if (repeat === 0) await page.screenshot({ path: join(outDir, file) })
    result.screenshots[name] = file
  }
  try {
    const port = editor === 'maid' ? PORTS.maidBuild : PORTS[editor]
    const [lng, lat] = scene.center
    const extra = editor === 'maid' ? opts.maidQuery : editor === 'id' ? opts.idQuery : opts.rapidQuery
    const query = extra ? `&${extra}` : ''
    const start = { lng, lat, zoom: scene.zoom }

    // --- Load: from navigation to a complete picture ---
    const t0 = performance.now()
    await page.goto(`http://localhost:${port}/?scene=${scene.name}${query}#map=${scene.zoom}/${lat}/${lng}`)
    await page.waitForFunction(() => window.__bench !== undefined, undefined, { timeout: 60000 })
    await page.evaluate(() => window.__bench.ready())
    const readyMs = performance.now() - t0
    await page.evaluate(() => window.__bench.settled())
    result.load = { readyMs: Math.round(readyMs), settledMs: Math.round(performance.now() - t0), cpuMs: Math.round(await cpuMs(cdp)) }
    result.version = await page.evaluate(() => window.__bench.version)
    result.gpu = await page.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl2')
      const ext = gl?.getExtension('WEBGL_debug_renderer_info')
      return ext ? String(gl!.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown'
    })
    result.stats = await page.evaluate(() => window.__bench.stats())
    await shot('load')

    // --- Pan: a real mouse drag into data that is not loaded yet (cold), then back (warm) ---
    // Real input on purpose: iD and Rapid move a stale picture while dragging and redraw later,
    // and only a real gesture goes through that path.
    const mPerPx = (156543.03 * Math.cos((lat * Math.PI) / 180)) / 2 ** scene.zoom
    const halfW = ((scene.bbox[2] - scene.bbox[0]) / 2) * 111320 * Math.cos((lat * Math.PI) / 180)
    const halfH = ((scene.bbox[3] - scene.bbox[1]) / 2) * 110540
    const dx = Math.round(Math.min(1100, Math.max(0, halfW / mPerPx - VIEWPORT.width / 2 - 30)))
    const dy = Math.round(Math.min(700, Math.max(0, halfH / mPerPx - VIEWPORT.height / 2 - 30)))
    const drag = (fromX: number, fromY: number, toX: number, toY: number, ms: number) => async () => {
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
    result.panCold = await recordPhase(page, cdp, drag(grab.x, grab.y, grab.x - dx, grab.y + dy, 3000))
    result.panWarm = await recordPhase(page, cdp, drag(grab.x - dx, grab.y + dy, grab.x, grab.y, 3000))
    await page.evaluate((c) => window.__bench.setCamera(c), start)
    await page.evaluate(() => window.__bench.settled())

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

    // --- Hover: latency on known ways, then a sweep across the map ---
    const targets = await hoverTargets(scene)
    result.hoverLatencyMs = []
    for (const target of targets) {
      const pos = await page.evaluate(([x, y]) => window.__bench.project(x, y), [target.lng, target.lat] as const)
      // park the pointer where nothing is hovered
      for (const [x, y] of [[3, 3], [VIEWPORT.width - 3, 3], [3, VIEWPORT.height - 3]] as const) {
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
      await page.mouse.move(100 + (i / 90) * (VIEWPORT.width - 200), VIEWPORT.height / 2 + Math.sin(i / 6) * 250)
      await page.waitForTimeout(25)
      if (i % 5 === 0) for (const id of await page.evaluate(() => window.__bench.hovered())) hoveredIds.add(id)
    }
    const sweep: Recording = await page.evaluate(() => window.__probe.stop())
    result.hoverSweep = {
      ...summarizeFrames(sweep.frames, sweep.longTasks, sweep.durationMs),
      cpuMs: Math.round((await cpuMs(cdp)) - cpu0),
      distinctHovered: hoveredIds.size,
    }
    await page.mouse.move(3, 3)

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

    await cdp.send('HeapProfiler.collectGarbage')
    const { metrics } = await cdp.send('Performance.getMetrics')
    result.heapMb = Math.round((metrics.find((m) => m.name === 'JSHeapUsedSize')?.value ?? 0) / 1e5) / 10
    result.ok = true
  } catch (error) {
    result.error = String(error).slice(0, 500)
    await page.screenshot({ path: join(outDir, `error-${editor}-${scene.name}-${repeat}.png`) }).catch(() => {})
  }
  if (errors.length) result.error = [result.error, ...errors.slice(0, 3)].filter(Boolean).join(' | ')
  const osmHosts = Object.keys(result.blocked).filter((host) => OSM_HOSTS.test(host))
  if (osmHosts.length) {
    result.ok = false
    result.error = `${result.error ?? ''} tried to reach OSM infrastructure: ${osmHosts.join(', ')}`.trim()
  }
  await context.close()
  return result
}

const opts = args()
const runId = `${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}${opts.label ? `-${opts.label}` : ''}`
const outDir = join(ROOT, 'reports', runId)
mkdirSync(outDir, { recursive: true })

const started: Subprocess[] = []
let failed = false
try {
  await ensureServer('mock-osm-api', PORTS.mockApi, ['bun', 'tools/mock-osm-api/server.ts'], started)
  if (opts.editors.includes('maid')) {
    console.log('building Maid')
    const build = spawn(['bun', 'run', '--cwd', 'apps/maid', 'build'], { cwd: ROOT, stdout: 'ignore', stderr: 'inherit' })
    if ((await build.exited) !== 0) throw new Error('Maid build failed')
    await ensureServer('maid', PORTS.maidBuild, ['bun', 'run', '--cwd', 'apps/maid', 'preview', '--port', String(PORTS.maidBuild)], started)
  }
  if (opts.editors.includes('id')) await ensureServer('iD', PORTS.id, ['bun', 'tools/refs/id/serve.ts'], started)
  if (opts.editors.includes('rapid')) await ensureServer('Rapid', PORTS.rapid, ['bun', 'tools/refs/rapid/serve.ts'], started)

  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const results: RunResult[] = []
  for (const sceneName of opts.scenes) {
    const scene = getScene(sceneName)
    for (let repeat = 0; repeat < opts.repeat; repeat++) {
      for (const editor of opts.editors) {
        const result = await runOnce(browser, editor, scene, repeat, outDir, opts)
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
    maidQuery: opts.maidQuery,
    idQuery: opts.idQuery,
    rapidQuery: opts.rapidQuery,
    viewport: VIEWPORT,
    deviceScaleFactor: opts.dpr,
    repeat: opts.repeat,
    browser: browser.version(),
    machine: `${process.platform} ${process.arch}`,
    gpu: results.find((r) => r.gpu)?.gpu,
    git: (await Bun.$`git -C ${ROOT} rev-parse --short HEAD`.text()).trim(),
    pins: {
      id: await Bun.file(join(ROOT, 'tools/refs/id/pin.json')).json().catch(() => null),
      rapid: await Bun.file(join(ROOT, 'tools/refs/rapid/pin.json')).json().catch(() => null),
    },
  }
  await browser.close()
  await Bun.write(join(outDir, 'results.json'), JSON.stringify({ environment, results }, null, 1))
  console.log(`results: ${join(outDir, 'results.json')}`)
} finally {
  for (const proc of started) proc.kill()
}
process.exit(failed ? 1 : 0)
