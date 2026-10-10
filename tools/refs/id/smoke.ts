/**
 * Smoke test for the iD reference: loads a scene from the mock API through our host page,
 * checks window.__bench end to end and proves that nothing left localhost.
 *
 *   bun tools/refs/id/smoke.ts [--scene small] [--zoom 17] [--build min|dev] [--cull 0]
 *                              [--validation 1] [--headed]
 *
 * Needs the mock API on PORTS.mockApi (bun tools/mock-osm-api/server.ts). Starts the iD
 * static server itself when PORTS.id is not answering.
 * Writes tools/refs/id/smoke.png + smoke.json (scene small) or smoke-<scene>.png/.json.
 * Exits non-zero on any failure, including any attempt to reach a non-localhost host.
 * --validation 1 keeps iD's validator running and checks that it finds issues (default: off, no issues).
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
const cull = arg('cull') !== '0'
const validation = arg('validation') === '1'
const headed = process.argv.includes('--headed')
const ID = `http://localhost:${PORTS.id}`
const MOCK = `http://localhost:${PORTS.mockApi}`
const outBase = join(
  import.meta.dir,
  (scene.name === 'small' ? 'smoke' : `smoke-${scene.name}`) + (cull ? '' : '-cull0') + (validation ? '-validation' : ''),
)
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

  const url = `${ID}/?scene=${scene.name}${build === 'dev' ? '&build=dev' : ''}${cull ? '' : '&cull=0'}${validation ? '&validation=1' : ''}#map=${zoom}/${scene.center[1]}/${scene.center[0]}`
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

  // Validation. iD's validator is off by default (index.html). Off: it must have seen the merged
  // data (merges > 0) and still report no issues. On (--validation 1): it must find issues in the scene.
  const issueCount = () => call<number>("return b._id.context.validator().getIssues({ what: 'all', where: 'all' }).length")
  const merges = await call<number>('return b._id.counters.merges')
  check(merges > 0, `map data was merged into iD (${merges} merges)`)
  let issueTotal: number
  if (validation) {
    // The validator works through the loaded data in idle time after the picture is final, so
    // wait until the count has not changed for 3 s (no fixed time: it depends on the scene and machine).
    const started = Date.now()
    let last = -1
    let stableSince = Date.now()
    issueTotal = 0
    while (Date.now() - started < 120000) {
      const now = await issueCount()
      if (now !== last) {
        last = now
        stableSince = Date.now()
      }
      issueTotal = now
      if (now > 0 && Date.now() - stableSince >= 3000) break
      await page.waitForTimeout(500)
    }
    const stable = issueTotal > 0 && Date.now() - stableSince >= 3000
    check(stable, `validation on: iD's validator found ${issueTotal} issues in scene ${scene.name}, count stable for 3 s (read at ${((Date.now() - started) / 1000).toFixed(1)} s)`)
  } else {
    await page.waitForTimeout(3000)
    issueTotal = await issueCount()
    check(issueTotal === 0, `validation off: iD's validator reports no issues after 3 s (${issueTotal})`)
  }
  console.log(`validator issues (validation ${validation ? 'on' : 'off'}): ${issueTotal}`)

  const mapRect = await page.evaluate(() => {
    const r = document.querySelector('.main-map')!.getBoundingClientRect()
    return { x: r.left, y: r.top, w: r.width, h: r.height }
  })
  check(
    mapRect.x === 0 && mapRect.y === 0 && mapRect.w === VIEWPORT.width && mapRect.h === VIEWPORT.height,
    `map fills the viewport (${JSON.stringify(mapRect)})`,
  )
  const centerPx = await call<{ x: number; y: number }>('const c = b.getCamera(); return b.project(c.lng, c.lat)')
  check(
    Math.abs(centerPx.x - VIEWPORT.width / 2) < 0.5 && Math.abs(centerPx.y - VIEWPORT.height / 2) < 0.5,
    `camera center projects to the viewport center (${centerPx.x.toFixed(1)}, ${centerPx.y.toFixed(1)})`,
  )
  const autoHidden: string[] = internals.features.autoHidden
  if (cull) console.log(`auto-hidden by iD: ${autoHidden.join(', ') || 'nothing'}`)
  else {
    check(autoHidden.length === 0, `?cull=0: iD auto-hides nothing (${autoHidden.join(', ') || 'nothing'})`)
    check(!Object.keys(stats.hidden).some((k) => k.startsWith('auto:')), `?cull=0: stats().hidden has no auto: entry (${JSON.stringify(stats.hidden)})`)
    const buildings = await call<number>("return document.querySelectorAll('.data-layer.osm .area-stroke > path.tag-building').length")
    check(buildings > 50, `?cull=0: buildings are drawn (${buildings})`)
  }

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
      if (p.x < 100 || p.x > innerWidth - 100 || p.y < 100 || p.y > innerHeight - 100) continue
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
        if (x < 100 || x > innerWidth - 100 || y < 100 || y > innerHeight - 100) continue
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

  // real drag: the gesture path (CSS transform first, redraw later) must settle too
  const empty = await call<{ x: number; y: number } | null>(`
    for (let y = 300; y < innerHeight - 200; y += 37) {
      for (let x = 300; x < innerWidth - 300; x += 41) {
        const el = document.elementFromPoint(x, y)
        if (el && el.matches('svg.surface')) return { x, y }
      }
    }
    return null`)
  check(empty, `found an empty spot on the map to drag from (${empty?.x},${empty?.y})`)
  if (empty) {
    const before = await call<{ lng: number; lat: number }>('return b.getCamera()')
    await page.mouse.move(empty.x, empty.y)
    await page.mouse.down()
    await page.mouse.move(empty.x + 150, empty.y + 90, { steps: 10 })
    const during = await call<boolean>('return b._id.state().transformed')
    await page.mouse.up()
    const drag = await call<{ ms: number; camera: any; state: any; changes: boolean; draws: number }>(`
      const t = performance.now()
      await b.settled()
      return { ms: performance.now() - t, camera: b.getCamera(), state: b._id.state(), changes: b._id.context.history().hasChanges(), draws: b._id.counters.completeDraws }`)
    console.log(`mouse drag by 150,90 px: transformed during drag = ${during}, settled ${drag.ms.toFixed(0)} ms after mouseup`)
    check(drag.camera.lng < before.lng && drag.camera.lat > before.lat, 'drag moved the camera west and north')
    check(!drag.state.transformed && !drag.state.pendingRedraw && drag.state.missingTiles.length === 0, 'settled after drag: transform reset, nothing queued, tiles loaded')
    check(!drag.changes, 'the drag did not edit anything')
    await page.waitForTimeout(1200)
    const later = await call<number>('return b._id.counters.completeDraws')
    check(later === drag.draws, `no full redraw in the 1.2 s after settled() following the drag (${drag.draws} -> ${later})`)
    await page.mouse.move(5, 5)
  }

  // The benchmark's pattern: setCamera() once per animation frame, then settled().
  const pan = await call<{ ms: number; frames: number; drawsDuring: number; draws: number; state: any; camera: any; target: any }>(`
    const c = b.getCamera()
    const n0 = b._id.counters.completeDraws
    const frames = 45
    const target = { lng: c.lng + frames * 0.00004, lat: c.lat, zoom: c.zoom }
    for (let i = 1; i <= frames; i++) {
      await new Promise((r) => requestAnimationFrame(r))
      b.setCamera({ lng: c.lng + i * 0.00004, lat: c.lat, zoom: c.zoom })
    }
    const drawsDuring = b._id.counters.completeDraws - n0
    const t = performance.now()
    await b.settled()
    return { ms: performance.now() - t, frames, drawsDuring, draws: b._id.counters.completeDraws, state: b._id.state(), camera: b.getCamera(), target }`)
  console.log(`setCamera() on ${pan.frames} consecutive frames: ${pan.drawsDuring} full redraws during the pan, settled ${pan.ms.toFixed(0)} ms after the last call`)
  check(Math.abs(pan.camera.lng - pan.target.lng) < 1e-6, 'per-frame setCamera ends at the last camera')
  check(!pan.state.transformed && !pan.state.pendingRedraw && pan.state.inflight === 0 && pan.state.missingTiles.length === 0, 'settled after per-frame setCamera: nothing queued, tiles loaded')
  await page.waitForTimeout(1200)
  const afterPan = await call<number>('return b._id.counters.completeDraws')
  check(afterPan === pan.draws, `no full redraw in the 1.2 s after settled() following per-frame setCamera (${pan.draws} -> ${afterPan})`)

  // camera round trip through setCamera + settled
  const moved = await call<{ from: any; camera: any; ms: number; state: any }>(`
    const c = b.getCamera()
    const t = performance.now()
    b.setCamera({ lng: c.lng + 0.002, lat: c.lat + 0.001, zoom: c.zoom })
    await b.settled()
    return { from: c, camera: b.getCamera(), ms: performance.now() - t, state: b._id.state() }`)
  console.log(`setCamera(+0.002, +0.001) settled after ${moved.ms.toFixed(0)} ms`)
  check(
    Math.abs(moved.camera.lng - (moved.from.lng + 0.002)) < 1e-6 && Math.abs(moved.camera.lat - (moved.from.lat + 0.001)) < 1e-6 && moved.camera.zoom === moved.from.zoom,
    'setCamera/getCamera round trip',
  )
  check(moved.state.missingTiles.length === 0 && !moved.state.transformed, 'settled after setCamera: tiles loaded, transform reset')

  // Real mouse drag on a vertex, in browse mode (NOTES.md "Dragging a vertex"). Press on the drawn
  // vertex's own touch target, hold Alt (iD then snaps to nothing, see modes/drag_node.js datum()),
  // move 60 px in 20 steps, release. iD must move the node by that offset.
  // The vertex must be clear of the sidebar edges and not connected to a hidden feature (iD refuses
  // to drag those, drag_node.js start()), and the press point must hit its own target, not a neighbour's.
  const vertex = await call<{ id: string; x: number; y: number; dx: number; dy: number } | null>(`
    const ctx = b._id.context
    const inside = (x, y) => x >= 150 && x <= innerWidth - 150 && y >= 150 && y <= innerHeight - 150
    const DIRECTIONS = [[1, 0], [-1, 0], [0, 1], [0, -1]]
    for (const g of document.querySelectorAll('.data-layer.osm .points-group.vertices > g.node.vertex')) {
      const id = Array.from(g.classList).find((c) => /^n\\d+$/.test(c))
      const node = id && ctx.hasEntity(id)
      if (!node || ctx.features().hasHiddenConnections(node, ctx.graph())) continue
      const p = b.project(node.loc[0], node.loc[1])
      if (!inside(p.x, p.y)) continue
      const hit = document.elementFromPoint(p.x, p.y)
      if (!hit || !hit.classList.contains('target') || !hit.__data__ || !hit.__data__.properties || !hit.__data__.properties.entity || hit.__data__.properties.entity.id !== id) continue
      for (const [ux, uy] of DIRECTIONS) {
        if (!inside(p.x + ux * 60, p.y + uy * 60)) continue
        return { id, x: p.x, y: p.y, dx: ux * 60, dy: uy * 60 }
      }
    }
    return null`)
  check(vertex, `found a drawn vertex to drag with its own target under the pointer (${vertex?.id} at ${vertex?.x.toFixed(0)},${vertex?.y.toFixed(0)})`)
  if (vertex) {
    const before = await call<[number, number] | undefined>(`return b.nodeLoc(${JSON.stringify(vertex.id)})`)
    await page.evaluate(() => {
      const w = window as any
      w.__frames = []
      w.__framesOn = true
      const tick = (t: number) => {
        if (!w.__framesOn) return
        w.__frames.push(t)
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
    const dragStart = performance.now()
    await page.keyboard.down('Alt')
    await page.mouse.move(vertex.x, vertex.y)
    await page.mouse.down()
    await page.mouse.move(vertex.x + vertex.dx, vertex.y + vertex.dy, { steps: 20 })
    await page.mouse.up()
    await page.keyboard.up('Alt')
    const dragMs = performance.now() - dragStart
    const frames = await page.evaluate(() => {
      const w = window as any
      w.__framesOn = false
      return w.__frames as number[]
    })
    const intervals = frames.slice(1).map((t, i) => t - frames[i]!).sort((a, b) => a - b)
    const median = intervals.length ? intervals[Math.floor(intervals.length / 2)]! : NaN
    const longest = intervals.length ? intervals[intervals.length - 1]! : NaN
    console.log(
      `vertex drag ${vertex.id}: mouse down, 20 moves, mouse up in ${dragMs.toFixed(0)} ms; ` +
        `${frames.length} animation frames, frame interval median ${median.toFixed(1)} ms, max ${longest.toFixed(1)} ms`,
    )
    check(frames.length > 5, `animation frames ran during the vertex drag (${frames.length})`)

    const settle = await call<{ ms: number; state: any; changes: boolean; mode: string }>(`
      const t = performance.now()
      await b.settled()
      return { ms: performance.now() - t, state: b._id.state(), changes: b._id.context.history().hasChanges(), mode: b._id.context.mode().id }`)
    const after = await call<[number, number] | undefined>(`return b.nodeLoc(${JSON.stringify(vertex.id)})`)
    const shift = await call<{ x: number; y: number } | null>(`
      const a = ${JSON.stringify(before ?? null)}
      const c = ${JSON.stringify(after ?? null)}
      if (!a || !c) return null
      const pa = b.project(a[0], a[1]), pc = b.project(c[0], c[1])
      return { x: pc.x - pa.x, y: pc.y - pa.y }`)
    console.log(
      `vertex drag: settled ${settle.ms.toFixed(0)} ms after mouse up, mode ${settle.mode}, ` +
        `nodeLoc ${JSON.stringify(before)} -> ${JSON.stringify(after)}, on screen ${shift ? `${shift.x.toFixed(1)},${shift.y.toFixed(1)}` : 'n/a'} px`,
    )
    const movedPx = shift ? Math.hypot(shift.x, shift.y) : NaN
    check(before !== undefined && after !== undefined && before[0] !== after[0], `nodeLoc of ${vertex.id} changed by the drag`)
    check(
      movedPx > 50 && movedPx < 70,
      `vertex moved by ${movedPx.toFixed(1)} px on screen (60 px requested)`,
    )
    check(
      shift !== null && Math.abs(shift.x - vertex.dx) < 5 && Math.abs(shift.y - vertex.dy) < 5,
      `vertex followed the pointer: ${shift?.x.toFixed(1)},${shift?.y.toFixed(1)} px for ${vertex.dx},${vertex.dy} requested`,
    )
    check(settle.changes, 'the vertex drag is an edit in iD history')
    check(settle.state.missingTiles.length === 0 && !settle.state.transformed && !settle.state.pendingRedraw, 'settled after vertex drag: nothing queued, tiles loaded')
    const drawsSettled = await call<number>('return b._id.counters.completeDraws')
    await page.waitForTimeout(1200)
    const drawsLater = await call<number>('return b._id.counters.completeDraws')
    check(drawsLater === drawsSettled, `no full redraw in the 1.2 s after settled() following the vertex drag (${drawsSettled} -> ${drawsLater})`)
    await page.mouse.move(5, 5)
  }

  const watchdog = await call<number>('return b._id.counters.watchdogClears')
  check(watchdog === 0, `throttle model held for the whole run, watchdog never fired (${watchdog})`)

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
        cull,
        validation: { enabled: validation, issues: issueTotal },
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
