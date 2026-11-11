/**
 * How far from its real position the map draws a node: the model's lon/lat against the position MapLibre keeps in
 * its GeoJSON tiles (quantised to the tile grid). Research for docs/research/projections-and-coordinates.md.
 *
 *   bun tools/bench/precision-probe.ts [scene] [port]
 *
 * Needs a Maid page on the port (default 5173: `bun run dev-maid` and `bun run dev-api`). For each MapLibre zoom it
 * reads every vertex and point the map holds in its sources (`querySourceFeatures`, which turns tile units back into
 * lon/lat) and compares it with the node's `loc` in the graph. Writes `reports/precision-probe.json`.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'
import { SOURCES } from '../../packages/renderer/src/layers'
import { getScene } from '../fixtures/scenes'
import { noBackground } from './no-background'

const [sceneName = 'small', portArg = '5173'] = process.argv.slice(2)
const scene = getScene(sceneName)
const ZOOMS = [15, 16, 17, 18, 19, 20, 21, 22, 23]

const browser = await chromium.launch({ channel: 'chrome', headless: true })
let exitCode = 0
try {
  const context = await browser.newContext({ viewport: { width: 1200, height: 800 } })
  await context.route(
    (url) => !['localhost', '127.0.0.1'].includes(url.hostname),
    (route) => route.abort(),
  )
  const page = await context.newPage()
  await page.goto(
    noBackground(
      `http://localhost:${portArg}/?scene=${sceneName}#map=${scene.zoom}/${scene.center[1]}/${scene.center[0]}`,
    ),
  )
  await page.waitForFunction(() => window.__bench !== undefined, undefined, { timeout: 60000 })
  await page.evaluate(() => window.__bench.ready())
  await page.evaluate(() => window.__bench.settled())

  const rows = []
  for (const zoom of ZOOMS) {
    await page.evaluate((zoom) => window.__maid.map.jumpTo({ zoom }), zoom)
    await page.evaluate(() => window.__bench.settled())
    const row = await page.evaluate(
      ({ sources, zoom }) => {
        const { map, engine } = window.__maid
        const graph = engine.data.history.staging.graph
        const lat0 = map.getCenter().lat
        const mPerDegLat = 111320
        const mPerDegLon = 111320 * Math.cos((lat0 * Math.PI) / 180)
        // metres per screen pixel on MapLibre's 512 px tiles
        const mPerPx = (40075016.686 * Math.cos((lat0 * Math.PI) / 180)) / (512 * 2 ** zoom)
        const errors: number[] = []
        for (const source of sources) {
          for (const feature of map.querySourceFeatures(source) as any[]) {
            if (feature.geometry.type !== 'Point') continue
            const id = String(feature.id)
            if (!id.startsWith('n')) continue
            const node = graph.hasEntity(id) as { loc?: [number, number] } | undefined
            if (!node?.loc) continue
            const [lon, lat] = feature.geometry.coordinates
            const dx = (lon - node.loc[0]) * mPerDegLon
            const dy = (lat - node.loc[1]) * mPerDegLat
            errors.push(Math.hypot(dx, dy))
          }
        }
        errors.sort((a, b) => a - b)
        const at = (q: number) =>
          errors[Math.min(errors.length - 1, Math.floor(q * errors.length))] ?? 0
        return {
          maplibreZoom: zoom,
          osmZoom: zoom + 1,
          tileZoom: Math.min(zoom, 17),
          samples: errors.length,
          medianCm: +(at(0.5) * 100).toFixed(2),
          p99Cm: +(at(0.99) * 100).toFixed(2),
          maxCm: +((errors.at(-1) ?? 0) * 100).toFixed(2),
          maxPx: +((errors.at(-1) ?? 0) / mPerPx).toFixed(2),
          cmPerPx: +(mPerPx * 100).toFixed(3),
        }
      },
      { sources: [SOURCES.vertices, SOURCES.points], zoom },
    )
    console.log(JSON.stringify(row))
    rows.push(row)
  }
  mkdirSync('reports', { recursive: true })
  writeFileSync(
    'reports/precision-probe.json',
    JSON.stringify({ scene: sceneName, latitude: scene.center[1], rows }, null, 2),
  )
  console.log('wrote reports/precision-probe.json')
} catch (error) {
  console.error(error)
  exitCode = 1
} finally {
  await browser.close()
}
process.exit(exitCode)
