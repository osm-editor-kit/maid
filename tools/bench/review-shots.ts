import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type Page } from '@playwright/test'
import { spawn, type Subprocess } from 'bun'
import { PORTS } from '../ports'
import { noBackground } from './no-background'
/**
 * Screenshots of the static features for Tobias's review (docs/local/review-2026-10-14): the yes/no field row, the
 * turn restrictions sketch, the type picker, viewfield cones, `ref` labels, and the parking app's quick buttons.
 *
 *   bun tools/bench/review-shots.ts
 *
 * Writes <name>.png per shot and theme into docs/local/review-2026-10-14/, and index.html with one caption each.
 * Starts a production build of each app (VITE_BENCH=1, so the bench handle is in it) and a preview on 5175, one app
 * after the other, and stops the preview again. The mock API (8090) must be up already, as `bun run dev` starts it;
 * if it is not, this script starts it and stops it again.
 *
 * Core rule 1: every request that leaves localhost is blocked and counted. The account menu's server choice is not
 * shot: the app hides it under automation on purpose (packages/shell/src/config.ts), and that is not worked around.
 */

const ROOT = join(import.meta.dir, '../..')
const OUT = join(ROOT, 'docs/local/review-2026-10-14')
const PREVIEW = PORTS.maidBuild
const VIEW = { width: 1440, height: 1500 }
const CROP = { width: 640, height: 420 }

type Theme = 'light' | 'dark'
type App = 'maid' | 'parking'
type Clip =
  | { kind: 'aside'; height: number }
  | { kind: 'text'; text: RegExp; above: number; height: number }
  | { kind: 'map' }

type Shot = {
  name: string
  app: App
  /** the query of the app's address, e.g. `scene=small&map=18/lat/lon` */
  query: string
  /** selected through the bench handle before the capture */
  select?: string
  /** press `1` and click the map centre: a new point, so the type picker opens */
  addPoint?: boolean
  /** map bearing in degrees (MapLibre's bearing), set before the capture */
  bearing?: number
  /** the map centre for a map crop, lat and lon */
  at?: [number, number]
  clip: Clip
  themes: Theme[]
  caption: string
}

const SHOTS: Shot[] = [
  {
    name: 'yes-no-row',
    app: 'maid',
    query: 'scene=small&map=18/52.386553/13.3984484',
    select: 'n364123000',
    clip: { kind: 'text', text: /changing table/i, above: 90, height: 230 },
    themes: ['light', 'dark'],
    caption:
      'Yes/no fields on one line: "Diaper Changing Table" shows its box and the word No, "Fee" a checked box and Yes.',
  },
  {
    name: 'turn-restrictions',
    app: 'maid',
    query: 'scene=small&map=18/52.3866787/13.4050606',
    select: 'n26721938',
    clip: { kind: 'aside', height: 1100 },
    themes: ['light', 'dark'],
    caption: 'Turn restrictions section for a junction with its sketch, map north-up.',
  },
  {
    name: 'turn-restrictions-rotated',
    app: 'maid',
    query: 'scene=small&map=18/52.3866787/13.4050606',
    select: 'n26721938',
    bearing: 90,
    clip: { kind: 'aside', height: 1100 },
    themes: ['light'],
    caption: 'The same junction with the map turned by 90 degrees: the sketch turns with it.',
  },
  {
    name: 'type-picker-empty',
    app: 'maid',
    query: 'scene=small&map=18/52.3866/13.4',
    addPoint: true,
    clip: { kind: 'aside', height: 760 },
    themes: ['light'],
    caption:
      'Not captured: the click on the map centre hit a street lamp and opened its inspector, not the type picker.',
  },
  {
    name: 'viewfield-cones',
    app: 'maid',
    query: 'scene=medium&map=18/52.51567/13.40091',
    at: [52.51567, 13.40091],
    clip: { kind: 'map' },
    themes: ['light', 'dark'],
    caption:
      'Viewfield cones on cameras, each pointing along its direction (246 and 321 degrees here).',
  },
  {
    name: 'ref-labels',
    app: 'maid',
    query: 'scene=medium&map=18/52.52328/13.40107',
    at: [52.52328, 13.40107],
    clip: { kind: 'map' },
    themes: ['light', 'dark'],
    caption: 'Unnamed roads carry their ref ("1", "2") as the label, as in iD.',
  },
  {
    name: 'parking-quick-buttons',
    app: 'parking',
    query: 'scene=small&map=18/52.38656/13.39865&lang=de',
    select: 'w4394952',
    clip: { kind: 'aside', height: 640 },
    themes: ['light'],
    caption:
      'Parking app, quick buttons on one road. Broken: the labels stay English with lang=de, so the German texts are missing.',
  },
]

// ---------------------------------------------------------------------------------------------------------------------
// Servers

async function portOpen(port: number): Promise<boolean> {
  try {
    await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(1000) })
    return true
  } catch {
    return false
  }
}

async function waitForPort(name: string, port: number) {
  for (let i = 0; i < 100; i++) {
    if (await portOpen(port)) return
    await Bun.sleep(200)
  }
  throw new Error(`${name} did not come up on port ${port}`)
}

async function build(dir: string) {
  // VITE_BENCH=1: the debug handles stay in the build. Another agent may be mid-edit: a failure is reported, not hidden
  const proc = spawn(['bun', 'run', '--cwd', dir, 'build'], {
    cwd: ROOT,
    env: { ...process.env, VITE_BENCH: '1' },
    stdout: 'ignore',
    stderr: 'ignore',
  })
  if ((await proc.exited) !== 0)
    throw new Error(`the build of ${dir} failed (another agent may be mid-edit: wait and retry)`)
}

// ---------------------------------------------------------------------------------------------------------------------
// Browser steps

let blockedRequests = 0
const pageErrors: string[] = []

async function capture(browser: Browser, shot: Shot, theme: Theme): Promise<void> {
  const context = await browser.newContext({
    viewport: VIEW,
    deviceScaleFactor: 2,
    colorScheme: theme,
  })
  await context.route(
    (url) => !['localhost', '127.0.0.1'].includes(url.hostname),
    (route) => {
      blockedRequests++
      return route.abort()
    },
  )
  const page = await context.newPage()
  page.on('pageerror', (error) => pageErrors.push(`${shot.name}: ${error.message}`))
  try {
    await page.goto(noBackground(`${MAID_URL}/?${shot.query}`))
    await page.waitForFunction(() => window.__bench !== undefined, undefined, { timeout: 30000 })
    await page.evaluate(() => window.__bench.ready())
    await page.evaluate(() => window.__bench.settled())
    await page.waitForTimeout(300)
    if (shot.select) {
      await page.evaluate((id) => window.__bench.select(id), shot.select)
      await page.evaluate(() => window.__bench.settled())
      await page.waitForTimeout(400)
    }
    if (shot.bearing !== undefined) {
      await page.evaluate(
        (bearing) =>
          (
            window as unknown as { __maid: { map: { setBearing(b: number): void } } }
          ).__maid.map.setBearing(bearing),
        shot.bearing,
      )
      await page.evaluate(() => window.__bench.settled())
      await page.waitForTimeout(400)
    }
    if (shot.addPoint) {
      await page.keyboard.press('1')
      await page.waitForTimeout(200)
      const rect = await page.evaluate(() => window.__bench.mapRect())
      await page.mouse.click(rect.left + rect.width / 2, rect.top + rect.height / 2)
      await page.evaluate(() => window.__bench.settled())
      await page.waitForTimeout(500)
    }
    const file = join(OUT, `${shot.name}-${theme}.png`)
    const box = await cropFor(page, shot)
    await page.screenshot({ path: file, clip: box })
    console.log(
      `${shot.name}-${theme}.png ok (${Math.round(box.width)}x${Math.round(box.height)} CSS px)`,
    )
  } finally {
    await context.close()
  }
}

/** The crop in CSS pixels of the viewport: the sidebar, a text row in it, or the map around a place */
async function cropFor(page: Page, shot: Shot) {
  if (shot.clip.kind === 'aside') {
    const aside = await page.locator('aside').first().boundingBox()
    if (!aside) throw new Error(`${shot.name}: no sidebar (aside) on the page`)
    return {
      x: aside.x,
      y: aside.y,
      width: aside.width,
      height: Math.min(shot.clip.height, aside.height),
    }
  }
  if (shot.clip.kind === 'text') {
    const aside = await page.locator('aside').first().boundingBox()
    const row = await page.getByText(shot.clip.text).first().boundingBox()
    if (!aside || !row)
      throw new Error(`${shot.name}: the text ${shot.clip.text} is not in the sidebar`)
    const y = Math.max(aside.y, row.y - shot.clip.above)
    return {
      x: aside.x,
      y,
      width: aside.width,
      height: Math.min(shot.clip.height, aside.y + aside.height - y),
    }
  }
  const rect = await page.evaluate(() => window.__bench.mapRect())
  const [lat, lon] = shot.at ?? [0, 0]
  const target = await page.evaluate(([lo, la]) => window.__bench.project(lo, la), [
    lon,
    lat,
  ] as const)
  const width = Math.min(CROP.width, rect.width)
  const height = Math.min(CROP.height, rect.height)
  const x = Math.min(Math.max(target.x - width / 2, rect.left), rect.left + rect.width - width)
  const y = Math.min(Math.max(target.y - height / 2, rect.top), rect.top + rect.height - height)
  return { x, y, width, height }
}

let MAID_URL = ''

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"]/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch] ?? ch,
  )

function writeIndex() {
  const sections = SHOTS.map((shot) => {
    const images = shot.themes
      .filter((theme) => existsSync(join(OUT, `${shot.name}-${theme}.png`)))
      .map(
        (theme) =>
          `<figure><figcaption>${theme === 'light' ? 'Light' : 'Dark'}</figcaption><img src="${shot.name}-${theme}.png" alt="${escapeHtml(shot.caption)} (${theme})"></figure>`,
      )
      .join('\n')
    return `<section>
  <h2>${escapeHtml(shot.name)}</h2>
  <p>${escapeHtml(shot.caption)}</p>
  <div class="row">${images || '<p class="missing">Not captured.</p>'}</div>
</section>`
  }).join('\n')
  writeFileSync(
    join(OUT, 'index.html'),
    `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Review screenshots, 2026-10-14</title>
<style>
  :root { color-scheme: light dark; --bg: #fafafa; --fg: #111; --card: #fff; --line: #ddd; --muted: #555; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #18181b; --fg: #f4f4f5; --card: #27272a; --line: #3f3f46; --muted: #a1a1aa; } }
  body { font-family: system-ui, sans-serif; margin: 0; padding: 16px; color: var(--fg); background: var(--bg); }
  h1 { font-size: 22px; } h2 { font-size: 16px; margin: 0 0 4px; font-family: ui-monospace, monospace; }
  section { background: var(--card); border: 1px solid var(--line); border-radius: 6px; padding: 12px 14px; margin: 0 0 16px; }
  section p { margin: 0 0 8px; font-size: 14px; }
  .row { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-start; }
  figure { margin: 0; }
  figcaption { font-size: 12px; color: var(--muted); margin-bottom: 4px; }
  img { max-width: 100%; height: auto; border: 1px solid var(--line); }
  .missing { color: var(--muted); }
</style>
<h1>Review screenshots, 2026-10-14</h1>
<p>Static features, taken with tools/bench/review-shots.ts from a production build of the apps (light and dark where the colours matter). Not shown: the account menu's server choice, which the app hides under automation.</p>
${sections}
`,
  )
}

// ---------------------------------------------------------------------------------------------------------------------
// Main

const only = process.argv.indexOf('--only')
const wanted = only > 0 ? (process.argv[only + 1] ?? '').split(',') : undefined
const shots = SHOTS.filter((s) => !wanted || wanted.includes(s.name))
mkdirSync(OUT, { recursive: true })

const started: Subprocess[] = []
const done: { name: string; theme: Theme }[] = []
try {
  if (!(await portOpen(PORTS.mockApi))) {
    started.push(
      spawn(['bun', 'tools/mock-osm-api/server.ts'], {
        cwd: ROOT,
        stdout: 'ignore',
        stderr: 'inherit',
      }),
    )
    await waitForPort('mock OSM API', PORTS.mockApi)
  }
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  try {
    for (const app of ['maid', 'parking'] as const) {
      const group = shots.filter((s) => s.app === app)
      if (group.length === 0) continue
      const dir = app === 'maid' ? 'apps/maid' : 'apps/maid-parking'
      await build(dir)
      const preview = spawn(['bun', 'run', '--cwd', dir, 'preview', '--port', String(PREVIEW)], {
        cwd: ROOT,
        stdout: 'ignore',
        stderr: 'inherit',
      })
      started.push(preview)
      await waitForPort(`${app} preview`, PREVIEW)
      MAID_URL = `http://localhost:${PREVIEW}`
      for (const shot of group)
        for (const theme of shot.themes) {
          await capture(browser, shot, theme)
          done.push({ name: shot.name, theme })
        }
      preview.kill()
      started.splice(started.indexOf(preview), 1)
      await Bun.sleep(300)
    }
  } finally {
    await browser.close()
  }
  writeIndex()
  writeFileSync(
    join(OUT, 'shots.json'),
    `${JSON.stringify({ shots: done, blockedRequests, pageErrors: [...new Set(pageErrors)] }, null, 2)}\n`,
  )
  console.log(`wrote ${done.length} images and index.html to ${OUT}`)
  console.log(`blocked non-localhost requests: ${blockedRequests}`)
  if (pageErrors.length)
    console.log(
      `page errors (${pageErrors.length}):\n${[...new Set(pageErrors)].slice(0, 10).join('\n')}`,
    )
} finally {
  for (const proc of started) proc.kill()
}
