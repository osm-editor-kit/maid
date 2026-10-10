/**
 * Smoke test for the Rapid benchmark reference.
 *
 *   bun tools/refs/rapid/smoke.ts [--scene small] [--zoom 17] [--headed] [--no-screenshot]
 *
 * Opens the host page in system Chrome, waits for ready + settled, prints stats, selects a
 * way, hovers a line with the real mouse and writes tools/refs/rapid/smoke.png (smoke-<scene>.png
 * for other scenes). Every non-localhost request is aborted and counted; the run fails if
 * Rapid tried to reach OSM infrastructure (AGENTS.md core rule 1).
 * Starts the Rapid static server and the mock OSM API in-process when they are not running.
 */
import { chromium, type Request } from '@playwright/test'
import { join } from 'node:path'
import { getScene } from '../../fixtures/scenes'
import { createHandler as createMockHandler, loadScenes } from '../../mock-osm-api/server'
import { PORTS } from '../../ports'
import { createHandler as createRapidHandler } from './serve'

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 ? process.argv[i + 1] : undefined
}
const scene = getScene(arg('scene') ?? 'small')
const zoom = Number(arg('zoom') ?? 17)
const headed = process.argv.includes('--headed')
const VIEWPORT = { width: 1600, height: 1000 }
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])
const OSM_INFRA = /(^|\.)(openstreetmap\.org|openstreetmap\.de|osm\.org|overpass-api\.de|overpass\.kumi\.systems|osmfoundation\.org)$/

const failures: string[] = []
const check = (ok: boolean, message: string) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${message}`)
  if (!ok) failures.push(message)
}

async function isUp(url: string) {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(1000) })).ok
  } catch {
    return false
  }
}

const rapidUrl = `http://localhost:${PORTS.rapid}`
const mockUrl = `http://localhost:${PORTS.mockApi}`
const servers: { stop(force?: boolean): unknown }[] = []
if (!(await isUp(`${mockUrl}/scenes`))) {
  console.log(`mock OSM API not running, starting it in-process on ${PORTS.mockApi}`)
  servers.push(Bun.serve({ port: PORTS.mockApi, hostname: '127.0.0.1', fetch: createMockHandler(await loadScenes(), { latency: 0 }) }))
}
if (!(await isUp(`${rapidUrl}/config.js`))) {
  console.log(`Rapid server not running, starting it in-process on ${PORTS.rapid}`)
  servers.push(Bun.serve({ port: PORTS.rapid, hostname: '127.0.0.1', fetch: createRapidHandler() }))
}
if (!(await isUp(`${rapidUrl}/js/rapid.min.js`))) {
  console.error('Rapid is not built. Run: bun tools/refs/rapid/setup.ts')
  process.exit(1)
}

const browser = await chromium.launch({
  channel: 'chrome',
  headless: !headed,
  // Second line of defence next to the route below: DNS only resolves local names.
  args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1'],
})
const context = await browser.newContext({ viewport: VIEWPORT })

const blocked = new Map<string, { count: number; sample: string }>()
const localCounts = new Map<string, number>()
const note = (request: Request) => {
  const url = new URL(request.url())
  if (url.protocol === 'data:' || url.protocol === 'blob:') return true
  if (LOCAL_HOSTS.has(url.hostname)) {
    localCounts.set(url.port, (localCounts.get(url.port) ?? 0) + 1)
    return true
  }
  const entry = blocked.get(url.hostname) ?? { count: 0, sample: request.url().slice(0, 160) }
  entry.count++
  blocked.set(url.hostname, entry)
  return false
}
await context.route('**/*', (route) => (note(route.request()) ? route.continue() : route.abort('blockedbyclient')))

// What this browser asked the mock API (the server's own /requests log is shared with other runs).
const mockResponses: { path: string; status: number }[] = []
context.on('response', (response) => {
  const url = new URL(response.url())
  if (url.port === String(PORTS.mockApi)) mockResponses.push({ path: url.pathname, status: response.status() })
})

const printRequests = () => {
  console.log(`local requests    ${JSON.stringify(Object.fromEntries(localCounts))} (by port)`)
  console.log(`blocked requests  ${blocked.size ? '' : 'none'}`)
  for (const [host, entry] of [...blocked].sort((a, b) => b[1].count - a[1].count)) {
    console.log(`  ${String(entry.count).padStart(4)}  ${host}   e.g. ${entry.sample}`)
  }
}

const page = await context.newPage()
const consoleErrors: string[] = []
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 300))
})
page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message.slice(0, 300)}`))

try {
  const url = `${rapidUrl}/?scene=${scene.name}#map=${zoom}/${scene.center[1]}/${scene.center[0]}`
  console.log(`open ${url} (${headed ? 'headed' : 'headless'}, ${VIEWPORT.width}x${VIEWPORT.height})`)
  const t0 = performance.now()
  await page.goto(url)
  await page.evaluate(() => window.__bench.ready())
  const tReady = performance.now() - t0
  await page.evaluate(() => window.__bench.settled())
  const tSettled = performance.now() - t0
  await page.evaluate(() => (window.__bench.settled as (o: object) => Promise<void>)({ idle: true, timeoutMs: 120000 }))
  const tIdle = performance.now() - t0

  const info = await page.evaluate(() => {
    const bench = window.__bench
    const extra = (window as any).__benchRapid
    const camera = bench.getCamera()
    const a = bench.project(camera.lng, camera.lat)
    const b = bench.project(camera.lng + 360 / 2 ** camera.zoom, camera.lat)
    return {
      editor: bench.editor,
      version: bench.version,
      camera,
      stats: bench.stats(),
      renderer: extra.renderer(),
      pxPerTile: b.x - a.x,
      centre: a,
      boot: extra.boot,
      map: (() => {
        const r = document.querySelector('.main-map')!.getBoundingClientRect()
        return { x: r.left, y: r.top, width: r.width, height: r.height }
      })(),
      metrics: extra.metrics(),
      measures: extra.measures().length,
      dpr: window.devicePixelRatio,
      modal: !!document.querySelector('.modal, .shaded'),
      canvas: (() => {
        const canvas = document.querySelector('canvas')
        return canvas ? { width: canvas.width, height: canvas.height } : null
      })(),
    }
  })
  console.log(`editor            ${info.editor} ${info.version}`)
  console.log(`time to ready     ${tReady.toFixed(0)} ms (from navigation start)`)
  console.log(`time to settled   ${tSettled.toFixed(0)} ms (from navigation start, picture final)`)
  console.log(`time to idle      ${tIdle.toFixed(0)} ms (from navigation start, settled({ idle: true }): validation and pane updates done)`)
  console.log(`boot              ${JSON.stringify(info.boot)} (ms since navigation start)`)
  console.log(`camera            ${JSON.stringify(info.camera)}`)
  console.log(`stats             ${JSON.stringify(info.stats)}`)
  console.log(`renderer          ${JSON.stringify(info.renderer)}`)
  console.log(`canvas            ${JSON.stringify(info.canvas)} dpr ${info.dpr}`)
  console.log(`scheduler.metrics ${JSON.stringify(info.metrics)}`)
  console.log(`app-N/draw-N performance measures: ${info.measures}`)

  check(Math.abs(info.camera.zoom - zoom) < 0.01, `camera zoom is ${info.camera.zoom}, asked for ${zoom}`)
  check(
    Math.abs(info.camera.lng - scene.center[0]) < 1e-5 && Math.abs(info.camera.lat - scene.center[1]) < 1e-5,
    'camera is at the scene centre'
  )
  check(Math.abs(info.pxPerTile - 256) < 0.5, `zoom is the OSM zoom: one z${zoom} tile is ${info.pxPerTile.toFixed(2)} css px wide (256 expected)`)
  check(info.stats.entities.ways > 0 && info.stats.entities.nodes > 0, 'entities are loaded from the mock API')
  check((info.stats.drawn['osm.lines'] ?? 0) > 0, `lines are drawn (${info.stats.drawn['osm.lines'] ?? 0})`)
  check((info.stats.drawn['osm.polygons'] ?? 0) > 0, `polygons are drawn (${info.stats.drawn['osm.polygons'] ?? 0})`)
  check(!info.modal, 'no modal dialog covers the map')
  check(
    info.map.x === 0 && info.map.y === 0 && info.map.width === VIEWPORT.width && info.map.height === VIEWPORT.height,
    `the map fills the viewport (${JSON.stringify(info.map)})`
  )
  check(
    Math.abs(info.centre.x - VIEWPORT.width / 2) < 0.51 && Math.abs(info.centre.y - VIEWPORT.height / 2) < 0.51,
    `project(camera) is the centre of the viewport (${info.centre.x}, ${info.centre.y})`
  )
  const gpu = String(info.renderer.renderer ?? '')
  check(!/swiftshader|llvmpipe|software/i.test(gpu) && gpu.length > 0, `WebGL runs on a real GPU: ${gpu}`)

  if (!process.argv.includes('--no-screenshot')) {
    const file = join(import.meta.dir, scene.name === 'small' ? 'smoke.png' : `smoke-${scene.name}.png`)
    await page.screenshot({ path: file })
    console.log(`screenshot        ${file}`)
  }

  // A highway that is drawn, with a point on it that is well inside the map area.
  const target = await page.evaluate(() => {
    const rapid = (window as any).rapidContext
    const graph = rapid.systems.editor.staging.graph
    const layer = rapid.systems.gfx.scene.layers.get('osm')
    const rect = rapid.systems.gfx.supersurface.parentElement.getBoundingClientRect()
    const seenIds = new Set<string>()
    // Screen positions of everything drawn as a point (POIs, vertices): they sit on top of
    // lines and win the hover, so the test point must keep clear of them.
    const pins: { x: number; y: number }[] = []
    for (const feature of layer.features.values()) {
      const loc = feature.visible && feature.data?.type === 'node' ? feature.data.loc : null
      if (loc) pins.push(window.__bench.project(loc[0], loc[1]))
    }
    // Of all segment midpoints of drawn highways, take the one farthest from any pin.
    let best: { id: string; lng: number; lat: number; x: number; y: number; clearance: number } | null = null
    for (const feature of layer.features.values()) {
      const way = feature.data
      if (!feature.visible || feature.type !== 'LineString' || way?.type !== 'way' || seenIds.has(way.id)) continue
      seenIds.add(way.id)
      // Roads only: next to a road, a footway loses the hover to the road's wider hit area.
      if (!/^(residential|tertiary|secondary|primary|unclassified|living_street)$/.test(way.tags.highway ?? '')) continue
      const nodes = way.nodes.map((id: string) => graph.hasEntity(id)).filter(Boolean)
      for (let i = 0; i < nodes.length - 1; i++) {
        const lng = (nodes[i].loc[0] + nodes[i + 1].loc[0]) / 2
        const lat = (nodes[i].loc[1] + nodes[i + 1].loc[1]) / 2
        const p = window.__bench.project(lng, lat)
        if (p.x < rect.left + 100 || p.x > rect.right - 150 || p.y < rect.top + 100 || p.y > rect.bottom - 100) continue
        let clearance = Infinity
        for (const pin of pins) clearance = Math.min(clearance, Math.hypot(pin.x - p.x, pin.y - p.y))
        if (!best || clearance > best.clearance) best = { id: way.id, lng, lat, x: p.x, y: p.y, clearance }
      }
    }
    return best
  })
  check(!!target && target.clearance >= 12, `found a highway in the view to select and hover${target ? `: ${target.id} (${target.clearance.toFixed(0)} px clear of the nearest point)` : ''}`)

  if (target) {
    const tSelect = await page.evaluate(async (id) => {
      const t = performance.now()
      await window.__bench.select(id)
      return performance.now() - t
    }, target.id)
    const selected = await page.evaluate(() => window.__bench.selected())
    console.log(`select(${target.id}) drawn after ${tSelect.toFixed(0)} ms, selected() = ${JSON.stringify(selected)}`)
    check(selected.length === 1 && selected[0] === target.id, 'select() selects the way through select-osm mode')
    await page.evaluate(() => window.__bench.settled())
    await page.evaluate(() => window.__bench.select(null))
    check((await page.evaluate(() => window.__bench.selected())).length === 0, 'select(null) clears the selection')
    await page.evaluate(() => window.__bench.settled())

    // Real pointer events: approach the line in steps, as a hand would.
    const p = await page.evaluate(([lng, lat]) => window.__bench.project(lng!, lat!), [target.lng, target.lat])
    await page.mouse.move(p.x - 80, p.y - 60)
    await page.mouse.move(p.x, p.y, { steps: 10 })
    // Rapid handles the last pointer position on a later frame; let that land and be drawn.
    await page.waitForTimeout(100)
    await page.evaluate(() => window.__bench.settled())
    await page.waitForFunction(() => window.__bench.hovered().length > 0, undefined, { timeout: 3000 }).catch(() => {})
    const hovered = await page.evaluate(() => window.__bench.hovered())
    console.log(`mouse at ${p.x.toFixed(0)},${p.y.toFixed(0)}; hovered() = ${JSON.stringify(hovered)}`)
    // In dense data another feature can lie on top of the chosen line (tram track, pedestrian
    // area) or have a wider hit area next to it. Then Rapid rightly reports that one, so only an empty result fails.
    check(hovered.length > 0, `hovering reports a feature (${hovered.includes(target.id) ? 'the selected way' : `not ${target.id}, something drawn above it`})`)
    await page.mouse.move(5, VIEWPORT.height - 5)
    await page.evaluate(() => window.__bench.settled())
  }

  const mapCalls = mockResponses.filter((entry) => entry.path.includes('/api/0.6/map'))
  const other = [...new Set(mockResponses.filter((entry) => !entry.path.includes('/api/0.6/map')).map((entry) => `${entry.status} ${entry.path}`))]
  console.log(`mock API          ${mapCalls.length} map calls, other: ${JSON.stringify(other)}`)
  check(mapCalls.length > 0 && mapCalls.every((entry) => entry.status === 200), 'OSM data came from the mock API, all map calls 200')
  check(mockResponses.every((entry) => entry.path.startsWith(`/s/${scene.name}/`)), `every API call went to scene "${scene.name}"`)
  check(mockResponses.every((entry) => entry.status < 400), 'no mock API call failed')
  printRequests()
  const refused = await page.evaluate(() => (window as any).__benchRapid.refused)
  console.log(`refused in page   ${JSON.stringify(refused)} (offline guard in bench.js, these never became requests)`)
  const osmHosts = [...blocked.keys()].filter((host) => OSM_INFRA.test(host))
  check(osmHosts.length === 0, `no request to OSM infrastructure was attempted${osmHosts.length ? `: ${osmHosts.join(', ')}` : ''}`)
  if (consoleErrors.length) {
    console.log(`console errors (${consoleErrors.length}):`)
    for (const line of [...new Set(consoleErrors)].slice(0, 15)) console.log(`  ${line}`)
  }
} catch (error) {
  failures.push(String((error as Error)?.message ?? error))
  console.error(error)
  printRequests()
  const why = await page.evaluate(() => (window as any).__benchRapid?.blockers?.()).catch(() => null)
  if (why) console.error(`blockers: ${JSON.stringify(why)}`)
  if (consoleErrors.length) console.error(`console errors: ${JSON.stringify([...new Set(consoleErrors)].slice(0, 15), null, 1)}`)
} finally {
  await browser.close()
  for (const server of servers) server.stop(true)
}

if (failures.length) {
  console.error(`\nsmoke FAILED (${failures.length}):\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
console.log('\nsmoke passed')
