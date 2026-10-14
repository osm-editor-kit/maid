/**
 * Data-change benchmark (Maid only): drags one node of a road 120 steps and measures the time
 * from each change until it is on screen. This is the renderer-specific part of editing.
 *
 *   bun tools/bench/edit.ts [scene] ["maid query"] [label]
 *
 * Needs the mock API and a Maid preview build running (bun run bench starts and stops its own;
 * for this script run `VITE_BENCH=1 bun run --cwd apps/maid build && bun run --cwd apps/maid preview --port 5175`).
 */
import { chromium } from '@playwright/test'
import { getScene } from '../fixtures/scenes'
import { PORTS } from '../ports'
import { median, quantile } from './stats'

const [sceneName = 'dense', query = '', label = 'default'] = process.argv.slice(2)
const scene = getScene(sceneName)
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const context = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 2,
})
await context.route(
  (url) => !['localhost', '127.0.0.1'].includes(url.hostname),
  (route) => route.abort(),
)
const page = await context.newPage()
page.on('pageerror', (e) => console.log('[pageerror]', e.message))
await page.goto(
  `http://localhost:${PORTS.maidBuild}/?scene=${scene.name}&${query}#map=${scene.zoom}/${scene.center[1]}/${scene.center[0]}`,
)
await page.waitForFunction(() => window.__bench !== undefined)
await page.evaluate(() => window.__bench.settled())

const result = await page.evaluate(async () => {
  const { engine, map } = window.__maid
  // a node in the middle of the longest road on screen, like a vertex someone would drag
  const ids = new Set<string>(
    map.queryRenderedFeatures({ layers: ['line-stroke-0'] }).map((f: any) => f.id),
  )
  let best: any
  for (const id of ids) {
    const way = engine.data.way(id)
    if (way?.tags?.highway && (!best || way.nodes.length > best.nodes.length)) best = way
  }
  const nodeId = best.nodes[Math.floor(best.nodes.length / 2)]
  const node = engine.data.node(nodeId)!
  const start = { lon: node.loc![0], lat: node.loc![1] }
  const frames: number[] = []
  let last = 0
  let running = true
  const tick = (now: number) => {
    if (last) frames.push(now - last)
    last = now
    if (running) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
  const latencies: number[] = []
  const t0 = performance.now()
  for (let i = 1; i <= 120; i++) {
    latencies.push(
      await engine.moveNodeStep(
        nodeId,
        start.lon + i * 0.000002,
        start.lat + Math.sin(i / 10) * 0.00002,
      ),
    )
  }
  const total = performance.now() - t0
  const tc = performance.now()
  // 120 steps are one undo step, as a drag would be
  engine.data.history.commit({ annotation: 'Moved a node', selectedIDs: [nodeId] })
  await engine.endDrag()
  await window.__bench.settled()
  const commitMs = performance.now() - tc
  running = false
  return {
    way: best.id,
    wayNodes: best.nodes.length,
    waysAtNode: engine.data.nodeWays.get(nodeId)!.length,
    entities: engine.data.counts(),
    latencies,
    frames,
    total,
    commitMs,
  }
})
const out = {
  scene: scene.name,
  label,
  query,
  entities: result.entities,
  way: `w${result.way} (${result.wayNodes} nodes, node shared by ${result.waysAtNode} ways)`,
  changeToScreenMs: {
    median: Math.round(median(result.latencies) * 10) / 10,
    p95: Math.round(quantile(result.latencies, 0.95) * 10) / 10,
    max: Math.round(Math.max(...result.latencies)),
  },
  firstChangeMs: Math.round(result.latencies[0]!),
  commitMs: Math.round(result.commitMs),
  changesPerSecond: Math.round((120 / result.total) * 1000),
  frameMs: {
    median: Math.round(median(result.frames) * 10) / 10,
    p95: Math.round(quantile(result.frames, 0.95) * 10) / 10,
    max: Math.round(Math.max(...result.frames)),
  },
}
console.log(JSON.stringify(out))
await page.screenshot({ path: `reports/shots/edit-${scene.name}-${label}.png` })
await browser.close()
