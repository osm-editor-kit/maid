/**
 * Smoke test for the iD reference: loads a scene from the mock API through our host page,
 * checks window.__bench end to end and proves that nothing left localhost.
 *
 *   bun tools/refs/id/smoke.ts [--scene small] [--zoom 17] [--build min|dev] [--headed]
 *
 * Needs the mock API on PORTS.mockApi (bun tools/mock-osm-api/server.ts). Starts the iD
 * static server itself when PORTS.id is not answering.
 * Writes tools/refs/id/smoke.png + smoke.json (scene small) or smoke-<scene>.png/.json.
 * Exits non-zero on any failure, including any attempt to reach a non-localhost host.
 */
import { chromium } from '@playwright/test'
import { join } from 'node:path'
import { PORTS } from '../../ports'
import { getScene } from '../../fixtures/scenes'
import { createHandler } from './serve'

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 ? process.argv[i + 1] : undefined
}
const scene = getScene(arg('scene') ?? 'small')
const zoom = Number(arg('zoom') ?? 17)
const build = arg('build') ?? 'min'
const headed = process.argv.includes('--headed')
const ID = `http://localhost:${PORTS.id}`
const MOCK = `http://localhost:${PORTS.mockApi}`
const outBase = join(import.meta.dir, scene.name === 'small' ? 'smoke' : `smoke-${scene.name}`)
const VIEWPORT = { width: 1600, height: 1000 }
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])
const OSM_INFRA = /(^|\.)openstreetmap\.(org|de|fr)$|(^|\.)osm\.org$|overpass|nominatim|taginfo/

const failures: string[] = []
const check = (ok: unknown, message: string) => {
  if (!ok) failures.push(message)
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${message}`)
}

async function alive(url: string) {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(2000) })).ok
  } catch {
    return false
  }
}

if (!(await alive(`${MOCK}/scenes`))) {
  console.error(`Mock OSM API is not running on ${MOCK}. Start it: bun tools/mock-osm-api/server.ts`)
  process.exit(1)
}
let ownServer: ReturnType<typeof Bun.serve> | undefined
if (!(await alive(`${ID}/bench-config.js`))) {
  ownServer = Bun.serve({ port: PORTS.id, hostname: '127.0.0.1', fetch: createHandler() })
  console.log(`started iD static server on ${ID} for this run`)
}
const runStart = Date.now() // the mock API and its log may be shared with other runs: filter by time, never reset

const browser = await chromium.launch({ channel: 'chrome', headless: !headed })
let exitCode = 1
try {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 })

  // Core rule 1: nothing leaves localhost. Block and log everything else.
  const blocked = new Map<string, { count: number; sample: string }>()
  const localRequests = new Map<string, number>()
  const localUrls: URL[] = []
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (url.protocol === 'data:' || url.protocol === 'blob:' || LOCAL_HOSTS.has(url.hostname)) {
      localRequests.set(url.host, (localRequests.get(url.host) ?? 0) + 1)
      localUrls.push(url)
      return route.continue()
    }
    const entry = blocked.get(url.host) ?? { count: 0, sample: url.href.slice(0, 160) }
    entry.count++
    blocked.set(url.host, entry)
    return route.abort('blockedbyclient')
  })
  await context.routeWebSocket('**/*', (ws) => {
    const url = new URL(ws.url())
    if (LOCAL_HOSTS.has(url.hostname)) return void ws.connectToServer()
    const entry = blocked.get(url.host) ?? { count: 0, sample: ws.url().slice(0, 160) }
    entry.count++
    blocked.set(url.host, entry)
    ws.close()
  })

  const page = await context.newPage()
  const pageErrors: string[] = []
  const consoleErrors: string[] = []
  page.on('pageerror', (e) => pageErrors.push(String(e.stack ?? e).slice(0, 600)))
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300))
  })

  const url = `${ID}/?scene=${scene.name}${build === 'dev' ? '&build=dev' : ''}#map=${zoom}/${scene.center[1]}/${scene.center[0]}`
  console.log(`open ${url}  viewport ${VIEWPORT.width}x${VIEWPORT.height}`)
  const wallStart = performance.now()
  await page.goto(url, { waitUntil: 'commit' })
  await page.waitForFunction(() => typeof window.__bench === 'object')

  // ready + settled, timed inside the page (performance.now() is ms since navigation start)
  const timing = await page.evaluate(async () => {
    await window.__bench.ready()
    const readyAt = performance.now()
    await window.__bench.settled()
    return { readyAt, settledAt: performance.now() }
  })
  const wallSettled = performance.now() - wallStart
  const call = <T>(body: string) => page.evaluate(`(async () => { const b = window.__bench; ${body} })()`) as Promise<T>

  const info = await call<{ editor: string; version: string }>('return { editor: b.editor, version: b.version }')
  const camera = await call<{ lng: number; lat: number; zoom: number }>('return b.getCamera()')
  const stats = await call<any>('return b.stats()')
  const internals = await call<any>('return { counters: b._id.counters, lastSettle: b._id.lastSettle(), features: b._id.features(), state: b._id.state() }')

  console.log(`editor ${info.editor} ${info.version}, scene ${scene.name}, build ${build}`)
  console.log(`time to ready   ${timing.readyAt.toFixed(0)} ms (since navigation start)`)
  console.log(`time to settled ${timing.settledAt.toFixed(0)} ms (since navigation start), ${wallSettled.toFixed(0)} ms wall incl. goto`)
  console.log(`camera ${JSON.stringify(camera)}`)
  console.log(`stats ${JSON.stringify(stats, null, 2)}`)
  console.log(`features ${JSON.stringify(internals.features)}`)
  console.log(`counters ${JSON.stringify(internals.counters)}`)

  check(info.editor === 'id' && info.version === '2.42.2', `editor is iD 2.42.2 (got ${info.editor} ${info.version})`)
  check(Math.abs(camera.zoom - zoom) < 1e-6, `zoom is ${zoom} (got ${camera.zoom})`)
  check(
    Math.abs(camera.lng - scene.center[0]) < 1e-6 && Math.abs(camera.lat - scene.center[1]) < 1e-6,
    `camera is at the scene center (got ${camera.lng}, ${camera.lat})`,
  )
  check(stats.entities.nodes > 100 && stats.entities.ways > 10, `entities loaded (${JSON.stringify(stats.entities)})`)
  check(stats.drawn.lines > 5, `lines drawn (${stats.drawn.lines})`)
  check(stats.drawn.areas > 5 || Object.keys(stats.hidden).some((k) => k.startsWith('auto:')), `areas drawn (${stats.drawn.areas}) or auto-hidden`)
  check(stats.drawn.domNodes > 100, `svg.surface has DOM nodes (${stats.drawn.domNodes})`)
  check(internals.state.missingTiles.length === 0 && internals.state.inflight === 0, 'no tile missing or in flight after settled')
  check(internals.counters.watchdogClears === 0, `throttle model held, watchdog never fired (${internals.counters.watchdogClears})`)

  // settled() must not resolve while a throttled redraw is still queued: after it resolves,
  // 1.2 s of doing nothing must not produce another full redraw.
  const drawsBefore = internals.counters.completeDraws
  await page.waitForTimeout(1200)
  const drawsAfter = await call<number>('return b._id.counters.completeDraws')
  check(drawsAfter === drawsBefore, `no full redraw in the 1.2 s after settled() (${drawsBefore} -> ${drawsAfter})`)

  const modal = await page.evaluate(() => {
    const el = document.querySelector('.modal, .shaded, .intro, .curtain')
    return el ? el.className : null
  })
  check(modal === null, `no modal, splash or walkthrough on the map (${modal})`)

  await page.screenshot({ path: `${outBase}.png` })
  console.log(`screenshot ${outBase}.png`)

  // project(): compare with where iD really put a vertex
  const projection = await call<{ id: string; dx: number; dy: number } | null>(`
    const ctx = b._id.context
    for (const g of document.querySelectorAll('.data-layer.osm .points-group.vertices > g.vertex')) {
      const id = Array.from(g.classList).find((c) => /^n\\d+$/.test(c))
      const node = id && ctx.hasEntity(id)
      if (!node) continue
      const r = g.querySelector('.stroke').getBoundingClientRect()
      const p = b.project(node.loc[0], node.loc[1])
      if (p.x < 500 || p.x > innerWidth - 100 || p.y < 100 || p.y > innerHeight - 100) continue
      return { id, dx: p.x - (r.left + r.width / 2), dy: p.y - (r.top + r.height / 2) }
    }
    return null`)
  check(
    projection && Math.abs(projection.dx) < 1.5 && Math.abs(projection.dy) < 1.5,
    `project() matches the DOM position of vertex ${projection?.id} (dx ${projection?.dx.toFixed(2)}, dy ${projection?.dy.toFixed(2)})`,
  )

  // a highway way with a point on screen where its own hit target is the topmost element
  const target = await call<{ id: string; x: number; y: number } | null>(`
    const ctx = b._id.context
    const graph = ctx.graph()
    const ways = ctx.history().intersects(ctx.map().extent()).filter((e) => e.type === 'way' && e.tags.highway && !e.isArea())
    for (const way of ways) {
      const nodes = graph.childNodes(way)
      for (let i = 0; i < nodes.length - 1; i++) {
        const a = b.project(nodes[i].loc[0], nodes[i].loc[1])
        const c = b.project(nodes[i + 1].loc[0], nodes[i + 1].loc[1])
        if (Math.hypot(a.x - c.x, a.y - c.y) < 40) continue
        const x = (a.x + c.x) / 2, y = (a.y + c.y) / 2
        if (x < 500 || x > innerWidth - 100 || y < 100 || y > innerHeight - 100) continue
        const el = document.elementFromPoint(x, y)
        if (el && el.classList.contains('target') && el.__data__ && el.__data__.properties && el.__data__.properties.entity.id === way.id) {
          return { id: way.id, x, y }
        }
      }
    }
    return null`)
  check(target, `found a highway way in the view to select and hover (${target?.id} at ${target?.x.toFixed(0)},${target?.y.toFixed(0)})`)

  if (target) {
    const selection = await call<{ ms: number; selected: string[]; dom: number; mode: string }>(`
      const t = performance.now()
      await b.select(${JSON.stringify(target.id)})
      return {
        ms: performance.now() - t,
        selected: b.selected(),
        dom: document.querySelectorAll('.data-layer.osm .selected.${target.id}').length,
        mode: b._id.context.mode().id,
      }`)
    console.log(`select(${target.id}) resolved after ${selection.ms.toFixed(0)} ms, selected() = ${JSON.stringify(selection.selected)}`)
    check(selection.selected.length === 1 && selection.selected[0] === target.id, `selected() returns the way`)
    check(selection.mode === 'select' && selection.dom > 0, `iD is in select mode and drew .selected on ${selection.dom} elements`)
    const afterSelect = await call<number>('const t = performance.now(); await b.settled(); return performance.now() - t')
    console.log(`settled() after select took ${afterSelect.toFixed(0)} ms`)
    await page.screenshot({ path: `${outBase}-selected.png` })

    const cleared = await call<string[]>('await b.select(null); await b.settled(); return b.selected()')
    check(cleared.length === 0, `select(null) clears the selection (${JSON.stringify(cleared)})`)

    // real pointer: come in from a point nearby so iD sees pointerover on the target
    await page.mouse.move(target.x + 60, target.y + 60)
    await page.mouse.move(target.x, target.y, { steps: 8 })
    let hovered: string[] = []
    const hoverStart = performance.now()
    while (performance.now() - hoverStart < 3000) {
      hovered = await call<string[]>('return b.hovered()')
      if (hovered.includes(target.id)) break
      await page.waitForTimeout(50)
    }
    console.log(`hovered() = ${JSON.stringify(hovered)} after moving the mouse to ${target.x.toFixed(0)},${target.y.toFixed(0)}`)
    check(hovered.includes(target.id), `hovered() contains ${target.id}`)
    await page.mouse.move(5, 5)
  }

  // camera round trip through setCamera + settled
  const moved = await call<{ camera: any; ms: number; state: any }>(`
    const c = b.getCamera()
    const t = performance.now()
    b.setCamera({ lng: c.lng + 0.002, lat: c.lat + 0.001, zoom: c.zoom })
    await b.settled()
    return { camera: b.getCamera(), ms: performance.now() - t, state: b._id.state() }`)
  console.log(`setCamera(+0.002, +0.001) settled after ${moved.ms.toFixed(0)} ms`)
  check(
    Math.abs(moved.camera.lng - (camera.lng + 0.002)) < 1e-6 && Math.abs(moved.camera.lat - (camera.lat + 0.001)) < 1e-6,
    'setCamera/getCamera round trip',
  )
  check(moved.state.missingTiles.length === 0 && !moved.state.transformed, 'settled after setCamera: tiles loaded, transform reset')

  // What was requested. Taken from the browser side, because the mock API can be shared with other runs.
  const mockPaths = localUrls.filter((u) => u.port === String(PORTS.mockApi)).map((u) => u.pathname)
  const mockSummary = new Map<string, number>()
  for (const path of mockPaths) {
    const key = path.replace(/\/(node|way|relation)\/\d+/, '/$1/ID')
    mockSummary.set(key, (mockSummary.get(key) ?? 0) + 1)
  }
  console.log('requests to the mock API:')
  for (const [key, n] of mockSummary) console.log(`  ${n}x ${key}`)
  check(mockPaths.some((p) => p === `/s/${scene.name}/api/0.6/map.json`), 'map data came from the mock API scene')
  check(mockPaths.every((p) => p.startsWith(`/s/${scene.name}/`)), 'every mock API request used the selected scene')
  const mockLog = (await (await fetch(`${MOCK}/requests`)).json()) as { t: number; path: string; status: number }[]
  const mockErrors = mockLog.filter((r) => r.t >= runStart && r.path.startsWith(`/s/${scene.name}/`) && r.status >= 400)
  check(mockErrors.length === 0, `mock API answered no error since the run started (${mockErrors.map((r) => `${r.status} ${r.path}`).slice(0, 5).join(', ') || 'none'})`)
  const idLog = ((await (await fetch(`${ID}/requests`)).json()) as { t: number; path: string; status: number }[]).filter((r) => r.t >= runStart)
  console.log(`local requests by host: ${JSON.stringify(Object.fromEntries(localRequests))}`)
  console.log(`404s on the iD static server (neutralised endpoints): ${idLog.length ? '' : 'none'}`)
  for (const r of idLog) console.log(`  ${r.status} ${r.path}`)

  console.log(`blocked non-localhost requests: ${blocked.size ? '' : 'none'}`)
  for (const [host, { count, sample }] of blocked) console.log(`  ${count}x ${host}  (e.g. ${sample})`)
  check(blocked.size === 0, 'iD made no request to a non-localhost host')
  const osmHosts = [...blocked.keys()].filter((h) => OSM_INFRA.test(h))
  check(osmHosts.length === 0, `no request to OSM infrastructure was attempted (${osmHosts.join(', ') || 'none'})`)

  if (pageErrors.length) console.log(`page errors:\n  ${pageErrors.join('\n  ')}`)
  if (consoleErrors.length) console.log(`console errors:\n  ${[...new Set(consoleErrors)].join('\n  ')}`)
  check(pageErrors.length === 0, `no uncaught page errors (${pageErrors.length})`)

  await Bun.write(
    `${outBase}.json`,
    JSON.stringify(
      {
        scene: scene.name,
        zoom,
        build,
        viewport: VIEWPORT,
        editor: info,
        timing: { readyMs: timing.readyAt, settledMs: timing.settledAt, wallSettledMs: wallSettled, setCameraSettledMs: moved.ms },
        camera,
        stats,
        features: internals.features,
        counters: internals.counters,
        mockRequests: Object.fromEntries(mockSummary),
        staticServer404s: idLog.map((r) => r.path),
        blocked: Object.fromEntries(blocked),
        pageErrors,
        consoleErrors: [...new Set(consoleErrors)],
        failures,
      },
      null,
      2,
    ) + '\n',
  )
  console.log(`result ${outBase}.json`)
  exitCode = failures.length ? 1 : 0
} catch (error) {
  console.error(`FAIL ${(error as Error).stack ?? error}`)
} finally {
  await browser.close()
  ownServer?.stop(true)
}
if (failures.length) console.error(`\n${failures.length} check(s) failed:\n  ${failures.join('\n  ')}`)
else if (exitCode === 0) console.log('\nsmoke passed')
process.exit(exitCode)
