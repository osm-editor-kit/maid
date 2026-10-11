/**
 * Quick check of one editor: load a scene, drag the map for three seconds, print frames per second.
 *   bun tools/bench/quick-pan.ts <maid|id|rapid> [scene] [query] [runs]
 * Needs the servers running (bun run compare starts them all).
 */
import { chromium } from '@playwright/test'
import { getScene } from '../fixtures/scenes'
import { PORTS } from '../ports'
import { installProbe } from './probe-page'

const [editor = 'id', sceneName = 'medium', query = '', runs = '2'] = process.argv.slice(2)
const scene = getScene(sceneName)
const port = editor === 'maid' ? PORTS.maidBuild : PORTS[editor as 'id' | 'rapid']
const browser = await chromium.launch({ channel: 'chrome', headless: true })
for (let run = 0; run < Number(runs); run++) {
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 2,
    bypassCSP: true,
  })
  await context.route(
    (url) => !['localhost', '127.0.0.1'].includes(url.hostname),
    (route) => route.abort(),
  )
  await context.addInitScript(installProbe)
  const page = await context.newPage()
  const t0 = performance.now()
  await page.goto(
    `http://localhost:${port}/?scene=${scene.name}${query ? `&${query}` : ''}#map=${scene.zoom}/${scene.center[1]}/${scene.center[0]}`,
  )
  await page.waitForFunction(() => window.__bench !== undefined)
  await page.evaluate(() => window.__bench.ready())
  await page.evaluate(() => window.__bench.settled())
  const load = performance.now() - t0
  const fps: number[] = []
  const settle: number[] = []
  for (const [fromX, toX] of [
    [1100, 700],
    [700, 1100],
  ] as const) {
    await page.mouse.move(fromX, 300)
    await page.evaluate(() => window.__probe.start())
    await page.mouse.down()
    const t = performance.now()
    for (;;) {
      const k = Math.min(1, (performance.now() - t) / 3000)
      await page.mouse.move(fromX + (toX - fromX) * k, 300 + 300 * k)
      if (k >= 1) break
      await page.waitForTimeout(8)
    }
    await page.mouse.up()
    const rec = await page.evaluate(() => window.__probe.stop())
    fps.push(Math.round((rec.frames.length / rec.durationMs) * 10000) / 10)
    settle.push(
      Math.round(
        await page.evaluate(async () => {
          const t = performance.now()
          await window.__bench.settled()
          return performance.now() - t
        }),
      ),
    )
  }
  console.log(
    `${editor} ${scene.name} ${query || 'default'}: load ${Math.round(load)} ms, pan ${fps.join(' / ')} fps, final picture after ${settle.join(' / ')} ms`,
  )
  await context.close()
}
await browser.close()
