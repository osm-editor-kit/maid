/**
 * Screenshots of Maid Lanes at given places, for the street drawing: no request outside localhost, no background.
 *
 *   bun tools/bench/street-shot.ts <out-dir> <scene> <zoom/lat/lon> [<zoom/lat/lon> ...] [--query a=b]
 */
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { PORTS } from '../ports'

const args = process.argv.slice(2)
const queryIndex = args.indexOf('--query')
const query = queryIndex >= 0 ? `&${args[queryIndex + 1]}` : ''
const [out = 'reports/street', scene = 'dense', ...places] = queryIndex >= 0 ? args.slice(0, queryIndex) : args
mkdirSync(out, { recursive: true })
const port = PORTS.maidLanes
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const context = await browser.newContext({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 2 })
const blocked = new Set<string>()
await context.route(
  (url) => !['localhost', '127.0.0.1'].includes(url.hostname),
  (route) => {
    blocked.add(new URL(route.request().url()).hostname)
    return route.abort()
  },
)
const page = await context.newPage()
page.on('pageerror', (error) => console.log('[pageerror]', error.message))
page.on('console', (msg) => {
  if (msg.type() === 'error') console.log('[error]', msg.text().slice(0, 300))
})
for (const [i, place] of places.entries()) {
  await page.goto(`http://localhost:${port}/?scene=${scene}${query}#map=${place}&background=none`)
  await page.waitForFunction(() => window.__bench !== undefined, undefined, { timeout: 30000 })
  await page.evaluate(() => window.__bench.ready())
  await page.evaluate(() => window.__bench.settled())
  await page.waitForTimeout(3000)
  if (process.env.STREET_KEY) {
    await page.mouse.click(900, 500)
    await page.keyboard.press('Escape')
    await page.keyboard.press(process.env.STREET_KEY)
    await page.waitForTimeout(800)
  }
  if (process.env.STREET_HIDE) {
    await page.evaluate(() => {
      const map = (window as unknown as { __maid: { map: { getStyle(): { layers: { id: string }[] }; setLayoutProperty(id: string, k: string, v: string): void } } }).__maid.map
      for (const layer of map.getStyle().layers) if (layer.id.startsWith('maid-street')) map.setLayoutProperty(layer.id, 'visibility', 'none')
    })
    await page.waitForTimeout(500)
  }
  const file = `${out}/${i}-${place.replaceAll('/', '_')}.png`
  await page.screenshot({ path: file })
  console.log(file)
}
if (blocked.size) console.log('blocked:', [...blocked].join(', '))
await browser.close()
