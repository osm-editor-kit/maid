/**
 * Quick look at one editor: opens a scene, waits until settled, prints stats and saves a screenshot.
 *
 *   bun tools/bench/shot.ts maid medium [zoom] [out.png] [extra query]
 */
import { chromium } from '@playwright/test'
import { getScene } from '../fixtures/scenes'
import { PORTS } from '../ports'

const [
  editor = 'maid',
  sceneName = 'small',
  zoom = '17',
  out = `reports/shots/${editor}-${sceneName}-z${zoom}.png`,
  query = '',
] = process.argv.slice(2)
const scene = getScene(sceneName)
const port = PORTS[editor as 'maid' | 'id' | 'rapid']
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const context = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 2,
})
const page = await context.newPage()
const blocked = new Map<string, number>()
await context.route(
  (url) => !['localhost', '127.0.0.1'].includes(url.hostname),
  (route) => {
    const host = new URL(route.request().url()).hostname
    blocked.set(host, (blocked.get(host) ?? 0) + 1)
    return route.abort()
  },
)
page.on('console', (msg) => {
  if (msg.text().includes('could not be loaded')) return
  if (msg.type() === 'error' || msg.type() === 'warning')
    console.log(`[${msg.type()}]`, msg.text().slice(0, 300))
})
page.on('pageerror', (error) => console.log('[pageerror]', error.message))
const t0 = performance.now()
await page.goto(
  `http://localhost:${port}/?scene=${sceneName}${query ? `&${query}` : ''}#map=${zoom}/${scene.center[1]}/${scene.center[0]}`,
)
await page.waitForFunction(() => window.__bench !== undefined, undefined, { timeout: 30000 })
await page.evaluate(() => window.__bench.ready())
await page.evaluate(() => window.__bench.settled())
console.log(`settled after ${Math.round(performance.now() - t0)}ms`)
console.log(JSON.stringify(await page.evaluate(() => window.__bench.stats()), null, 1))
await page.screenshot({ path: out })
console.log(`screenshot: ${out}`)
if (blocked.size) console.log('blocked:', Object.fromEntries(blocked))
await browser.close()
