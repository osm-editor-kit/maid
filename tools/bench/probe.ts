/** Scratch probe: bun tools/bench/probe.ts "<query>" <zoom> "<js expression evaluated after settle>" */
import { chromium } from '@playwright/test'
import { getScene } from '../fixtures/scenes'
const [query = '', zoom = '18', expr = '1', sceneName = 'medium'] = process.argv.slice(2)
const scene = getScene(sceneName)
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 })).newPage()
page.on('console', (m) => m.type() === 'error' && console.log('[error]', m.text().slice(0, 200)))
await page.goto(`http://localhost:5173/?scene=${sceneName}&${query}#map=${zoom}/${scene.center[1]}/${scene.center[0]}`)
await page.waitForFunction(() => window.__bench !== undefined)
await page.evaluate(() => window.__bench.settled())
console.log(JSON.stringify(await page.evaluate(`(async () => { ${expr} })()`)))
await browser.close()
