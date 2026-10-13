/**
 * Check of the inspector for several selected features: two buildings with different tags are
 * selected, the sidebar shows what they share, a typed value goes to both as one undo step, a
 * mixed tag shows "Multiple values", and a read-only feature among them refuses the whole change.
 *
 *   bun tools/bench/multi-check.ts [scene]
 */
import { runCheck } from './check-page'

const sceneName = process.argv[2] ?? 'small'

const failed = await runCheck(sceneName, async ({ page, report, settle }) => {
  // two buildings that are all in view, picked before any change
  const ids = await page.evaluate(() => {
    const { map, engine } = window.__maid
    const bounds = map.getBounds()
    const found: string[] = []
    for (const f of map.querySourceFeatures('osm-areas')) {
      const id = String(f.id ?? '')
      const way = id.startsWith('w') && engine.data.way(id)
      if (!way || !way.tags.building || way.tags.highway || found.includes(id)) continue
      const inView = way.nodes.every((n) => {
        const loc = engine.data.node(n)?.loc
        return loc !== undefined && bounds.contains([loc[0], loc[1]])
      })
      if (inView) found.push(id)
      if (found.length === 2) break
    }
    return found
  })
  const [a, b] = ids
  if (!a || !b) {
    report('find two buildings in view', 2, ids.length)
    return
  }
  const tagsOf = () =>
    page.evaluate(
      (ids) => ids.map((id) => ({ ...window.__maid.engine.data.way(id)!.tags })),
      [a, b],
    )
  const undoLabel = () => page.evaluate(() => window.__maid.engine.undoState().undoLabel ?? null)
  const select = async (list: string[]) => {
    await page.evaluate((list) => {
      const url = new URL(location.href)
      url.searchParams.set('id', list.join(','))
      history.pushState(null, '', url)
      window.dispatchEvent(new PopStateEvent('popstate'))
    }, list)
    await settle()
  }

  // the setup: the two differ in `name`, and only the first has `note`
  await page.evaluate(
    ([a, b]) => {
      const { engine } = window.__maid
      engine.setTag(a!, 'name', 'Haus A')
      engine.setTag(b!, 'name', 'Haus B')
      engine.setTag(a!, 'note', 'only here')
    },
    [a, b],
  )
  await select([a, b])
  const sidebar = page.locator('aside').first()
  report('the sidebar names the count', true, (await sidebar.innerText()).includes('2 features'))

  const sheet = page.getByRole('grid', { name: 'Tags' })
  const valueOf = (key: string) => sheet.getByLabel(`Value of ${key}`, { exact: true })
  report(
    'a tag with different values and a tag only one has show "Multiple values"',
    ['Multiple values', 'Multiple values'],
    [
      await valueOf('name').getAttribute('placeholder'),
      await valueOf('note').getAttribute('placeholder'),
    ],
  )

  // --- a value typed in the mixed cell goes to both, as one undo step ---
  const before = await tagsOf()
  const stepBefore = await undoLabel()
  await valueOf('name').click()
  await page.keyboard.type('Beide')
  await page.keyboard.press('Enter')
  await settle()
  let now = await tagsOf()
  report(
    'a value typed in a mixed cell is written to both',
    ['Beide', 'Beide'],
    now.map((t) => t.name),
  )
  report(
    'the other tags are untouched',
    [before[0]!.note, before[1]!.note],
    now.map((t) => t.note),
  )
  await page.evaluate(() => window.__maid.engine.undo())
  await settle()
  report('one undo restores both', before, await tagsOf())
  report('and the step before it is the setup again', stepBefore, await undoLabel())

  // --- a new tag in the empty row is added to both ---
  await sheet.getByLabel('Key of new row', { exact: true }).click()
  await page.keyboard.type('check')
  await page.keyboard.press('Tab')
  await page.keyboard.type('multi')
  await page.keyboard.press('Enter')
  await settle()
  now = await tagsOf()
  report(
    'a new tag is added to both',
    ['multi', 'multi'],
    now.map((t) => t.check),
  )
  await page.evaluate(() => window.__maid.engine.undo())
  await settle()
  report('one undo takes it from both', before, await tagsOf())

  // --- one of them read-only: nothing is written, and a toast says so ---
  await page.evaluate(() => {
    const { engine } = window.__maid
    engine.setFilters(engine.filters.with('buildings', 'readonly'))
  })
  await settle()
  await valueOf('name').click()
  await page.keyboard.type('Nein')
  await page.keyboard.press('Enter')
  await settle()
  report('with read-only features nothing is written', before, await tagsOf())
  report(
    'and a toast says how many are read-only',
    1,
    await page.getByText('2 of 2 selected features are read-only. Nothing was changed.').count(),
  )
})

process.exit(failed ? 1 : 0)
