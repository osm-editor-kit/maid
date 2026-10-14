/**
 * Side-by-side screenshots of iD and Maid for the rendering comparison (docs/research/id-rendering-vs-maplibre-spec.md,
 * sections 2 and 3). Every case opens both editors at the same `map=zoom/lat/lon`, waits until each is settled, crops
 * the same target out of each, and composes the pair with its scores.
 *
 *   bun tools/bench/compare-shots.ts [--only 03,08]
 *
 * Writes docs/local/rendering-comparison/: <case>-id.png and <case>-maid.png (the crops), <case>.png (the pair),
 * index.html and README.md, both generated from CASES below. Starts the servers it needs (the mock API, iD's static
 * server, the Maid production build on its preview port) when they are not up, and stops the ones it started.
 *
 * Core rule 1: the browser blocks every non-localhost request. The imagery is generated here, on this script's own
 * tile server, so no tile comes from the network.
 */
import { chromium, type Browser, type Page } from '@playwright/test'
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { spawn, type Subprocess } from 'bun'
import { PORTS } from '../ports'

const ROOT = join(import.meta.dir, '../..')
const OUT = join(ROOT, 'docs/local/rendering-comparison')
/** This script's own tile server. Not in tools/ports.ts: that file is shared, and this script is the only user. */
const TILE_PORT = 5190
const TILE_URL = `http://127.0.0.1:${TILE_PORT}/tiles/{z}/{x}/{y}.png`
const ID = `http://localhost:${PORTS.id}`
const MAID = `http://localhost:${PORTS.maidBuild}`
const VIEW = { width: 1600, height: 1000 }
/** CSS pixels of each crop; the screenshots are taken at 2x */
const CROP = { width: 560, height: 380 }

type Settings = { brightness?: number; contrast?: number; saturation?: number; sharpness?: number }

type Case = {
  name: string
  title: string
  /** where the case comes from in docs/research/id-rendering-vs-maplibre-spec.md */
  ref: string
  /** the scores from the document (aesthetics 1 to 5, performance -2 to +2; table rows give a word instead) */
  scores: string
  scene: string
  lon: number
  lat: number
  zoom: number
  fill?: 'partial' | 'full'
  /** an imagery case: iD gets all four sliders, Maid only brightness (its one control, 20 to 100 %) */
  imagery?: Settings
  /** extra query for Maid only, e.g. `pins=all` (its default `pins=fit` hides a pin that iD draws) */
  maidQuery?: string
  /** selected through __bench.select in both editors before the capture */
  select?: string
  /** the pointer moves onto the target, dy pixels above it, before the capture */
  hover?: { dy: number; maidDy?: number }
  /** what to look at, one or two sentences */
  look: string
  /** what this capture does not show, and why */
  notShown?: string
}

const CASES: Case[] = [
  {
    name: '01-partial-fill',
    title: 'Partial fill along the inside of an area',
    ref: 'Ranked 1; table row 10',
    scores: 'aesthetics 3, performance -1',
    scene: 'medium',
    lon: 13.39734,
    lat: 52.52275,
    zoom: 18,
    look: 'iD: a 60 px band along the inside of the outline, clipped to the area. Maid: an inward mitred line of half its width, so it can leave the outline at corners.',
  },
  {
    name: '02-partial-fill-full',
    title: 'The same area in full fill',
    ref: 'Ranked 1; table row 10, full fill',
    scores: 'aesthetics 3, performance -1',
    scene: 'medium',
    lon: 13.39734,
    lat: 52.52275,
    zoom: 18,
    fill: 'full',
    look: 'Full fill: the whole area takes its colour in both. Compare the outline and the colour, not the band.',
  },
  {
    name: '03-area-pattern-wood',
    title: 'Wood with its pattern (partial fill)',
    ref: 'Ranked 2; table row 11',
    scores: 'aesthetics 3, performance 0 to -1',
    scene: 'dense',
    lon: 13.4194,
    lat: 52.48593,
    zoom: 17,
    look: 'iD: the tree pattern in the band along the edge. Maid: the plain colour.',
  },
  {
    name: '04-area-pattern-wood-full',
    title: 'Wood with its pattern (full fill)',
    ref: 'Ranked 2; table row 11, full fill',
    scores: 'aesthetics 3, performance 0 to -1',
    scene: 'dense',
    lon: 13.4194,
    lat: 52.48593,
    zoom: 17,
    fill: 'full',
    look: 'iD: the pattern over the whole wood. Maid: a flat green with no texture.',
  },
  {
    name: '05-area-pattern-cemetery',
    title: 'Cemetery with its pattern (partial fill)',
    ref: 'Ranked 2; table row 11',
    scores: 'aesthetics 3, performance 0 to -1',
    scene: 'dense',
    lon: 13.42565,
    lat: 52.48388,
    zoom: 17,
    look: 'iD: the cemetery pattern in the band. Maid: the plain colour.',
    notShown: 'Farmland and wetland are not in these fixtures in any size worth a crop (one 14 m2 wetland), so they are not shown.',
  },
  {
    name: '06-stacking-partial',
    title: 'A playground inside a park: which area is on top',
    ref: 'Ranked 3; table row 12',
    scores: 'aesthetics 2 (3 in full fill), performance 0',
    scene: 'dense',
    lon: 13.42177,
    lat: 52.4913,
    zoom: 18,
    look: 'The small playground lies inside the large park. iD draws the smaller area above the larger one; compare where the two overlap.',
  },
  {
    name: '07-stacking-full',
    title: 'The same place in full fill',
    ref: 'Ranked 3; table row 12, full fill',
    scores: 'aesthetics 3, performance 0',
    scene: 'dense',
    lon: 13.42177,
    lat: 52.4913,
    zoom: 18,
    fill: 'full',
    look: 'In full fill the stacking decides the colour of the overlap: iD shows the smaller area, Maid the upper layer of its fills.',
  },
  {
    name: '08-viewfield',
    title: 'Camera vertex with a direction (viewfield)',
    ref: 'Ranked 4; table row 16',
    scores: 'aesthetics 2, performance 0',
    scene: 'medium',
    lon: 13.40091,
    lat: 52.51567,
    zoom: 18,
    look: 'iD: a wedge on the camera vertex, pointing at its direction (246 degrees). Maid: nothing.',
  },
  {
    name: '09-layer-stacking',
    title: 'Light-rail bridge over an underpass: order by layer',
    ref: 'Ranked 5; table row 2',
    scores: 'aesthetics 2, performance -1',
    scene: 'small',
    lon: 13.3966,
    lat: 52.38668,
    zoom: 18,
    look: 'A layer-1 bridge crosses a layer -1 road and a footway. Compare the casing and the stroke where the lines cross.',
  },
  {
    name: '10-hover-shadow',
    title: 'Pointer on a road: the shadow under the hovered line',
    ref: 'Table row 6',
    scores: 'Low (table)',
    scene: 'small',
    lon: 13.406691,
    lat: 52.3926675,
    zoom: 18,
    hover: { dy: 0 },
    look: 'The pointer is on a service road. iD: a wide translucent shadow under the hovered line. Maid: its highlight halo.',
  },
  {
    name: '11-selection-and-midpoints',
    title: 'Selected road: selection shadow and midpoints',
    ref: 'Ranked 6 (table row 7, the pulse); table row 18 (midpoints)',
    scores: 'pulse: aesthetics 2, performance -2 while selected. Midpoints: Low (table)',
    scene: 'small',
    lon: 13.406691,
    lat: 52.3926675,
    zoom: 18,
    select: 'w43684175',
    look: 'iD: a shadow under the selected road and triangle midpoints. Maid: a circle for each midpoint and a halo, without the pulse.',
    notShown: 'One frame per editor. iD breathes every 800 ms, and the phase at capture is not controlled, so the shadow width can differ between runs.',
  },
  {
    name: '12-oneway-arrows',
    title: 'One-way service road: arrows',
    ref: 'Ranked 9; table row 13',
    scores: 'aesthetics 1, performance 0',
    scene: 'small',
    lon: 13.406691,
    lat: 52.3926675,
    zoom: 18,
    look: 'iD: SVG arrows every 36 px in three colours. Maid: a line pattern, one image per shape and colour.',
  },
  {
    name: '13-sided-marker',
    title: 'Retaining wall: sided marker',
    ref: 'Ranked 9; table row 14',
    scores: 'aesthetics 1, performance 0',
    scene: 'small',
    lon: 13.39737,
    lat: 52.3866,
    zoom: 18,
    look: 'The marker sits on one side of the wall. Compare the spacing and the side.',
    notShown: 'No cliff, embankment or cutting is in the three fixtures, so only the retaining wall is shown.',
  },
  {
    name: '14-pin-hover',
    title: 'Pointer over a pin: the hover ring',
    ref: 'Ranked 8; table row 17',
    scores: 'aesthetics 1, performance +1',
    scene: 'small',
    lon: 13.39845,
    lat: 52.38655,
    zoom: 18,
    hover: { dy: 22, maidDy: 28 },
    maidQuery: 'pins=all',
    look: 'iD: a 16 px ring that follows the pin outline. Maid: a round glow behind the pin head.',
  },
  {
    name: '15-labels',
    title: 'Labels: halo and placement',
    ref: 'Table row 19',
    scores: 'Low (table); placement differs by design',
    scene: 'medium',
    lon: 13.4023,
    lat: 52.5228,
    zoom: 17,
    look: 'Street and place names. iD: text with a white halo drawn twice. Maid: a 2.5 px halo at 0.7. Which labels are shown differs by design.',
  },
  {
    name: '16-dashed-and-solid',
    title: 'Dashed footways and paths next to solid roads',
    ref: 'Extra case: merge dashed and solid line layers (section 3, idea A); table row 3',
    scores: 'idea A: performance not known, to be measured. Table row 3: Low',
    scene: 'small',
    lon: 13.39821,
    lat: 52.38638,
    zoom: 18,
    look: 'Dashed in iD: the footways and paths. Solid: the residential, tertiary and service roads. Maid draws these in separate layers; idea A is one layer with a dash array and cap per feature.',
  },
  {
    name: '17-imagery-default',
    title: 'Custom imagery, no adjustment',
    ref: 'Ranked 7; table row 21',
    scores: 'aesthetics 2, performance 0',
    scene: 'small',
    lon: 13.4,
    lat: 52.389,
    zoom: 18,
    imagery: {},
    look: 'The baseline: the same tiles in both editors, no adjustment.',
  },
  {
    name: '18-imagery-brightness',
    title: 'Imagery brightness 50 %',
    ref: 'Ranked 7; table row 21',
    scores: 'aesthetics 2, performance 0',
    scene: 'small',
    lon: 13.4,
    lat: 52.389,
    zoom: 18,
    imagery: { brightness: 0.5 },
    look: 'Brightness is the one control both editors have. Both at 50 %.',
  },
  {
    name: '19-imagery-contrast',
    title: 'Imagery contrast 200 % (iD only)',
    ref: 'Ranked 7; table row 21',
    scores: 'aesthetics 2, performance 0 (free: same shader)',
    scene: 'small',
    lon: 13.4,
    lat: 52.389,
    zoom: 18,
    imagery: { contrast: 2 },
    look: 'iD: contrast 2. Maid has no contrast control, so its picture is the default one.',
  },
  {
    name: '20-imagery-saturation',
    title: 'Imagery saturation 0 (iD only)',
    ref: 'Ranked 7; table row 21',
    scores: 'aesthetics 2, performance 0 (free: same shader)',
    scene: 'small',
    lon: 13.4,
    lat: 52.389,
    zoom: 18,
    imagery: { saturation: 0 },
    look: 'iD: saturation 0, grey. Maid has no saturation control, so its picture is the default one.',
  },
  {
    name: '21-imagery-sharpen',
    title: 'Imagery sharpen 2.5 (iD only)',
    ref: 'Ranked 7; table row 21 (sharpness, not recommended in the document)',
    scores: 'not ranked: needs an offscreen blur, not recommended',
    scene: 'small',
    lon: 13.4,
    lat: 52.389,
    zoom: 18,
    imagery: { sharpness: 2.5 },
    look: 'iD: an unsharp mask (a blurred, inverted copy with overlay). Maid has no sharpen control, so its picture is the default one.',
    notShown: 'Sharpness below 1, which iD draws as a blur, is not shown. Maid has no sharpen control at all.',
  },
]

// ---------------------------------------------------------------------------------------------------------------------
// Imagery: a photo-like tile generated here. Grass, bare ground and paving in patches, a kerb-and-road grid with sharp
// edges (for the sharpen case), a few roof blocks, and fine noise. Deterministic: the same tile every time.

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let c = -1
  for (const b of bytes) c = (CRC_TABLE[(c ^ b) & 0xff] ?? 0) ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function pngChunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

function encodePng(width: number, height: number, rgb: Uint8Array): Buffer {
  const stride = width * 3
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) raw.set(rgb.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1)
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8 // bit depth
  header[9] = 2 // RGB
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

function hash(x: number, y: number, salt: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(salt, 1442695041)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

function valueNoise(x: number, y: number, cell: number, salt: number): number {
  const fx = x / cell
  const fy = y / cell
  const ix = Math.floor(fx)
  const iy = Math.floor(fy)
  const tx = fx - ix
  const ty = fy - iy
  const sx = tx * tx * (3 - 2 * tx)
  const sy = ty * ty * (3 - 2 * ty)
  const top = hash(ix, iy, salt) + (hash(ix + 1, iy, salt) - hash(ix, iy, salt)) * sx
  const bottom = hash(ix, iy + 1, salt) + (hash(ix + 1, iy + 1, salt) - hash(ix, iy + 1, salt)) * sx
  return top + (bottom - top) * sy
}

const clamp255 = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
const mod = (a: number, m: number) => ((a % m) + m) % m

function imageryColour(X: number, Y: number): [number, number, number] {
  const low = valueNoise(X, Y, 220, 1)
  const mid = valueNoise(X, Y, 30, 2)
  const fine = valueNoise(X, Y, 3, 3)
  let base: [number, number, number] = [168, 164, 150]
  if (low < 0.4) base = [88, 128, 62]
  else if (low < 0.62) base = [150, 132, 96]
  const tex = (mid - 0.5) * 60 + (fine - 0.5) * 46
  const gx = mod(X, 120)
  const gy = mod(Y, 120)
  let col = base
  if (gx < 14 || gy < 14) col = [72, 74, 80]
  else if (gx < 17 || gy < 17) col = [196, 192, 182]
  else if (hash(Math.floor(X / 120), Math.floor(Y / 120), 5) > 0.55) col = [178, 98, 74]
  return [clamp255(col[0] + tex), clamp255(col[1] + tex), clamp255(col[2] + tex)]
}

function imageryTile(x: number, y: number): Buffer {
  const rgb = new Uint8Array(256 * 256 * 3)
  for (let py = 0; py < 256; py++) {
    for (let px = 0; px < 256; px++) {
      const [r, g, b] = imageryColour(x * 256 + px, y * 256 + py)
      const o = (py * 256 + px) * 3
      rgb[o] = r
      rgb[o + 1] = g
      rgb[o + 2] = b
    }
  }
  return encodePng(256, 256, rgb)
}

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

// ---------------------------------------------------------------------------------------------------------------------
// Browser steps

let blockedRequests = 0
const pageErrors: string[] = []

async function openEditor(browser: Browser, url: string) {
  const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 2 })
  await context.route(
    (requestUrl) => !['localhost', '127.0.0.1'].includes(requestUrl.hostname),
    (route) => {
      blockedRequests++
      return route.abort()
    },
  )
  const page = await context.newPage()
  page.on('pageerror', (error) => pageErrors.push(`${url}: ${error.message}`))
  await page.goto(url)
  await page.waitForFunction(() => window.__bench !== undefined, undefined, { timeout: 30000 })
  await page.evaluate(() => window.__bench.ready())
  return { context, page }
}

/** iD: area fill and the custom imagery, set through iD's own context (the adapter's `_id` handle). */
async function setupId(page: Page, c: Case) {
  await page.evaluate(
    ({ fill, imagery, template }) => {
      type Background = {
        baseLayerSource(source: unknown): void
        brightness(v: number): void
        contrast(v: number): void
        saturation(v: number): void
        sharpness(v: number): void
      }
      const w = window as unknown as {
        __bench: { _id: { context: { map(): { activeAreaFill(v: string): void }; background(): Background } } }
        iD: { rendererBackgroundSource: { Custom(t: string): unknown } }
      }
      const context = w.__bench._id.context
      if (fill) context.map().activeAreaFill(fill)
      if (imagery) {
        const background = context.background()
        background.baseLayerSource(w.iD.rendererBackgroundSource.Custom(template))
        if (imagery.brightness !== undefined) background.brightness(imagery.brightness)
        if (imagery.contrast !== undefined) background.contrast(imagery.contrast)
        if (imagery.saturation !== undefined) background.saturation(imagery.saturation)
        if (imagery.sharpness !== undefined) background.sharpness(imagery.sharpness)
      }
    },
    { fill: c.fill ?? null, imagery: c.imagery ?? null, template: TILE_URL },
  )
}

async function settle(page: Page, editor: 'id' | 'maid', imagery: boolean) {
  await page.evaluate(() => window.__bench.settled())
  if (imagery) {
    if (editor === 'id') {
      await page.waitForFunction(
        () => {
          const tiles = [...document.querySelectorAll('.layer-background img')] as HTMLImageElement[]
          return tiles.length > 0 && tiles.every((tile) => tile.complete)
        },
        undefined,
        { timeout: 30000, polling: 200 },
      )
    } else {
      await page.waitForFunction(
        () => (window as unknown as { __maid: { map: { areTilesLoaded(): boolean } } }).__maid.map.areTilesLoaded(),
        undefined,
        { timeout: 30000, polling: 200 },
      )
    }
    await page.waitForTimeout(400)
  }
  await page.waitForTimeout(250)
}

/**
 * One editor's capture of the case, cropped around the target. Returns what the pointer and selection saw.
 * Maid's imagery is never captured: its backgrounds are off in automated browsers (navigator.webdriver), by design.
 */
async function captureEditor(browser: Browser, editor: 'id' | 'maid', c: Case, file: string): Promise<string[]> {
  const notes: string[] = []
  const imagery = c.imagery !== undefined
  const query =
    editor === 'id'
      ? `?scene=${c.scene}`
      : `?scene=${c.scene}&map=${c.zoom}/${c.lat}/${c.lon}` +
        (c.fill ? `&fill=${c.fill}` : '') +
        (c.maidQuery ? `&${c.maidQuery}` : '') +
        (imagery ? `&background=${encodeURIComponent(`custom:${TILE_URL}`)}` : '')
  const url = (editor === 'id' ? ID : MAID) + '/' + query + (editor === 'id' ? `#map=${c.zoom}/${c.lat}/${c.lon}` : '')
  const { context, page } = await openEditor(browser, url)
  try {
    if (editor === 'id') await setupId(page, c)
    await settle(page, editor, imagery)
    if (c.select) {
      await page.evaluate((id) => window.__bench.select(id), c.select)
      await settle(page, editor, imagery)
      notes.push(`selected: ${(await page.evaluate(() => window.__bench.selected())).join(',')}`)
    }
    const target = await page.evaluate(([lon, lat]) => window.__bench.project(lon, lat), [c.lon, c.lat] as const)
    if (c.hover) {
      const dy = editor === 'maid' && c.hover.maidDy !== undefined ? c.hover.maidDy : c.hover.dy
      await page.mouse.move(target.x, target.y - dy)
      await page.waitForTimeout(400)
      notes.push(`hovered: ${(await page.evaluate(() => window.__bench.hovered())).join(',') || 'none'}`)
    }
    const rect = await page.evaluate(() => window.__bench.mapRect())
    const width = Math.min(CROP.width, rect.width)
    const height = Math.min(CROP.height, rect.height)
    const x = Math.min(Math.max(target.x - width / 2, rect.left), rect.left + rect.width - width)
    const y = Math.min(Math.max(target.y - height / 2, rect.top), rect.top + rect.height - height)
    await page.screenshot({ path: join(OUT, file), clip: { x, y, width, height } })
    return notes
  } finally {
    await context.close()
  }
}

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch] ?? ch)

async function composePair(browser: Browser, c: Case) {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 })).newPage()
  const img = (editor: string) => `http://127.0.0.1:${TILE_PORT}/out/${c.name}-${editor}.png`
  await page.setContent(`<!doctype html><meta charset="utf-8"><body style="margin:0;background:#fff;font-family:system-ui,sans-serif;color:#111">
    <div id="pair" style="display:inline-block;padding:16px;width:1200px;box-sizing:border-box">
      <div style="font-size:17px;font-weight:600">${escapeHtml(c.name)}: ${escapeHtml(c.title)}</div>
      <div style="font-size:13px;color:#555;margin:4px 0 10px">${escapeHtml(c.ref)} · ${escapeHtml(c.scores)} · ${c.scene}, zoom ${c.zoom}, ${c.lat}/${c.lon}</div>
      <div style="display:flex;gap:16px;align-items:flex-start">
        <figure style="margin:0"><figcaption style="font-weight:600;margin-bottom:4px">iD</figcaption><img src="${img('id')}" style="width:560px;display:block;border:1px solid #bbb"></figure>
        <figure style="margin:0"><figcaption style="font-weight:600;margin-bottom:4px">Maid</figcaption>${
          c.imagery !== undefined
            ? `<div style="width:558px;height:${Math.round(CROP.height * (560 / CROP.width))}px;display:flex;align-items:center;justify-content:center;border:1px dashed #999;box-sizing:border-box;padding:16px;text-align:center;font-size:13px;color:#555">Not captured: Maid turns its backgrounds off in automated browsers, so no imagery loads under Playwright. Looked at by hand, the Maid side would need a person in a normal browser.</div>`
            : `<img src="${img('maid')}" style="width:560px;display:block;border:1px solid #bbb">`
        }</figure>
      </div>
      <div style="font-size:13px;margin-top:10px;max-width:1168px">${escapeHtml(c.look)}</div>
    </div></body>`)
  await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0), undefined, { timeout: 15000 })
  await page.locator('#pair').screenshot({ path: join(OUT, `${c.name}.png`) })
  await page.context().close()
}

// ---------------------------------------------------------------------------------------------------------------------
// index.html and README.md, both from CASES

function writeIndex() {
  const sections = CASES.map(
    (c) => `<section>
  <h2>${escapeHtml(c.name)}: ${escapeHtml(c.title)}</h2>
  <p class="meta">${escapeHtml(c.ref)} · ${escapeHtml(c.scores)} · ${c.scene}, zoom ${c.zoom}</p>
  <img src="${c.name}.png" alt="${escapeHtml(c.title)}">
  <p>${escapeHtml(c.look)}</p>
  ${c.notShown ? `<p class="not">Not shown: ${escapeHtml(c.notShown)}</p>` : ''}
</section>`,
  ).join('\n')
  writeFileSync(
    join(OUT, 'index.html'),
    `<!doctype html>
<meta charset="utf-8">
<title>iD and Maid rendering comparison</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { font-family: system-ui, sans-serif; margin: 24px; color: #111; background: #fafafa; max-width: 1240px; }
  h1 { font-size: 22px; } h2 { font-size: 17px; margin: 0 0 4px; }
  section { background: #fff; border: 1px solid #ddd; border-radius: 6px; padding: 14px 16px; margin: 0 0 18px; }
  img { max-width: 100%; height: auto; border: 1px solid #ccc; }
  .meta { color: #555; font-size: 13px; margin: 0 0 8px; }
  .not { color: #7a4b00; font-size: 13px; }
</style>
<h1>iD and Maid rendering comparison</h1>
<p>Each pair is one place, the same map=zoom/lat/lon in both editors, cropped to the feature. Scores are from docs/research/id-rendering-vs-maplibre-spec.md (inferred, not measured). Generated by tools/bench/compare-shots.ts.</p>
${sections}
`,
  )
}

function writeReadme() {
  const rows = CASES.map(
    (c) =>
      `### ${c.name}: ${c.title}\n\n` +
      `- Pair: \`${c.name}.png\` (crops: \`${c.name}-id.png\`, \`${c.name}-maid.png\`)\n` +
      `- Where in the spec: ${c.ref}\n` +
      `- Scores from the spec: ${c.scores}\n` +
      `- Scene and place: ${c.scene}, zoom ${c.zoom}, ${c.lat}/${c.lon}${c.fill ? `, fill ${c.fill}` : ''}${c.select ? `, ${c.select} selected` : ''}${c.hover ? `, pointer ${c.hover.dy} px above the node` : ''}${c.maidQuery ? `, Maid with ${c.maidQuery}` : ''}${c.imagery ? `, imagery ${JSON.stringify(c.imagery)}` : ''}\n` +
      `- What to look at: ${c.look}\n` +
      (c.notShown ? `- Not shown: ${c.notShown}\n` : '') +
      '\n',
  ).join('')
  writeFileSync(
    join(OUT, 'README.md'),
    `# iD and Maid rendering comparison

Generated by \`bun tools/bench/compare-shots.ts\` (the cases are in that file). Each case is one place at one zoom in both
editors. The crops are the same size in CSS pixels, taken at 2x. The scores are the document's: aesthetics 1 (nobody
sees it) to 5 (the map looks wrong), performance -2 to +2. All performance scores are inferred, none was measured.

## Not shown, in general

- Maid's imagery is not captured at all. Maid turns its backgrounds off in automated browsers (\`navigator.webdriver\`, which Playwright sets), so the imagery cases have the iD side only. The script does not get around that gate. Maid's brightness, the only control it has, can be compared by hand in a normal browser with \`?background=custom:<template>\` and the Background flyout.
- iD's sharpen above 1 is an unsharp mask. Maid has no sharpen, contrast or saturation control at all. Sharpness below 1 (a blur) is not shown.
- The pulse is one frame per editor, with no control over the phase.
- Farmland and wetland patterns: not in the fixtures in a useful size. Vertices, casing and the wireframe mode are not shown: the document rates them None or not checked.
- Rows 22 to 25 of the table (blend modes, group opacity, glows, pointer events) are not visual gaps in the same sense and have no case.
- Hover and selection results are checked from the bench handle (\`hovered()\`, \`selected()\`) and printed by the script, not from the pixels alone.

## Cases

${rows}## Rerun

\`\`\`
bun tools/bench/compare-shots.ts            # all cases
bun tools/bench/compare-shots.ts --only 03,08   # by number prefix
\`\`\`

It builds the Maid production build and starts the mock API (8090), iD's static server (8081) and the Maid preview (5175) when they are not up, and stops the ones it started.
`,
  )
}

// ---------------------------------------------------------------------------------------------------------------------
// Main

const onlyArg = process.argv.indexOf('--only')
const only = onlyArg > 0 ? (process.argv[onlyArg + 1] ?? '').split(',').map((s) => s.trim()) : undefined
const selected = CASES.filter((c) => !only || only.some((p) => c.name.startsWith(p)))

mkdirSync(OUT, { recursive: true })
const tiles = new Map<string, Buffer>()
const tileServer = Bun.serve({
  port: TILE_PORT,
  hostname: '127.0.0.1',
  fetch(req) {
    const { pathname } = new URL(req.url)
    const cors = { 'Access-Control-Allow-Origin': '*' }
    const tile = /^\/tiles\/(\d+)\/(\d+)\/(\d+)\.png$/.exec(pathname)
    if (tile) {
      const key = `${tile[1]}/${tile[2]}/${tile[3]}`
      let png = tiles.get(key)
      if (!png) {
        png = imageryTile(Number(tile[2]), Number(tile[3]))
        tiles.set(key, png)
      }
      return new Response(new Uint8Array(png), { headers: { ...cors, 'Content-Type': 'image/png' } })
    }
    if (pathname.startsWith('/out/')) return new Response(Bun.file(join(OUT, basename(pathname))))
    return new Response('not found', { status: 404 })
  },
})

const started: Subprocess[] = []
try {
  if (!(await portOpen(PORTS.mockApi))) {
    started.push(spawn(['bun', 'tools/mock-osm-api/server.ts'], { cwd: ROOT, stdout: 'ignore', stderr: 'inherit' }))
    await waitForPort('mock OSM API', PORTS.mockApi)
  }
  if (!(await portOpen(PORTS.id))) {
    started.push(spawn(['bun', 'tools/refs/id/serve.ts'], { cwd: ROOT, stdout: 'ignore', stderr: 'inherit' }))
    await waitForPort('iD', PORTS.id)
  }
  // the build is always fresh: other agents edit the sources while this runs
  const build = spawn(['bun', 'run', '--cwd', 'apps/maid', 'build'], { cwd: ROOT, stdout: 'ignore', stderr: 'ignore' })
  if ((await build.exited) !== 0) throw new Error('the Maid build failed (another agent may be mid-edit: wait and retry)')
  if (!(await portOpen(PORTS.maidBuild))) {
    started.push(spawn(['bun', 'run', '--cwd', 'apps/maid', 'preview', '--port', String(PORTS.maidBuild)], { cwd: ROOT, stdout: 'ignore', stderr: 'inherit' }))
    await waitForPort('Maid preview', PORTS.maidBuild)
  }

  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  try {
    for (const c of selected) {
      const t0 = performance.now()
      const idNotes = await captureEditor(browser, 'id', c, `${c.name}-id.png`)
      const maidNotes =
        c.imagery !== undefined
          ? ['not captured: backgrounds are off in automated browsers']
          : await captureEditor(browser, 'maid', c, `${c.name}-maid.png`)
      await composePair(browser, c)
      console.log(
        `${c.name} ok (${Math.round(performance.now() - t0)} ms) iD: ${idNotes.join(' ; ') || '-'} | Maid: ${maidNotes.join(' ; ') || '-'}`,
      )
    }
  } finally {
    await browser.close()
  }
  writeIndex()
  writeReadme()
  console.log(`wrote ${selected.length} pairs, index.html and README.md to ${OUT}`)
  console.log(`blocked non-localhost requests: ${blockedRequests}`)
  if (pageErrors.length) console.log(`page errors (${pageErrors.length}):\n${[...new Set(pageErrors)].slice(0, 10).join('\n')}`)
} finally {
  for (const proc of started) proc.kill()
  await tileServer.stop()
}
