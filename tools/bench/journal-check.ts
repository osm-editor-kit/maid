import { pickBuildingAndRoad, runDelete } from './check-helpers'
/**
 * Journal check for Maid: edits, reloads, restores the edits from the browser's storage and
 * compares data and map with before the reload; then undoes everything, reloads, discards, and
 * reloads once more to see that nothing is asked.
 *
 *   bun tools/bench/journal-check.ts [scene]
 */
import { runCheck } from './check-page'

const sceneName = process.argv[2] ?? 'small'

type Picked = { road: string; vertex: string; building: string }

{
  const code = await runCheck(sceneName, async ({ page, report, settle, drawnIn }) => {
    // the road needs a vertex to drag: more than two nodes
    const picked = await pickBuildingAndRoad(page, 3)
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
        const { engine, editor } = window.__maid
        const graph = editor.history.staging.graph
        const entities = ids.map((id) => {
          const entity = graph.hasEntity(id)
          return entity
            ? {
                id,
                tags: entity.tags,
                loc: 'loc' in entity ? entity.loc : undefined,
                nodes: 'nodes' in entity ? entity.nodes : undefined,
              }
            : null
        })
        return { entities, undo: engine.undoState(), index: editor.history.index }
      }, ids)
      return { ...data, drawn: await drawnIn([road, building, point]) }
    }
    const reload = async () => {
      await page.evaluate(() => window.__maid.journalFlushed())
      await page.reload()
      await page.waitForFunction(() => window.__bench !== undefined)
    }
    const ready = async () => {
      await page.evaluate(() => window.__bench.ready())
      await settle()
    }
    const dialog = page.getByRole('alertdialog')

    report('no restore question on a first visit', 0, await dialog.count())
    const pristine = await read()

    point = await page.evaluate(
      async ({ road, vertex }) => {
        const { engine } = window.__maid
        engine.setTag(road, 'name', 'Journalstraße')
        const [lon, lat] = engine.data.node(vertex)!.loc!
        engine.dragTo(vertex, lon + 0.0001, lat + 0.0001)
        await engine.endDrag()
        const id = engine.addPoint(lon + 0.0003, lat, { amenity: 'bench' })
        engine.setTag(id, 'backrest', 'yes')
        return id
      },
      { road, vertex },
    )
    await runDelete(page, [building])
    await page.evaluate(() => window.__maid.engine.undo())
    const edited = await read()
    report('five edits made, one undone', 4, edited.index)
    // the vertex as the edits left it: after the reload only the base map has it
    const vertexLoc = await page.evaluate((id) => {
      const { model, editor } = window.__maid
      const node = editor.history.staging.graph.hasEntity(id)
      return node instanceof model.OsmNode ? node.loc : undefined
    }, vertex)

    await reload()
    await dialog.waitFor()
    const question = await dialog.innerText()
    report('the restore question names the edits', true, question.includes('5 unsaved edits'))
    report(
      'the restore question names the features, and the one undone edit',
      true,
      question.includes('5 unsaved edits to 3 features (1 undone)'),
    )
    report(
      'the restore question names the road where the edits are',
      true,
      question.includes('Journalstraße'),
    )

    await dialog.getByText('Show the changes').click()
    const changes = await dialog.locator('ul').first().innerText()
    report(
      'opening "Show the changes" lists the road and the new point, not the undone delete',
      [true, true, false],
      [changes.includes('Journalstraße'), changes.includes('Created'), changes.includes('Deleted')],
    )

    const state = () =>
      page.evaluate(() => {
        const { editor, engine } = window.__maid
        return {
          index: editor.history.index,
          undo: engine.undoState(),
          selection: engine.selection,
          staging: Object.keys(editor.history.staging.graph.local.entities).sort(),
        }
      })
    const beforeMap = await state()
    await dialog.getByRole('button', { name: 'Show on the map' }).click()
    await dialog.getByRole('button', { name: 'Back' }).waitFor()
    report('"Show on the map" changes no data and selects nothing', beforeMap, await state())
    report(
      'the map is moved to the stored edits',
      true,
      vertexLoc
        ? await page.evaluate(
            (loc) => window.__maid.map.getBounds().contains([loc[0], loc[1]]),
            vertexLoc,
          )
        : false,
    )
    report(
      'Restore and Discard stay in reach while the map is shown',
      [true, true],
      [
        await dialog.getByRole('button', { name: 'Restore' }).isVisible(),
        await dialog.getByRole('button', { name: 'Discard' }).isVisible(),
      ],
    )
    await dialog.getByRole('button', { name: 'Back' }).click()
    await dialog.getByText('Show the changes').waitFor()

    await dialog.getByRole('button', { name: 'Restore' }).click()
    await dialog.waitFor({ state: 'detached' })
    await ready()
    report('after restore: data, undo state and map as before the reload', edited, await read())

    await page.evaluate(() => window.__maid.engine.redo())
    await settle()
    report(
      'redo after restore deletes the building again',
      [],
      (await drawnIn([building]))[building],
    )
    const added = await page.evaluate(() => window.__maid.engine.addPoint(0, 0, {}))
    report('a new point does not reuse a restored id', true, added !== point)
    await page.evaluate(() => window.__maid.engine.undo())

    for (let i = 0; i < 5; i++) await page.evaluate(() => window.__maid.engine.undo())
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
