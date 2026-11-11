/**
 * The bicycle editor's default look (`--app bicycle`, scene `bicycle`, the made-up cases of tools/fixtures/bicycle.ts):
 * every case is drawn with the TILDA categories the fixture script expects, nothing for the cases without
 * infrastructure; the traffic signs get their images; the report's sidewalk is "Sidewalk, bicycles allowed" in the
 * inspector; another lens hides the lines and the module's own lens shows them. Screenshots of the paths and the roads
 * go to `reports/bike-style/`.
 *
 *   bun tools/bench/bike-style-check.ts bicycle --app bicycle
 *   (MAID_MOCK_PORT=8091 when the running mock API was started before the scene existed)
 *
 * Prints one line per check: `ok <check>`, or `FAIL <check>`. Exits 1 on any failure.
 */
import { mkdirSync } from 'node:fs'
import {
  BIKE_SIGN_SOURCE,
  BIKE_SOURCE,
} from '../../packages/module-bike-infrastructure/src/layers.ts'
import { PATHS, ROADS, type Case } from '../fixtures/bicycle'
import { getScene } from '../fixtures/scenes'
import { runCheck } from './check-page'

const sceneName = process.argv[2] ?? 'bicycle'
const OUT = 'reports/bike-style'
const scene = getScene('bicycle')

/** What a case should show: the categories with infrastructure, by side, and the separately mapped sides */
function drawnOf(item: Case) {
  return item.expect
    .filter((entry) => !/:(data_no|not_expected)$/.test(entry))
    .map((entry) => entry.replace(/:separate_geometry$/, ':separate'))
    .sort()
}

process.exit(
  await runCheck(sceneName, async ({ page, report, settle }) => {
    mkdirSync(OUT, { recursive: true })
    const jump = async (center: [number, number], zoom: number) => {
      await page.evaluate(
        ({ center, zoom }) => window.__maid.map.jumpTo({ center, zoom: zoom - 1 }),
        { center, zoom },
      )
      await settle()
    }
    /** The bicycle features drawn now, by way name: `side:category`, or `side:separate` */
    const drawn = () =>
      page.evaluate((source) => {
        const { map, engine } = window.__maid
        const out: Record<string, string[]> = {}
        if (!map.getSource(source)) return out
        for (const feature of map.querySourceFeatures(source)) {
          const p = feature.properties as Record<string, string | undefined>
          if (p.kind === 'sign' || p.wayId === undefined) continue
          const name = engine.data.way(p.wayId)?.tags.name ?? p.wayId
          const entry = `${p.side}:${p.kind === 'separate' ? 'separate' : p.category}`
          const list = (out[name] ??= [])
          if (!list.includes(entry)) list.push(entry)
        }
        for (const list of Object.values(out)) list.sort((a, b) => a.localeCompare(b))
        return out
      }, BIKE_SOURCE)

    // the whole scene at once: zoom 17 holds both columns
    await jump(scene.center, 17)
    const all = await drawn()
    for (const item of [...PATHS, ...ROADS]) {
      report(
        `${item.name}: drawn as ${drawnOf(item).join(' ') || 'nothing'}`,
        drawnOf(item),
        all[item.name] ?? [],
      )
    }

    // the signs: their images are loaded, then the points are drawn
    await page
      .waitForFunction(
        () =>
          window.__maid.map.listImages().filter((id: string) => id.startsWith('bike-sign:'))
            .length >= 6,
        undefined,
        { timeout: 15_000 },
      )
      .catch(() => undefined)
    await settle()
    // the sign points the source holds (only those whose image is on the map), from its data
    const signs = await page.evaluate((source) => {
      const data = (window.__maid.map.getSource(source) as any)?.serialize().data
      return [...new Set<string>((data?.features ?? []).map((f: any) => f.properties.sign))].sort()
    }, BIKE_SIGN_SOURCE)
    report(
      'the traffic signs are drawn with their images',
      ['DE:237', 'DE:239,1022-10', 'DE:240', 'DE:241-30', 'DE:244.1', 'DE:244.1,1020-30'],
      signs,
    )

    // screenshots: the scene, then the paths and the roads in four parts each at zoom 19
    const pathLon = (13.3005 + 13.3017) / 2
    const roadLon = (13.3033 + 13.3053) / 2
    const north = scene.bbox[3] - 0.0002
    const shots: [string, [number, number], number][] = [
      ['overview', scene.center, 17.3],
      ['paths-1', [pathLon, north - 0.00017 * 3], 19],
      ['paths-2', [pathLon, north - 0.00017 * 10], 19],
      ['paths-3', [pathLon, north - 0.00017 * 17], 19],
      ['paths-4', [pathLon, north - 0.00017 * 21.5], 19],
      ['roads-1', [roadLon, north - 0.0003 * 1.5], 19],
      ['roads-2', [roadLon, north - 0.0003 * 5.5], 19],
      ['roads-3', [roadLon, north - 0.0003 * 9.5], 19],
      ['roads-4', [roadLon, north - 0.0003 * 11.5], 19],
    ]
    await page.setViewportSize({ width: 1100, height: 1000 })
    for (const [name, center, zoom] of shots) {
      await jump(center, zoom)
      // the sign images come after the lines
      await page.waitForTimeout(400)
      await settle()
      await page.screenshot({ path: `${OUT}/${name}.png` })
    }
    console.log(`screenshots in ${OUT}/`)

    // the report: a sidewalk with bicycle=yes and DE:239,1022-10 is named for what TILDA sees
    // the way ids of the fixture: three nodes and the way per case, from 1e9 on (tools/fixtures/bicycle.ts)
    const row = PATHS.findIndex((item) => item.name === 'sidewalk bicycle=yes DE:239,1022-10')
    const sidewalk = `w${1_000_000_000 + 4 * (row + 1)}`
    await jump([pathLon, north - 0.00017 * row], 19)
    await page.evaluate((id) => window.__maid.engine.setSelected([id]), sidewalk)
    await settle()
    await page.waitForTimeout(500)
    const inspector = await page.evaluate(() => document.body.innerText)
    report(
      'the report\'s sidewalk is "Sidewalk, bicycles allowed" in the inspector',
      true,
      inspector.includes('Sidewalk, bicycles allowed'),
    )
    await page.screenshot({ path: `${OUT}/sidewalk-selected.png` })
    await page.evaluate(() => window.__maid.engine.setSelected([]))

    // another lens hides the lines, the module's own lens shows them with the legend
    const lensDrawn = async (lens: string) => {
      const url = new URL(page.url())
      url.searchParams.set('lens', lens)
      await page.goto(url.toString())
      await page.waitForFunction(() => window.__bench !== undefined)
      await page.evaluate(() => window.__bench.ready())
      await jump(scene.center, 17)
      return Object.keys(await drawn()).length
    }
    report('lens "surface": no bicycle lines', 0, await lensDrawn('surface'))
    report(
      'lens "bike-infrastructure": the bicycle lines',
      true,
      (await lensDrawn('bike-infrastructure')) > 30,
    )
    report('lens "none": the bicycle lines', true, (await lensDrawn('none')) > 30)
  }),
)
