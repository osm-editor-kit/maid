/**
 * Repeats the benchmark's hover phase on many targets and finds where it hangs.
 *
 *   bun tools/bench/hover-probe.ts [scene] [rounds] [port]
 *
 * Needs a Maid page on the port (default 5173: `bun run dev`). Every round parks the pointer in a corner, arms
 * `__probe.hoverLatency` and moves onto a target the way the runner does. Targets are the features the map draws
 * at a grid of pixels (points, vertices, lines, areas), the selected feature, and a feature hovered twice in a
 * row; some rounds start with a selection. A round that does not finish in a few seconds is a hang: the target,
 * the state before and the page's debug state are printed. Exit code 1 when anything hung.
 */
import { chromium } from '@playwright/test'
import { getScene } from '../fixtures/scenes'
import { noBackground } from './no-background'
import { installProbe } from './probe-page'

const [sceneName = 'dense', roundsArg = '60', portArg = '5173'] = process.argv.slice(2)
const rounds = Number(roundsArg)
const scene = getScene(sceneName)
const VIEWPORT = { width: 1600, height: 1000 }

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const context = await browser.newContext({ viewport: VIEWPORT, bypassCSP: true })
await context.route(
  (url) => !['localhost', '127.0.0.1'].includes(url.hostname),
  (route) => route.abort(),
)
await context.addInitScript(installProbe)
const page = await context.newPage()
page.on('pageerror', (e) => console.log('[pageerror]', e.message))
const [lng, lat] = scene.center
await page.goto(
  noBackground(`http://localhost:${portArg}/?scene=${scene.name}#map=${scene.zoom}/${lat}/${lng}`),
)
await page.waitForFunction(() => window.__bench !== undefined, undefined, { timeout: 60000 })
await page.evaluate(() => window.__bench.ready())
await page.evaluate(() => window.__bench.settled())

/** Pixels where a real pointer shows a hover highlight, with the id shown (found by moving the mouse) */
const found: { x: number; y: number; id: string }[] = []
{
  const seen = new Set<string>()
  for (let x = 220; x < VIEWPORT.width - 220; x += 41) {
    for (let y = 150; y < VIEWPORT.height - 150; y += 41) {
      await page.mouse.move(x, y)
      await page.waitForTimeout(40)
      const id = (await page.evaluate(() => window.__bench.hovered()))[0]
      if (id && !seen.has(id)) {
        seen.add(id)
        found.push({ x, y, id })
      }
    }
  }
}
console.log(`${found.length} distinct hover targets found`)
const kinds = (id: string) => (id[0] === 'n' ? 'node' : id[0] === 'w' ? 'way' : 'relation')

const park = async () => {
  for (const [x, y] of [
    [3, 3],
    [VIEWPORT.width - 3, 3],
    [3, VIEWPORT.height - 3],
  ] as const) {
    await page.mouse.move(x, y)
    await page.waitForTimeout(100)
    if ((await page.evaluate(() => window.__bench.hovered())).length === 0) return true
  }
  return false
}

let hangs = 0
let done = 0
const attempt = async (label: string, x: number, y: number, id: string) => {
  const parked = await park()
  const before = await page.evaluate(() => ({
    hovered: window.__bench.hovered(),
    selected: window.__bench.selected(),
  }))
  // RACY=1: arm and move without waiting for the arm, as the runner did before (the move can arrive first)
  let latency: Promise<number>
  if (process.env.RACY) {
    latency = page.evaluate(() => window.__probe.hoverLatency())
    await page.mouse.move(x, y)
  } else {
    await page.evaluate(() => window.__probe.armHover())
    await page.mouse.move(x, y)
    latency = page.evaluate(() => window.__probe.hoverLatency())
  }
  const result = await Promise.race([
    latency.catch((error: Error) => `rejected: ${error.message.slice(0, 160)}`),
    new Promise<'hang'>((resolve) => setTimeout(() => resolve('hang'), 12000)),
  ])
  done++
  if (typeof result === 'string') {
    hangs++
    const state = await page.evaluate(() => (window as any).__maid.debug())
    console.log(
      `${result === 'hang' ? 'HANG' : result} #${done} ${label} ${id} (${kinds(id)}) at ${x},${y}; parked ${parked}; before ${JSON.stringify(before)}; shown ${JSON.stringify(state.engine?.shown)}; hover requested ${JSON.stringify(await page.evaluate(() => (window as any).__maid.engine.debugState?.().hover ?? null))}`,
    )
    return false
  }
  if (result < 0)
    console.log(
      `timeout-resolved (-1) ${label} ${id} (${kinds(id)}); before ${JSON.stringify(before)}`,
    )
  return true
}

for (let round = 0; round < rounds; round++) {
  const target = found[round % found.length]!
  // every third round starts with a selection: the feature itself or another one
  if (round % 3 === 1) await page.evaluate((id) => window.__bench.select(id), target.id)
  else if (round % 3 === 2)
    await page.evaluate((id) => window.__bench.select(id), found[(round * 7) % found.length]!.id)
  else await page.evaluate(() => (window as any).__maid.engine.setSelected(null))
  await attempt(`round ${round} (selection ${round % 3})`, target.x, target.y, target.id)
  // the same feature again without leaving it: no state change
  await attempt(`round ${round} again`, target.x + 1, target.y, target.id)
}
console.log(`${done} hovers, ${hangs} hangs`)
await browser.close()
process.exit(hangs > 0 ? 1 : 0)
