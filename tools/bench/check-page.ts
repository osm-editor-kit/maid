/**
 * What the browser checks share: a Maid page on a scene with every request outside localhost
 * blocked, a reporter that prints `ok` or `FAIL` lines, and a reader for what the map has in its
 * sources.
 */
import { chromium, type Page } from '@playwright/test'
import { EDIT_SOURCES, SOURCES } from '../../packages/renderer/src/layers'
import { getScene } from '../fixtures/scenes'
import { PORTS } from '../ports'

export type Check = {
  page: Page
  /** Prints one line and counts a failure when expected and actual differ (compared as JSON) */
  report: (label: string, expected: unknown, actual: unknown) => void
  /** Resolves when the map has drawn everything that was asked for */
  settle: () => Promise<void>
  /** Per id: the kinds of source (areas, lines, points, vertices) that hold a visible feature for it */
  drawnIn: (ids: string[]) => Promise<Record<string, string[]>>
}

/** Opens the scene, runs `body` and returns the exit code: 1 if anything failed */
export async function runCheck(
  sceneName: string,
  body: (check: Check) => Promise<void>,
  /** More URL parameters, e.g. `filters=buildings:hidden` */
  query = '',
  /** A browser with a touch screen, for checks that send touch events */
  hasTouch = false,
): Promise<number> {
  const scene = getScene(sceneName)
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  let failed = 0
  const report: Check['report'] = (label, expected, actual) => {
    if (JSON.stringify(expected) === JSON.stringify(actual)) console.log(`ok ${label}`)
    else {
      failed++
      console.log(
        `FAIL ${label}: expected ${JSON.stringify(expected)}, actual ${JSON.stringify(actual)}`,
      )
    }
  }
  try {
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, hasTouch })
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
    page.on('pageerror', (error) => report('no uncaught page error', 'none', error.message))
    await page.goto(
      `http://localhost:${PORTS.maid}/?scene=${sceneName}${query ? `&${query}` : ''}#map=${scene.zoom}/${scene.center[1]}/${scene.center[0]}`,
    )
    await page.waitForFunction(() => (window as any).__bench !== undefined, undefined, {
      timeout: 30000,
    })
    await page.evaluate(() => (window as any).__bench.ready())
    const settle = () => page.evaluate(() => (window as any).__bench.settled()) as Promise<void>
    await settle()
    const pairs = (Object.keys(EDIT_SOURCES) as (keyof typeof EDIT_SOURCES)[]).map(
      (name): [string, string, string] => [name, SOURCES[name], EDIT_SOURCES[name]],
    )
    const drawnIn: Check['drawnIn'] = (ids) =>
      page.evaluate(
        ({ ids, pairs }) => {
          const { map } = (window as any).__maid
          const out: Record<string, string[]> = {}
          for (const id of ids) {
            out[id] = []
            for (const [name, base, live] of pairs) {
              const has = (source: string) =>
                map.querySourceFeatures(source).some((f: any) => String(f.id) === id)
              // a base copy that an edit replaced stays in its source, hidden by feature state
              const hidden = map.getFeatureState({ source: base, id })?.editing === true
              if (has(live) || (has(base) && !hidden)) out[id]!.push(name)
            }
          }
          return out
        },
        { ids, pairs },
      )
    await body({ page, report, settle, drawnIn })
    report('no request outside localhost', {}, Object.fromEntries(blocked))
    return failed ? 1 : 0
  } finally {
    await browser.close()
  }
}
