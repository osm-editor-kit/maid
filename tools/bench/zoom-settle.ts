/**
 * Maid only: how long until the picture is final after jumping two zoom levels in and back out.
 *   bun tools/bench/zoom-settle.ts [scene] ["maid query"]
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
const result = await page.evaluate(async () => {
  const start = window.__bench.getCamera()
  const jump = async (zoom: number) => {
    const t = performance.now()
    window.__bench.setCamera({ ...start, zoom })
    await window.__bench.settled()
    return performance.now() - t
  }
  const zoomIn: number[] = []
  const zoomOut: number[] = []
  for (let i = 0; i < 5; i++) {
    zoomIn.push(await jump(start.zoom + 2))
    zoomOut.push(await jump(start.zoom))
  }
  return { zoomIn, zoomOut }
})
const r = (values: number[]) => `${Math.round(median(values))} (${Math.round(Math.min(...values))}–${Math.round(Math.max(...values))})`
console.log(`${scene.name} ${query || 'default'}: in ${r(result.zoomIn)} ms, out ${r(result.zoomOut)} ms`)
await browser.close()
