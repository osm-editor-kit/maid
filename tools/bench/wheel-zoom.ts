/**
 * Maid only: where the time goes after a mouse-wheel zoom. Zooms two levels in and back out
 * three times and prints, counted from the last wheel event: camera at rest (moveend), tiles
 * loaded, MapLibre idle (symbols placed and faded in).
 *   bun tools/bench/wheel-zoom.ts [scene] ["maid query"]
 * Needs the mock API and a Maid preview on the maidBuild port.
 */
import { chromium } from '@playwright/test'
import { getScene } from '../fixtures/scenes'
import { PORTS } from '../ports'
import { median } from './stats'

const [sceneName = 'dense', query = ''] = process.argv.slice(2)
const scene = getScene(sceneName)
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 })
await context.route((url) => !['localhost', '127.0.0.1'].includes(url.hostname), (route) => route.abort())
const page = await context.newPage()
await page.goto(`http://localhost:${PORTS.maidBuild}/?scene=${scene.name}&${query}#map=${scene.zoom}/${scene.center[1]}/${scene.center[0]}`)
await page.waitForFunction(() => window.__bench !== undefined)
await page.evaluate(() => window.__bench.settled())
await page.mouse.move(800, 500)

type Marks = { rest: number; tiles: number; idle: number }
const rows: Record<'in' | 'out', Marks[]> = { in: [], out: [] }
for (let round = 0; round < 3; round++) {
  for (const direction of ['in', 'out'] as const) {
    const target = direction === 'in' ? scene.zoom + 2 : scene.zoom
    for (let i = 0; i < 400; i++) {
      await page.mouse.wheel(0, direction === 'in' ? -40 : 40)
      await page.waitForTimeout(12)
      const zoom = await page.evaluate(() => window.__bench.getCamera().zoom)
      if (direction === 'in' ? zoom >= target : zoom <= target) break
    }
    rows[direction].push(
      await page.evaluate(async () => {
        const { map } = (window as any).__maid
        const t0 = performance.now()
        const marks = { rest: 0, tiles: 0, idle: 0 }
        await new Promise<void>((resolve) => {
          const tick = () => {
            const now = performance.now() - t0
            if (!marks.rest && !map.isMoving()) marks.rest = now
            if (marks.rest && !marks.tiles && map.areTilesLoaded()) marks.tiles = now
            if (marks.idle) resolve()
            else requestAnimationFrame(tick)
          }
          map.once('idle', () => (marks.idle = performance.now() - t0))
          map.triggerRepaint()
          tick()
        })
        await (window as any).__bench.settled()
        return marks
      }),
    )
  }
}
const fmt = (list: Marks[], key: keyof Marks) => String(Math.round(median(list.map((m) => m[key])))).padStart(5)
for (const direction of ['in', 'out'] as const) {
  console.log(`${scene.name} ${query || 'default'} zoom ${direction}: camera at rest ${fmt(rows[direction], 'rest')} ms, tiles loaded ${fmt(rows[direction], 'tiles')} ms, idle ${fmt(rows[direction], 'idle')} ms   (rounds: ${rows[direction].map((m) => Math.round(m.idle)).join(', ')})`)
}
await browser.close()
