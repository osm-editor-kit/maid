/**
 * Runs the MapLibre reproduction pages in Chrome and prints their results.
 *   bun tools/maplibre-repro/run.ts [runs per mode]
 * Serves MapLibre from this repo's node_modules, so no request leaves the machine.
 */
import { chromium } from '@playwright/test'
import { join } from 'node:path'

const dir = import.meta.dir
const maplibre = join(dir, '../../apps/maid/node_modules/maplibre-gl')
const server = Bun.serve({
  port: 0,
  fetch(req) {
    const { pathname } = new URL(req.url)
    if (pathname.startsWith('/maplibre-gl/')) return new Response(Bun.file(join(maplibre, pathname.slice('/maplibre-gl/'.length))))
    return new Response(Bun.file(join(dir, pathname.slice(1))))
  },
})
const runs = Number(process.argv[2] ?? 5)
const browser = await chromium.launch({ channel: 'chrome', headless: true })
for (const query of (process.argv[3] ?? 'gap=30,gap=30&restyle=1,gap=30&sort=1,gap=30&restyle=1&sort=1,serial=1&restyle=1&sort=1').split(',')) {
  for (let i = 0; i < runs; i++) {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 })
    await page.route((url) => url.hostname !== 'localhost', (route) => route.abort())
    await page.goto(`http://localhost:${server.port}/updatedata-overlap.html?${query}`)
    const result = await page.waitForFunction(() => (window as any).__result, undefined, { timeout: 60000 }).then((h) => h.jsonValue())
    console.log(JSON.stringify(result))
    await page.close()
  }
}
await browser.close()
server.stop()
