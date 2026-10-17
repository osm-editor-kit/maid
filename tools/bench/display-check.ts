/**
 * Display check for Maid: W draws the wireframe and back, G highlights the changes and back, as iD does. The map's
 * layers and the features' `ed` property are read after each key; the URL's `display` follows the engine, and a link
 * with `display=` starts with it. Not run by `check-all` yet (the script is `check-display`).
 *
 *   bun tools/bench/display-check.ts [scene]
 */
import { EDIT_SOURCES, SOURCES } from '../../packages/renderer/src/layers'
import { pickBuildingAndRoad } from './check-helpers'
import { runCheck, type Check } from './check-page'

const sceneName = process.argv[2] ?? 'small'

/** What the map shows now: the display, the URL's, and the three things the look and the wireframe differ in */
const shown = (page: Check['page']) =>
  page.evaluate(() => {
    const { engine, map } = window.__maid
    // the layers stay in the style and are hidden by visibility (layers.ts), so the visibility is what is read
    const visible = (layer: string) => map.getLayoutProperty(layer, 'visibility') !== 'none'
    return {
      display: engine.display,
      param: new URL(window.location.href).searchParams.get('display'),
      // the look draws the band along the inside of areas and a casing under each road; the wireframe draws neither
      band: visible('area-fill-partial'),
      casing: visible('line-casing-0'),
      // a stroke of 1px is the wireframe's; the look's width follows the zoom, so it is not 1
      strokeOne: map.getPaintProperty('line-stroke-0', 'line-width') === 1,
      halo: visible('edit-halo-areas'),
    }
  })

/**
 * The `ed` property of each feature (what an edit changed), by id; null for one that was not edited. An edited feature
 * is drawn by its copy on the edit source: the original is hidden through feature state while it is edited, and keeps
 * the `ed` it had before the edit. So the copy is read first, and the original only when there is no copy.
 */
const editsOf = (page: Check['page'], ids: { building: string; road: string }) =>
  page.evaluate(
    ({ building, road, sources }) => {
      const { map } = window.__maid
      const edit = (drawn: string[], id: string) => {
        for (const source of drawn) {
          const ed = map.querySourceFeatures(source).find((f: any) => String(f.id) === id)
            ?.properties?.ed
          if (ed) return ed
        }
        return null
      }
      return { building: edit(sources.areas, building), road: edit(sources.lines, road) }
    },
    {
      ...ids,
      sources: {
        areas: [EDIT_SOURCES.areas, SOURCES.areas],
        lines: [EDIT_SOURCES.lines, SOURCES.lines],
      },
    },
  )

// the keys, the URL and the layers, in one visit: each step reads what the map shows after it
let failed = await runCheck(sceneName, async ({ page, report, settle }) => {
  const { building, road } = await pickBuildingAndRoad(page)
  if (!building || !road) {
    report('find a building and a residential road', 'both drawn', { building, road })
    return
  }
  const look = await shown(page)
  report(
    'start: the normal look, no display in the URL',
    { display: 'normal', param: null, band: true, casing: true, strokeOne: false, halo: false },
    look,
  )

  await page.keyboard.press('w')
  await settle()
  report(
    'W: the wireframe, the URL says wireframe',
    {
      display: 'wireframe',
      param: 'wireframe',
      band: false,
      casing: false,
      strokeOne: true,
      halo: false,
    },
    await shown(page),
  )
  await page.keyboard.press('w')
  await settle()
  report('W again: back to the look as it was', look, await shown(page))

  // an edit to highlight: a tag of the building (the inspector's way, through the engine)
  await page.evaluate((id) => window.__maid.engine.setTag(id, 'name', 'Display test'), building)
  await settle()
  await page.keyboard.press('g')
  await settle()
  const after = await shown(page)
  const eds = await editsOf(page, { building, road })
  // the halo of an edited area is drawn by its twin on the edit source (`--edit`); the original has no halo of its own
  const haloDrawn = await page.evaluate(
    (id) =>
      window.__maid.map
        .queryRenderedFeatures(undefined, { layers: ['edit-halo-areas', 'edit-halo-areas--edit'] })
        .some((f: any) => String(f.id) === id),
    building,
  )
  report(
    'G: the changes in colour: the edited building has its halo, the road none',
    {
      display: 'edits',
      param: 'edits',
      band: true,
      casing: true,
      strokeOne: false,
      halo: true,
      building: 'retagged',
      road: null,
      haloDrawn: true,
    },
    { ...after, building: eds.building, road: eds.road, haloDrawn },
  )
  await page.keyboard.press('g')
  await settle()
  report('G again: back to the look, the URL has no display', look, await shown(page))

  // W from the changes goes to the wireframe, not to the look
  await page.keyboard.press('g')
  await settle()
  await page.keyboard.press('w')
  await settle()
  report(
    'from the changes, W: the wireframe',
    {
      display: 'wireframe',
      param: 'wireframe',
      band: false,
      casing: false,
      strokeOne: true,
      halo: false,
    },
    await shown(page),
  )

  // a reload keeps the display: the URL is the live state
  await page.reload()
  await page.waitForFunction(() => window.__bench !== undefined, undefined, { timeout: 30000 })
  await page.evaluate(() => window.__bench.ready())
  await settle()
  report(
    'reload: the wireframe is still shown, from the URL',
    {
      display: 'wireframe',
      param: 'wireframe',
      band: false,
      casing: false,
      strokeOne: true,
      halo: false,
    },
    await shown(page),
  )
})

// a link starts with its display, and the URL keeps it
failed += await runCheck(
  sceneName,
  async ({ page, report }) => {
    report(
      'display=edits: starts with the changes in colour, the URL keeps it',
      { display: 'edits', param: 'edits', band: true, casing: true, strokeOne: false, halo: true },
      await shown(page),
    )
  },
  'display=edits',
)

// a value that is not one of the two is no display: the look, and the URL is corrected to none
failed += await runCheck(
  sceneName,
  async ({ page, report }) => {
    report(
      'display=full: not a display, the look and no display in the URL',
      { display: 'normal', param: null, band: true, casing: true, strokeOne: false, halo: false },
      await shown(page),
    )
  },
  'display=full',
)

process.exit(failed ? 1 : 0)
