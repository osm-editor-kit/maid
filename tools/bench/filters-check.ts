/**
 * Filters check for Maid: hides buildings, makes them read-only, resets, and starts once with a
 * filter in the URL. Checks what the map has in its sources and that a read-only feature
 * refuses edits.
 *
 *   bun tools/bench/filters-check.ts [scene]
 */
import { runCheck, type Check } from './check-page'

const sceneName = process.argv[2] ?? 'small'

/** A building and a road that are drawn, picked before any filter changes */
const pick = (page: Check['page']) =>
  page.evaluate(() => {
    const { map, engine } = (window as any).__maid
    let building: string | undefined
    let road: string | undefined
    for (const source of ['osm-areas', 'osm-lines'])
      for (const f of map.querySourceFeatures(source)) {
        const id = String(f.id ?? '')
        const way = id.startsWith('w') && engine.data.way(id)
        if (!way) continue
        if (!building && way.tags.building && !way.tags.highway) building = id
        if (!road && way.tags.highway === 'residential') road = id
      }
    return { building, road }
  }) as Promise<{ building?: string; road?: string }>

const setFilter = (page: Check['page'], id: string, state: string) =>
  page.evaluate(
    ({ id, state }) => {
      const { engine } = (window as any).__maid
      engine.setFilters(engine.filters.with(id, state))
    },
    { id, state },
  )

let failed = await runCheck(sceneName, async ({ page, report, settle, drawnIn }) => {
  const { building, road } = await pick(page)
  if (!building || !road) {
    report('find a building and a residential road', 'both drawn', { building, road })
    return
  }
  const read = async () => {
    await settle()
    const drawn = await drawnIn([building, road])
    const state = await page.evaluate(
      ({ building }) => {
        const { engine } = (window as any).__maid
        return {
          readOnly: engine.isReadOnly(building),
          hidden: engine.hiddenCounts().buildings ?? 0,
          param: engine.filters.toParam(),
        }
      },
      { building },
    )
    return { building: drawn[building], road: drawn[road], ...state }
  }
  const start = await read()
  report(
    'start: both drawn, nothing hidden or read-only',
    [['areas'], ['lines'], false, 0, ''],
    Object.values(start),
  )

  await setFilter(page, 'buildings', 'hidden')
  let now = await read()
  report(
    'hide buildings: the building has no feature, the road stays',
    [[], ['lines'], 'buildings:hidden'],
    [now.building, now.road, now.param],
  )
  report('hide buildings: they are counted', true, now.hidden > 0)

  await setFilter(page, 'buildings', 'readonly')
  now = await read()
  report(
    'read-only buildings: drawn again and marked',
    [['areas'], true, 0, 'buildings:readonly'],
    [now.building, now.readOnly, now.hidden, now.param],
  )
  const refused = await page.evaluate((id) => {
    const { engine } = (window as any).__maid
    const before = JSON.stringify(engine.entity(id).tags)
    engine.setTag(id, 'name', 'Filter test')
    const deleted = engine.deleteEntity(id)
    return [JSON.stringify(engine.entity(id)?.tags) === before, deleted, engine.undoState().canUndo]
  }, building)
  report(
    'read-only buildings: a tag change and a delete are refused, nothing to undo',
    [true, false, false],
    refused,
  )

  await setFilter(page, 'buildings', 'editable')
  now = await read()
  report('reset: as at the start', Object.values(start), Object.values(now))
  const changed = await page.evaluate((id) => {
    const { engine } = (window as any).__maid
    engine.setTag(id, 'name', 'Filter test')
    const name = engine.entity(id).tags.name
    engine.undo()
    return name
  }, building)
  report('reset: the building can be edited again', 'Filter test', changed)
})

// a link with a filter starts with it, in Maid's form and in iD's
for (const query of ['filters=buildings:hidden', 'disable_features=buildings'])
  failed += await runCheck(
    sceneName,
    async ({ page, report }) => {
      const state = await page.evaluate(() => {
        const { map, engine } = (window as any).__maid
        const buildings = map
          .querySourceFeatures('osm-areas')
          .filter((f: any) => engine.data.way(String(f.id))?.tags.building).length
        return [engine.filters.toParam(), buildings, (engine.hiddenCounts().buildings ?? 0) > 0]
      })
      report(`${query}: starts with buildings hidden`, ['buildings:hidden', 0, true], state)
    },
    query,
  )

process.exit(failed ? 1 : 0)
