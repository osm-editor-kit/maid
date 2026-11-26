import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
/**
 * A contact sheet of the lane cases (fixtures/lanes, made by `bun run fixtures-lanes`): each case drawn with the street
 * drawing (module-lanes `streetOf`, osm-lane-diagram `street`) as an SVG, with its id, title and what it shows. Written to
 * reports/lanes-cases.html and, with a headless browser that loads nothing from the network, reports/lanes-cases.png.
 * To compare with another lane editor, draw the same case files there.
 *
 * Usage: bun run lanes-sheet [L08 L13 P02 ...]   (all made-up cases without arguments; `P` for all real places)
 * SHEET_HALF=25 bun run lanes-sheet L09        (closer: half the side of each drawing in metres)
 */
import { chromium } from '@playwright/test'
import { streetOf, type StreetEntity } from '../../packages/module-lanes/src/overlay/street.ts'

type CaseFile = {
  nodes: Record<string, { loc: [number, number]; tags: Record<string, string> }>
  ways: { id: string; nodes: string[]; tags: Record<string, string> }[]
}
type Entry = { id: string; title: string; shows: string; file: string; centre: [number, number] }

const root = join(import.meta.dir, '../..')
const read = (file: string) =>
  JSON.parse(readFileSync(join(root, 'fixtures/lanes', file), 'utf8')) as Entry[]
const catalogue = [...read('cases.json'), ...read('places.json')]
const wanted = process.argv.slice(2).map((a) => a.toUpperCase())
// all made-up cases without arguments; `P` for all real places
const entries = wanted.length
  ? catalogue.filter((e) => wanted.includes(e.id) || (wanted.includes('P') && e.id.startsWith('P')))
  : catalogue.filter((e) => e.id.startsWith('L'))

const SIZE = 420
/** Half the side of a drawing in metres: a made-up case, a real place */
const halfOf = (entry: Entry) =>
  Number(process.env.SHEET_HALF) || (entry.id.startsWith('P') ? 130 : 75)
const COLOURS: Record<string, string> = {
  car: '#71717a',
  bus: '#b91c1c',
  bicycle: '#15803d',
  other: '#7c3aed',
}
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')

function drawCase(entry: Entry): string {
  const HALF = halfOf(entry)
  const data = JSON.parse(
    readFileSync(join(root, 'fixtures/lanes', entry.file), 'utf8'),
  ) as CaseFile
  const nodes = new Map<string, StreetEntity>(
    Object.entries(data.nodes).map(([id, n]) => [id, { id, tags: n.tags, loc: n.loc }]),
  )
  const ways: StreetEntity[] = data.ways.map((w) => ({ id: w.id, tags: w.tags, nodes: w.nodes }))
  const { geometry, assumed } = streetOf(ways, (id) => nodes.get(id))
  const [lon0, lat0] = entry.centre
  const kx = Math.cos((lat0 * Math.PI) / 180) * 111_320
  const k = SIZE / (2 * HALF)
  const P = (p: readonly number[]) => [
    ((p[0]! - lon0) * kx + HALF) * k,
    (HALF - (p[1]! - lat0) * 111_320) * k,
  ]
  const path = (points: readonly (readonly number[])[], close: boolean) =>
    `M${points
      .map((p) =>
        P(p)
          .map((v) => v.toFixed(1))
          .join(','),
      )
      .join('L')}${close ? 'Z' : ''}`
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">`
  svg += `<rect width="${SIZE}" height="${SIZE}" fill="#e7e5e4"/>`
  for (const j of geometry.junctions)
    if (j.ring.length >= 3) svg += `<path d="${path(j.ring, true)}" fill="#71717a"/>`
  for (const lane of geometry.lanes) {
    const opacity = assumed.has(lane.wayId) ? 0.6 : 1
    svg += `<path d="${path(lane.ring, true)}" fill="${COLOURS[lane.kind] ?? '#71717a'}" fill-opacity="${opacity}"/>`
  }
  for (const line of geometry.lines) {
    const kerb = line.kind === 'kerb'
    svg += `<path d="${path(line.line, false)}" fill="none" stroke="${kerb ? '#fafafa' : line.kind === 'centre' ? '#fde047' : '#ffffff'}" stroke-width="${kerb ? 1.6 : 1}"${kerb ? '' : ' stroke-dasharray="5 5"'}/>`
  }
  for (const j of geometry.junctions) {
    for (const guide of j.guides ?? [])
      svg += `<path d="${path(guide, false)}" fill="none" stroke="#ffffff" stroke-opacity="0.8" stroke-width="0.9" stroke-dasharray="2 2"/>`
  }
  for (const j of geometry.junctions) {
    for (const kerb of j.kerbs)
      svg += `<path d="${path(kerb, false)}" fill="none" stroke="#fafafa" stroke-width="1.6"/>`
  }
  // the OSM ways, thin, on top
  for (const way of ways) {
    const points = (way.nodes ?? []).map((id) => nodes.get(id)?.loc).filter((p) => p !== undefined)
    svg += `<path d="${path(points as number[][], false)}" fill="none" stroke="#2563eb" stroke-width="0.8" stroke-opacity="0.7"/>`
  }
  for (const arrow of geometry.arrows) {
    const [x, y] = P(arrow.loc)
    svg += `<g transform="translate(${x!.toFixed(1)},${y!.toFixed(1)}) rotate(${arrow.bearing.toFixed(0)})"><path d="M0,-7 L4,-2 L1.2,-2 L1.2,5 L-1.2,5 L-1.2,-2 L-4,-2Z" fill="#fff"/></g>`
    svg += `<text x="${(x! + 6).toFixed(1)}" y="${y!.toFixed(1)}" font-size="9" fill="#18181b">${esc(arrow.turn)}</text>`
  }
  svg += `<text x="8" y="${SIZE - 8}" font-size="10" fill="#52525b">${HALF * 2} m${entry.id.startsWith('P') ? ' · © OpenStreetMap contributors' : ''}</text></svg>`
  return svg
}

const cards = entries
  .map(
    (entry) =>
      `<figure><h2>${entry.id} ${esc(entry.title)}</h2>${drawCase(entry)}<figcaption>${esc(entry.shows)}</figcaption></figure>`,
  )
  .join('\n')
const html = `<!doctype html><meta charset="utf-8"><title>Lane cases</title>
<style>body{font:13px system-ui,sans-serif;margin:16px;background:#fafaf9;color:#18181b}
main{display:grid;grid-template-columns:repeat(auto-fill,${SIZE}px);gap:16px}figure{margin:0;width:${SIZE}px}
h2{font-size:14px;margin:0 0 4px}figcaption{color:#52525b;margin-top:4px}</style>
<h1>Lane cases, drawn by Maid's street drawing</h1>
<p>fixtures/lanes (bun run fixtures-lanes). Blue: the OSM ways. Grey: lanes and junctions; red bus, green cycle lanes; muted: lanes assumed for roads without lane tags.</p>
<main>${cards}</main>`

const reports = join(root, 'reports')
mkdirSync(reports, { recursive: true })
const htmlFile = join(reports, 'lanes-cases.html')
writeFileSync(htmlFile, html)
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 5 * (SIZE + 16) + 32, height: 800 } })
await page.route('**/*', (route) =>
  route.request().url().startsWith('file:') ? route.continue() : route.abort(),
)
await page.goto(`file://${htmlFile}`)
const pngFile = join(reports, 'lanes-cases.png')
await page.screenshot({ path: pngFile, fullPage: true })
await browser.close()
console.log(`${entries.length} cases: wrote ${htmlFile} and ${pngFile}`)
