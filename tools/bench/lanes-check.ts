/**
 * Check of the lanes editor (`--app lanes`): the section "Lanes" of a selected road with its diagram, a value per lane
 * written from the table (one key, one undo step), a lane added and removed (counts and pipes of that direction, the
 * cycle lane pattern kept), a lane chosen in the diagram marking its column, the lane bands of the selected road on
 * the map, and a lane rule in the Issues dock with its fix. Automation runs in English.
 *
 *   bun run check-lanes [scene] --app lanes
 *
 * Prints one line per check: `ok <check>`, or `FAIL <check>`. Exits 1 on any failure.
 */
import { runCheck } from './check-page'

const sceneName = process.argv[2] ?? 'small'

type Tags = Record<string, string>

const failed = await runCheck(sceneName, async ({ page, report, settle }) => {
  // a road in view that the section is shown for, picked before any change
  const road = await page.evaluate(() => {
    const { map, engine } = window.__maid
    const bounds = map.getBounds()
    const wanted = ['secondary', 'tertiary', 'primary', 'residential']
    let best: { id: string; rank: number } | undefined
    for (const f of map.querySourceFeatures('osm-lines')) {
      const id = String(f.id ?? '')
      const way = id.startsWith('w') && engine.data.way(id)
      if (!way || way.tags.bridge || way.tags.tunnel || way.tags.area) continue
      const rank = wanted.indexOf(way.tags.highway ?? '')
      if (rank < 0 || (best && best.rank <= rank)) continue
      const inView = way.nodes.some((n: string) => {
        const loc = engine.data.node(n)?.loc
        return loc !== undefined && bounds.contains([loc[0], loc[1]])
      })
      if (inView) best = { id, rank }
    }
    return best?.id ?? null
  })
  if (!road) {
    report('find a road in view', 'a road', null)
    return
  }
  const tagsOf = (id: string) =>
    page.evaluate((id) => ({ ...window.__maid.engine.data.way(id)!.tags }), id) as Promise<Tags>
  /** The lane keys of the road, sorted */
  const lanesOf = async () =>
    Object.fromEntries(
      Object.entries(await tagsOf(road))
        .filter(([key]) => key === 'lanes' || key.startsWith('lanes:') || key.includes(':lanes'))
        .sort(([a], [b]) => a.localeCompare(b)),
    )
  const undoLabel = () => page.evaluate(() => window.__maid.engine.undoState().undoLabel ?? null)

  // --- the focused filters of the lanes editor ---
  const states = await page.evaluate(() => window.__maid.engine.filters.states())
  report(
    'the lanes editor starts focused: roads editable, buildings and points locked, boundaries hidden',
    {
      traffic_roads: 'editable',
      buildings: 'readonly',
      points: 'readonly',
      shops: 'readonly',
      boundaries: 'hidden',
    },
    {
      traffic_roads: states.traffic_roads,
      buildings: states.buildings,
      points: states.points,
      shops: states.shops,
      boundaries: states.boundaries,
    },
  )

  // setup, one step: a two-way road with one lane each way and no other lane keys
  await page.evaluate((id) => {
    const { engine } = window.__maid
    const tags = { ...engine.data.way(id)!.tags }
    for (const key of Object.keys(tags))
      if (key === 'oneway' || key === 'lanes' || key.startsWith('lanes:') || key.includes(':lanes'))
        delete tags[key]
    engine.setTags(
      id,
      { ...tags, lanes: '2', 'lanes:forward': '1', 'lanes:backward': '1' },
      'Setup',
    )
  }, road)
  await settle()
  const original = await tagsOf(road)
  const restore = async () => {
    for (let i = 0; i < 12; i++) {
      if (JSON.stringify(await tagsOf(road)) === JSON.stringify(original)) break
      await page.evaluate(() => window.__maid.engine.undo())
    }
    await settle()
  }

  await page.evaluate((id) => window.__bench.select(id), road)
  await settle()
  const sidebar = page.getByRole('complementary')
  const section = sidebar.locator('[data-lanes-section]')
  await section.waitFor({ timeout: 30_000 }).catch(() => undefined)
  report('the sidebar has the section "Lanes"', 1, await section.count())
  report('with the diagram', 1, await section.locator('[data-lanes-diagram]').count())
  report('and a column per lane', 2, await section.locator('[data-lane-cell^="turn:"]').count())

  // --- a value per lane ---
  await section.locator('[data-lane-cell="turn:forward:0"]').selectOption('left')
  await settle()
  report(
    'a turn chosen in the table writes one key',
    { lanes: '2', 'lanes:backward': '1', 'lanes:forward': '1', 'turn:lanes:forward': 'left' },
    await lanesOf(),
  )
  report('as one undo step', 'Changed a lane value', await undoLabel())

  const width = section.locator('[data-lane-cell="width:backward:0"]')
  await width.fill('3.25')
  await width.press('Enter')
  await settle()
  report(
    'a width typed in the table is written on Enter',
    '3.25',
    (await tagsOf(road))['width:lanes:backward'],
  )

  // --- a lane more, a lane less ---
  await section.getByRole('button', { name: "Add a lane: In the way's direction" }).click()
  await settle()
  report(
    '+ adds a lane in that direction: counts and pipes, the values stay',
    {
      lanes: '3',
      'lanes:backward': '1',
      'lanes:forward': '2',
      'turn:lanes:forward': 'left|',
      'width:lanes:backward': '3.25',
    },
    await lanesOf(),
  )
  report('as one undo step', 'Added a lane', await undoLabel())
  report(
    'the table has a column more',
    3,
    await section.locator('[data-lane-cell^="turn:"]').count(),
  )

  await section.locator('[data-lane-remove="forward:0"]').click()
  await settle()
  report(
    '× removes that lane and its entries',
    { lanes: '2', 'lanes:backward': '1', 'lanes:forward': '1', 'width:lanes:backward': '3.25' },
    await lanesOf(),
  )
  report('as one undo step', 'Removed a lane', await undoLabel())
  await restore()
  report('undo takes every change back', original, await tagsOf(road))

  // --- the cycle lane pattern: in the pipes, not in `lanes` ---
  await page.evaluate((id) => {
    const { engine } = window.__maid
    engine.setTags(
      id,
      { ...engine.data.way(id)!.tags, 'bicycle:lanes:forward': 'no|designated' },
      'Cycle lane for the check',
    )
  }, road)
  await settle()
  await section.getByRole('button', { name: "Add a lane: In the way's direction" }).click()
  await settle()
  report(
    'a lane added beside a cycle lane in the pipes counts only the new lane',
    { lanes: '3', 'lanes:forward': '2', 'bicycle:lanes:forward': 'no|designated|' },
    {
      lanes: (await tagsOf(road)).lanes,
      'lanes:forward': (await tagsOf(road))['lanes:forward'],
      'bicycle:lanes:forward': (await tagsOf(road))['bicycle:lanes:forward'],
    },
  )
  await restore()

  // --- a lane chosen in the diagram ---
  const slotId = `way/${road.slice(1)}/lane/forward/0`
  const slot = section.locator(`[data-lane-slot="${slotId}"]`)
  report('the diagram has the forward lane as a target', 1, await slot.count())
  report(
    'with a name for screen readers',
    "↑ 1, In the way's direction",
    await slot.first().getAttribute('aria-label'),
  )
  if ((await slot.count()) > 0) await slot.first().click()
  report(
    'a click on it marks its column in the table',
    1,
    await section.locator(`[data-lane-column="${slotId}"][data-chosen]`).count(),
  )
  if ((await slot.count()) > 0) await slot.first().click()
  report('a second click takes the mark away', 0, await section.locator('[data-chosen]').count())

  // --- the lanes of the selected road on the map ---
  await page.evaluate((id) => {
    const { engine, map } = window.__maid
    const nodes = engine.data.way(id)!.nodes
    const loc = engine.data.node(nodes[Math.floor(nodes.length / 2)]!)?.loc
    if (loc) map.jumpTo({ center: [loc[0], loc[1]], zoom: 18 })
  }, road)
  await page.evaluate((id) => window.__bench.select(id), road)
  await settle()
  let bands: string[] = []
  for (let i = 0; i < 40 && bands.length < 2; i++) {
    bands = await page.evaluate(() => {
      const ids: string[] = window.__maid.map
        .querySourceFeatures('maid-lanes-bands')
        .map((f: any) => String(f.properties?.slotId))
      return [...new Set(ids)].sort()
    })
    if (bands.length < 2) await page.waitForTimeout(250)
  }
  const wayNumber = road.slice(1)
  report(
    'the map has a band for each lane of the selected road',
    [`way/${wayNumber}/lane/backward/0`, `way/${wayNumber}/lane/forward/0`],
    bands,
  )

  await page.evaluate(() => window.__maid.map.zoomTo(19, { duration: 0 }))
  let arrows = 0
  for (let i = 0; i < 40 && arrows === 0; i++) {
    arrows = await page.evaluate(
      () => window.__maid.map.querySourceFeatures('maid-lanes-arrows').length,
    )
    if (arrows === 0) await page.waitForTimeout(250)
  }
  report('from zoom 18 the lanes have arrows on the map', true, arrows > 0)

  // --- a lane rule in the Issues dock, and its fix ---
  await page.evaluate((id) => window.__maid.engine.setTag(id, 'lanes', '5'), road)
  await settle()
  await page.getByRole('tab', { name: 'Issues' }).click()
  const panel = page.getByRole('tabpanel')
  const reported = async () =>
    (await panel.getByRole('listitem').allInnerTexts()).filter((t) =>
      t.includes('lanes=5, but the lanes per direction add up to 2'),
    ).length
  await page.waitForTimeout(500)
  report('a lane count that does not add up is reported', 1, await reported())
  const fix = panel.getByRole('button', { name: 'Set lanes=2' })
  report('with the fix "Set lanes=2"', 1, await fix.count())
  if ((await fix.count()) > 0) {
    await fix.first().click()
    await settle()
    await page.waitForTimeout(500)
  }
  report('the fix writes lanes=2', '2', (await tagsOf(road)).lanes)
  report('and the issue is gone', 0, await reported())
  await restore()
})

process.exit(failed ? 1 : 0)
