import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, normalize, resolve } from 'node:path'
import { parseArgs } from 'node:util'
/**
 * `bun run sim-measure`: Maid's load in the iOS simulator's Safari, measured by the page itself (packages/shell/src/
 * perf-report.ts) and sent to this script's own server, so no click in the Web Inspector is needed. A person runs it
 * on a Mac with Xcode; with `--opener playwright` it runs the same steps in Chromium (to check the script elsewhere).
 *
 * Builds the app with VITE_BENCH=1, serves the build itself (`--cache cold`: nothing cached, like a first visit),
 * starts the mock API if it is not up, then opens each variant `--runs` times and waits for its report. The data is
 * the mock's fixtures and the background is none: no request leaves this machine (AGENTS.md, core rule 1).
 *
 *   bun run sim-measure [--app maid] [--device "iPhone 16"] [--runs 3] [--workers 4,2] [--scene small]
 *                       [--cache cold|warm] [--warmup 1] [--opener simctl|playwright] [--no-build]
 *
 * One warm-up visit (`--warmup`) is not counted: the first Safari after a boot is far slower. The variants take turns
 * (4, 2, 4, 2, …), so a slow phase of the machine does not land on one of them.
 *
 * Writes reports/sim-measure-<app>.json (every report, and the medians per variant) and a screenshot per variant.
 */
import { spawn, spawnSync, type Subprocess } from 'bun'
import type { PerfReport } from '../../packages/shell/src/perf-report'
import { getScene } from '../fixtures/scenes'
import { PORTS } from '../ports'

const ROOT = resolve(import.meta.dir, '../..')
const APPS: Record<string, string> = {
  maid: 'apps/maid',
  bicycle: 'apps/maid-bicycle',
  parking: 'apps/maid-parking',
}
/** How long one visit may take until its report arrives */
const VISIT_LIMIT_MS = 120_000

const { values: opts } = parseArgs({
  options: {
    app: { type: 'string', default: 'maid' },
    device: { type: 'string', default: 'iPhone 16' },
    runs: { type: 'string', default: '3' },
    warmup: { type: 'string', default: '1' },
    workers: { type: 'string', default: '4,2' },
    scene: { type: 'string', default: 'small' },
    cache: { type: 'string', default: 'cold' },
    opener: { type: 'string', default: process.platform === 'darwin' ? 'simctl' : 'playwright' },
    'no-build': { type: 'boolean', default: false },
  },
})

const appDir = APPS[opts.app ?? 'maid']
if (appDir === undefined) fail(`--app must be one of ${Object.keys(APPS).join(', ')}`)
const runs = Number(opts.runs)
const workers = (opts.workers ?? '4').split(',').map(Number)
if (!(runs > 0) || workers.some((n) => !(n > 0))) fail('--runs and --workers take positive numbers')
if (opts.cache !== 'cold' && opts.cache !== 'warm') fail('--cache is cold or warm')
if (opts.opener !== 'simctl' && opts.opener !== 'playwright')
  fail('--opener is simctl or playwright')
const scene = getScene(opts.scene ?? 'small')

function fail(message: string): never {
  console.error(`sim-measure: ${message}`)
  process.exit(1)
}

/**
 * xcrun finds simctl only in Xcode, not in the Command Line Tools that `xcode-select` often points to. Xcode's own
 * folder is then used for this script alone (`DEVELOPER_DIR`), so the system's choice stays as it is.
 */
const XCODE = '/Applications/Xcode.app/Contents/Developer'
const toolEnv =
  !process.env.DEVELOPER_DIR && existsSync(XCODE)
    ? { ...process.env, DEVELOPER_DIR: XCODE }
    : process.env

function run(cmd: string[], what: string) {
  const result = spawnSync(cmd, { cwd: ROOT, env: toolEnv, stdout: 'pipe', stderr: 'pipe' })
  if (result.exitCode !== 0) fail(`${what} failed: ${result.stderr.toString().trim()}`)
  return result.stdout.toString()
}

async function portOpen(port: number) {
  try {
    await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(1000) })
    return true
  } catch {
    return false
  }
}

const started: Subprocess[] = []
const stopAll = () => {
  for (const proc of started) proc.kill()
}
process.on('exit', stopAll)
process.on('SIGINT', () => process.exit(130))

// --- the build, with the measuring hooks (window.__bench, the perf report) ---
const dist = join(ROOT, appDir, 'dist')
if (!opts['no-build']) {
  console.log(`building ${appDir} with VITE_BENCH=1 …`)
  const build = spawnSync(['bun', 'run', '--cwd', appDir, 'build'], {
    cwd: ROOT,
    env: { ...process.env, VITE_BENCH: '1', VITE_BASE: '/' },
    stdout: 'ignore',
    stderr: 'inherit',
  })
  if (build.exitCode !== 0) fail('the build failed')
}
if (!existsSync(join(dist, 'index.html'))) fail(`no build in ${dist}: run without --no-build`)

// --- the build's server: `cold` forbids every cache, as on a first visit ---
const cacheHeader = opts.cache === 'cold' ? 'no-store' : 'max-age=600'
const site = Bun.serve({
  port: PORTS.simBuild,
  async fetch(request) {
    const path = normalize(decodeURIComponent(new URL(request.url).pathname)).replace(
      /^(\.\.[/\\])+/,
      '',
    )
    let file = Bun.file(join(dist, path))
    if (path.endsWith('/') || !(await file.exists())) file = Bun.file(join(dist, 'index.html'))
    return new Response(file, { headers: { 'cache-control': cacheHeader } })
  },
})

// --- the reports: the page posts to /report (perf-report.ts) ---
let waiting: ((report: PerfReport) => void) | undefined
const reports = Bun.serve({
  port: PORTS.perfReport,
  async fetch(request) {
    const cors = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'content-type',
    }
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors })
    if (request.method === 'POST' && new URL(request.url).pathname === '/report') {
      const report = JSON.parse(await request.text()) as PerfReport
      waiting?.(report)
      return new Response('ok', { headers: cors })
    }
    return new Response('not found', { status: 404, headers: cors })
  },
})

if (!(await portOpen(PORTS.mockApi))) {
  console.log('starting the mock API …')
  started.push(
    spawn(['bun', 'tools/mock-osm-api/server.ts'], {
      cwd: ROOT,
      stdout: 'ignore',
      stderr: 'inherit',
    }),
  )
  for (let i = 0; i < 50 && !(await portOpen(PORTS.mockApi)); i++) await Bun.sleep(200)
  if (!(await portOpen(PORTS.mockApi))) fail(`the mock API did not start on ${PORTS.mockApi}`)
}

// --- the opener: Safari in the simulator, or Chromium to check the script ---
type Opener = {
  open(url: string): Promise<void>
  screenshot(path: string): Promise<void>
  close(): Promise<void>
}

async function simctlOpener(): Promise<Opener> {
  const list = JSON.parse(
    run(['xcrun', 'simctl', 'list', 'devices', 'available', '-j'], 'simctl list'),
  ) as {
    devices: Record<string, { name: string; udid: string; state: string }[]>
  }
  const devices = Object.values(list.devices).flat()
  const device = devices.find((each) => each.name === opts.device)
  if (device === undefined) {
    fail(
      `no simulator named "${opts.device}". Available: ${[...new Set(devices.map((d) => d.name))].join(', ')}`,
    )
  }
  if (device.state !== 'Booted') run(['xcrun', 'simctl', 'boot', device.udid], 'simctl boot')
  spawnSync(['open', '-a', 'Simulator'])
  run(['xcrun', 'simctl', 'bootstatus', device.udid, '-b'], 'simctl bootstatus')
  return {
    async open(url) {
      // a new Safari each time, so the page before is gone and with it its memory
      spawnSync(['xcrun', 'simctl', 'terminate', device.udid, 'com.apple.mobilesafari'], {
        env: toolEnv,
      })
      run(['xcrun', 'simctl', 'openurl', device.udid, url], 'simctl openurl')
    },
    async screenshot(path) {
      run(['xcrun', 'simctl', 'io', device.udid, 'screenshot', path], 'simctl screenshot')
    },
    async close() {},
  }
}

async function playwrightOpener(): Promise<Opener> {
  const { chromium } = await import('@playwright/test')
  const browser = await chromium.launch()
  let page: import('@playwright/test').Page | undefined
  return {
    async open(url) {
      await page?.context().close()
      const context = await browser.newContext({
        viewport: { width: 402, height: 874 },
        hasTouch: true,
      })
      page = await context.newPage()
      await page.goto(url)
    },
    async screenshot(path) {
      await page?.screenshot({ path })
    },
    async close() {
      await browser.close()
    },
  }
}

const opener = opts.opener === 'simctl' ? await simctlOpener() : await playwrightOpener()

const outDir = join(ROOT, 'reports')
mkdirSync(outDir, { recursive: true })
const results: { workers: number; run: number; report: PerfReport }[] = []
const [lng, lat] = scene.center

/** Opens one visit and waits for its report */
async function visit(count: number, what: string): Promise<PerfReport> {
  const url =
    `http://localhost:${PORTS.simBuild}/?api=mock&scene=${scene.name}&bg=none&workers=${count}` +
    `&perf-report=${PORTS.perfReport}&visit=${Date.now()}#map=${scene.zoom}/${lat}/${lng}`
  const report = new Promise<PerfReport>((resolveReport, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`no report within ${VISIT_LIMIT_MS} ms`)),
      VISIT_LIMIT_MS,
    )
    waiting = (value) => {
      clearTimeout(timer)
      resolveReport(value)
    }
  })
  await opener.open(url)
  return report.catch((error: Error) => fail(`${what}: ${error.message}`))
}

for (let i = 0; i < Number(opts.warmup); i++) {
  const value = await visit(workers[0] ?? 4, `warm-up ${i + 1}`)
  console.log(`warm-up ${i + 1} (not counted): settled ${value.settledMs} ms`)
}
for (let i = 0; i < runs; i++) {
  for (const count of workers) {
    const value = await visit(count, `workers ${count}, run ${i + 1}`)
    results.push({ workers: count, run: i + 1, report: value })
    console.log(
      `workers ${count} run ${i + 1}: FCP ${value.paint.firstContentfulPaint ?? '-'} ms, map drawn ${value.drawnMs} ms, settled ${value.settledMs} ms`,
    )
    if (i === 0) await opener.screenshot(join(outDir, `sim-measure-${opts.app}-w${count}.png`))
  }
}
await opener.close()
void site.stop()
void reports.stop()

const median = (values: number[]) => {
  const sorted = values.toSorted((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}
const summary = workers.map((count) => {
  const mine = results.filter((each) => each.workers === count).map((each) => each.report)
  return {
    workers: count,
    firstContentfulPaint: median(mine.map((r) => r.paint.firstContentfulPaint ?? Number.NaN)),
    mapLoaded: median(mine.map((r) => r.mapLoadedMs)),
    drawn: median(mine.map((r) => r.drawnMs)),
    settled: median(mine.map((r) => r.settledMs)),
  }
})
const file = join(outDir, `sim-measure-${opts.app}.json`)
writeFileSync(
  file,
  `${JSON.stringify({ opener: opts.opener, device: opts.device, cache: opts.cache, scene: scene.name, summary, results }, null, 2)}\n`,
)
console.table(summary)
console.log(`wrote ${file}`)
process.exit(0)
