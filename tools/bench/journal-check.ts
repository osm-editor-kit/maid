/**
 * Journal check for Maid: edits, reloads, restores the edits from the browser's storage and
 * compares data and map with before the reload; then undoes everything, reloads, discards, and
 * reloads once more to see that nothing is asked.
 *
 *   bun tools/bench/journal-check.ts [scene]
 */
import { runCheck, type Check } from './check-page'

const sceneName = process.argv[2] ?? 'small'

type Picked = { road: string; vertex: string; building: string }

const pick = (page: Check['page']) =>
  page.evaluate(() => {
    const { map, engine } = (window as any).__maid
    let road: string | undefined
    let building: string | undefined
    for (const source of ['osm-areas', 'osm-lines'])
      for (const f of map.querySourceFeatures(source)) {
        const id = String(f.id ?? '')
        const way = id.startsWith('w') && engine.data.way(id)
        if (!way) continue
        if (!building && way.tags.building && !way.tags.highway) building = id
        if (!road && way.tags.highway === 'residential' && way.nodes.length > 2) road = id
      }
    const vertex = road ? engine.data.way(road).nodes[1] : undefined
    return { road, vertex, building }
  }) as Promise<Partial<Picked>>

{
  const code = await runCheck(sceneName, async ({ page, report, settle, drawnIn }) => {
    const picked = await pick(page)
    if (!picked.road || !picked.vertex || !picked.building) {
      report('find a road with a vertex and a building', 'all drawn', picked)
      return
    }
    const { road, vertex, building } = picked as Picked
    let point = ''
    const read = async () => {
      await settle()
      const ids = [road, vertex, building, point]
      const data = await page.evaluate((ids) => {
        const { engine, editor } = (window as any).__maid
        const graph = editor.history.staging.graph
        const entities = ids.map((id) => {
          const entity = graph.hasEntity(id)
          return entity ? { id, tags: entity.tags, loc: entity.loc, nodes: entity.nodes } : null
        })
        return { entities, undo: engine.undoState(), index: editor.history.index }
      }, ids)
      return { ...data, drawn: await drawnIn([road, building, point]) }
    }
    const reload = async () => {
      await page.evaluate(() => (window as any).__maid.journalFlushed())
      await page.reload()
      await page.waitForFunction(() => (window as any).__bench !== undefined)
    }
    const ready = async () => {
      await page.evaluate(() => (window as any).__bench.ready())
      await settle()
    }
    const dialog = page.getByRole('alertdialog')

    report('no restore question on a first visit', 0, await dialog.count())
    const pristine = await read()

    point = await page.evaluate(
      async ({ road, vertex }) => {
        const { engine } = (window as any).__maid
        engine.setTag(road, 'name', 'Journalstraße')
        const [lon, lat] = engine.data.node(vertex).loc
        engine.dragTo(vertex, lon + 0.0001, lat + 0.0001)
        await engine.endDrag()
        const id = engine.addPoint(lon + 0.0003, lat, { amenity: 'bench' })
        engine.setTag(id, 'backrest', 'yes')
        return id
      },
      { road, vertex },
    )
    await page.evaluate(
      (building) => (window as any).__maid.engine.deleteEntity(building),
      building,
    )
    await page.evaluate(() => (window as any).__maid.engine.undo())
    const edited = await read()
    report('five edits made, one undone', 4, edited.index)

    await reload()
    await dialog.waitFor()
    report(
      'the restore question names the edits',
      true,
      (await dialog.innerText()).includes('5 unsaved edits'),
    )
    await dialog.getByRole('button', { name: 'Restore' }).click()
    await dialog.waitFor({ state: 'detached' })
    await ready()
    report('after restore: data, undo state and map as before the reload', edited, await read())

    await page.evaluate(() => (window as any).__maid.engine.redo())
    await settle()
    report(
      'redo after restore deletes the building again',
      [],
      (await drawnIn([building]))[building],
    )
    const added = await page.evaluate(() => (window as any).__maid.engine.addPoint(0, 0, {}))
    report('a new point does not reuse a restored id', true, added !== point)
    await page.evaluate(() => (window as any).__maid.engine.undo())

    for (let i = 0; i < 5; i++) await page.evaluate(() => (window as any).__maid.engine.undo())
    const undone = await read()
    report('all undone: data as at the start', pristine.entities, undone.entities)
    report(
      'all undone: map as at the start',
      [pristine.drawn[road], pristine.drawn[building], []],
      [undone.drawn[road], undone.drawn[building], undone.drawn[point]],
    )
    report('nothing left to undo', false, undone.undo.canUndo)

    await reload()
    await dialog.waitFor()
    await dialog.getByRole('button', { name: 'Discard' }).click()
    await dialog.waitFor({ state: 'detached' })
    await ready()
    report(
      'after discard: nothing to undo or redo',
      [false, false],
      [(await read()).undo.canUndo, (await read()).undo.canRedo],
    )
    await reload()
    await ready()
    report('no restore question after discard', 0, await dialog.count())
  })
  process.exit(code)
}
