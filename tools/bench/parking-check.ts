/**
 * Check of the parking editor (`--app parking`): the quick buttons of a selected road (one tag, one undo step, the
 * pressed state, `both`, two roads at once), the restriction field per side with a conditional rule typed as text
 * (written once it is whole, both sides equal written as `both`), a module validation rule in the Issues dock, the operation "Copy parking to the other side" and the parking lens
 * (the side features in the map's `parking-sides` source). Automation runs in English.
 *
 *   bun run check-parking [scene] --app parking
 *
 * Prints one line per check: `ok <check>`, or `FAIL <check>`. Exits 1 on any failure.
 */
import { runCheck } from './check-page'

const sceneName = process.argv[2] ?? 'small'

type Tags = Record<string, string>

const failed = await runCheck(sceneName, async ({ page, report, settle }) => {
  // two residential roads that are in view, picked before any change
  const roads = await page.evaluate(() => {
    const { map, engine } = window.__maid
    const bounds = map.getBounds()
    const found: string[] = []
    for (const f of map.querySourceFeatures('osm-lines')) {
      const id = String(f.id ?? '')
      const way = id.startsWith('w') && engine.data.way(id)
      if (!way || way.tags.highway !== 'residential' || way.tags.bridge || way.tags.tunnel) continue
      if (found.includes(id)) continue
      const inView = way.nodes.some((n: string) => {
        const loc = engine.data.node(n)?.loc
        return loc !== undefined && bounds.contains([loc[0], loc[1]])
      })
      if (inView) found.push(id)
      if (found.length === 2) break
    }
    return found
  })
  const [road, other] = roads
  if (!road || !other) {
    report('find two residential roads in view', 2, roads.length)
    return
  }
  const tagsOf = (id: string) =>
    page.evaluate((id) => ({ ...window.__maid.engine.data.way(id)!.tags }), id) as Promise<Tags>
  /** The parking keys of a road, sorted: what the buttons and the field write */
  const parkingOf = async (id: string) =>
    Object.fromEntries(
      Object.entries(await tagsOf(id))
        .filter(([key]) => key.startsWith('parking'))
        .sort(([a], [b]) => a.localeCompare(b)),
    )
  const undoLabel = () => page.evaluate(() => window.__maid.engine.undoState().undoLabel ?? null)
  // the fixture's residential roads all carry parking tags: the setup takes them away, as one step
  await page.evaluate(
    (ids) => {
      const { engine } = window.__maid
      for (const id of ids) {
        const keys = Object.keys(engine.data.way(id)!.tags).filter(
          (key) => key.startsWith('parking') || key.startsWith('lane'),
        )
        if (keys.length) engine.changeTags([id], { remove: keys }, 'Setup')
      }
    },
    [road, other],
  )
  await settle()
  const original = await tagsOf(road)
  const originalOther = await tagsOf(other)
  /** Undoes until the road has its first tags again (at most a dozen steps) */
  const restore = async () => {
    for (let i = 0; i < 12; i++) {
      const [a, b] = [await tagsOf(road), await tagsOf(other)]
      if (
        JSON.stringify(a) === JSON.stringify(original) &&
        JSON.stringify(b) === JSON.stringify(originalOther)
      )
        break
      await page.evaluate(() => window.__maid.engine.undo())
    }
    await settle()
  }
  const selectOne = async (id: string) => {
    await page.evaluate((id) => window.__bench.select(id), id)
    await settle()
  }
  /** Several features are selected through the URL, as multi-check.ts does */
  const selectMany = async (ids: string[]) => {
    await page.evaluate((list) => {
      const url = new URL(location.href)
      url.searchParams.set('id', list.join(','))
      history.pushState(null, '', url)
      window.dispatchEvent(new PopStateEvent('popstate'))
    }, ids)
    await settle()
  }
  const sidebar = page.getByRole('complementary')
  /** A cell of the grid by its row and side; its name also says its value and what the next click does */
  const cell = (row: string, side: 'left' | 'right' | 'both') =>
    sidebar.getByRole('button', {
      name: new RegExp(`^${row}, ${side === 'both' ? 'both sides' : `${side} side`}:`),
    })
  const LEFT = cell('Position', 'left')
  const BOTH = cell('Position', 'both')

  // --- the quick buttons on one road: each click moves a cell to its next value ---
  await selectOne(road)
  report(
    'the sidebar has the section "Parking"',
    1,
    await sidebar.getByRole('heading', { name: 'Parking', exact: true }).count(),
  )
  report('the position cell of the left side is there', 1, await LEFT.count())
  report('and is not pressed', 'false', await LEFT.getAttribute('aria-pressed'))

  await LEFT.click()
  await settle()
  report(
    'the first click writes the first value: parking:left=no',
    { 'parking:left': 'no' },
    await parkingOf(road),
  )
  report('and is one undo step', 'Set parking: No parking, left side', await undoLabel())
  report('the cell is pressed', 'true', await LEFT.getAttribute('aria-pressed'))

  await LEFT.click()
  await settle()
  report(
    'the second click writes the next value: parking:left=lane',
    { 'parking:left': 'lane' },
    await parkingOf(road),
  )

  await BOTH.click()
  await settle()
  report(
    'the both cell writes both sides: parking:both=no',
    { 'parking:both': 'no' },
    await parkingOf(road),
  )
  report(
    'equal sides press the both cell, not the left one',
    ['true', 'false'],
    [await BOTH.getAttribute('aria-pressed'), await LEFT.getAttribute('aria-pressed')],
  )

  await LEFT.click()
  await settle()
  report(
    'the left cell moves on from the shared value; the right side keeps it',
    { 'parking:left': 'lane', 'parking:right': 'no' },
    await parkingOf(road),
  )
  await restore()
  report('undo takes all of it back', original, await tagsOf(road))

  // --- the cells on two roads at once: one change, one undo step ---
  await selectMany([road, other])
  await settle()
  report(
    'with two roads selected the section "Parking" is there',
    1,
    await sidebar.getByRole('heading', { name: 'Parking', exact: true }).count(),
  )
  await LEFT.click()
  await settle()
  report(
    'a cell writes to both roads',
    [{ 'parking:left': 'no' }, { 'parking:left': 'no' }],
    [await parkingOf(road), await parkingOf(other)],
  )
  await page.evaluate(() => window.__maid.engine.undo())
  await settle()
  report(
    'one undo takes it from both',
    [original, originalOther],
    [await tagsOf(road), await tagsOf(other)],
  )

  // --- the restriction field, per side ---
  await selectOne(road)
  const right = sidebar.getByRole('group', { name: 'Right side', exact: true }).first()
  report(
    'the restriction field has a block for the left and the right side, and none for both',
    [1, 1, 0],
    [
      await sidebar.getByRole('group', { name: 'Left side', exact: true }).count(),
      await right.count(),
      await sidebar.getByRole('group', { name: 'Both sides', exact: true }).count(),
    ],
  )
  await right.getByRole('combobox').first().selectOption('no_parking')
  await settle()
  report(
    'no parking for the right side writes parking:right:restriction',
    { 'parking:right:restriction': 'no_parking' },
    await parkingOf(road),
  )

  // a conditional rule, typed as text
  await right.getByRole('button', { name: 'Add rule', exact: true }).click()
  await right.getByRole('combobox', { name: 'Value', exact: true }).selectOption('no_stopping')
  await settle()
  report(
    'a rule with a value and no condition is not written yet',
    { 'parking:right:restriction': 'no_parking' },
    await parkingOf(road),
  )
  await right.getByRole('button', { name: 'Edit as text', exact: true }).click()
  const condition = right.getByRole('textbox', { name: 'Condition', exact: true })
  await condition.fill('Mo-Fr 08:00-18:00')
  await condition.press('Enter')
  await settle()
  report(
    'a rule typed as text: the :conditional key holds exactly that text, and the plain value is kept',
    {
      'parking:right:restriction': 'no_parking',
      'parking:right:restriction:conditional': 'no_stopping @ (Mo-Fr 08:00-18:00)',
    },
    await parkingOf(road),
  )
  report(
    'the row is still in its text mode after the write',
    1,
    await right.getByRole('button', { name: 'Use fields', exact: true }).count(),
  )
  // the same restriction on the left side: equal sides are written as `both`, in one undo step
  const left = sidebar.getByRole('group', { name: 'Left side', exact: true }).first()
  await left.getByRole('combobox').first().selectOption('no_parking')
  await settle()
  report(
    'the same value on the left side collapses the plain key to both, as the other side fields do',
    {
      'parking:both:restriction': 'no_parking',
      'parking:right:restriction:conditional': 'no_stopping @ (Mo-Fr 08:00-18:00)',
    },
    await parkingOf(road),
  )
  await page.evaluate(() => window.__maid.engine.undo())
  await settle()
  report(
    'and one undo takes that back',
    {
      'parking:right:restriction': 'no_parking',
      'parking:right:restriction:conditional': 'no_stopping @ (Mo-Fr 08:00-18:00)',
    },
    await parkingOf(road),
  )
  await restore()
  report('undo takes the restriction back', original, await tagsOf(road))

  // --- a rule of the module in the Issues dock ---
  await page.evaluate(
    (id) =>
      window.__maid.engine.changeTags(
        [id],
        { set: { 'parking:left': 'lane', 'parking:left:reason': 'narrow' } },
        'Parking for the check',
      ),
    road,
  )
  await settle()
  await page.getByRole('tab', { name: 'Issues' }).click()
  const panel = page.getByRole('tabpanel')
  const rows = async () =>
    (await panel.getByRole('listitem').allInnerTexts()).map((t) => t.split('\n')[0] ?? '')
  const reported = async () =>
    (await rows()).filter((t) =>
      t.includes('parking:left:reason=narrow, but that side has parking'),
    ).length
  await page.waitForTimeout(500)
  report('a reason for no parking on a side with parking is reported', 1, await reported())
  await page.evaluate((id) => window.__maid.engine.setTag(id, 'parking:left', 'no'), road)
  await settle()
  await page.waitForTimeout(500)
  report('with parking:left=no it is not reported any more', 0, await reported())
  await restore()

  // --- the operation "Copy parking to the other side" ---
  await page.evaluate((id) => {
    const { engine } = window.__maid
    engine.setTags(
      id,
      {
        ...engine.data.way(id)!.tags,
        'parking:left': 'lane',
        'parking:left:orientation': 'parallel',
      },
      'Parking for the check',
    )
  }, road)
  await settle()
  const copied = await page.evaluate((id) => {
    const { engine, editor } = window.__maid
    engine.setSelected([id])
    const operation = editor
      .registry('edit.operation')
      .list()
      .find((o: any) => o.id === 'parking-copy-left-to-right')
    if (!operation) return null
    const context = { graph: engine.data.history.staging.graph, selected: [id] }
    const available = operation.applies(context) && operation.disabled(context) === undefined
    engine.runOperation(operation)
    return available
  }, road)
  await settle()
  report('the operation is registered and can run on a road with parking on the left', true, copied)
  report(
    'copying left to right collapses the equal sides into both',
    { 'parking:both': 'lane', 'parking:both:orientation': 'parallel' },
    await parkingOf(road),
  )
  report('and is one undo step', 'Copied the left parking to the right side', await undoLabel())

  // --- the parking lens: side features in the map's source ---
  await page.getByRole('button', { name: 'Map style' }).click()
  await page.getByRole('radio', { name: /^Parking/ }).click()
  await settle()
  let sides: string[] = []
  for (let i = 0; i < 20 && sides.length < 2; i++) {
    sides = await page.evaluate((id) => {
      const { map } = window.__maid
      return map
        .querySourceFeatures('parking-sides')
        .filter((f: any) => f.properties?.kind === 'side' && f.properties?.wayId === id)
        .map((f: any) => String(f.properties.side))
        .sort()
    }, road)
    if (sides.length < 2) await page.waitForTimeout(250)
  }
  report(
    'with the lens on the map has a side feature for each side of the road',
    ['left', 'right'],
    [...new Set(sides)],
  )
  await restore()
})

process.exit(failed ? 1 : 0)
