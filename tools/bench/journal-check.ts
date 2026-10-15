import { pickBuildingAndRoad, runDelete } from './check-helpers'
/**
 * Journal check for Maid: edits, reloads, restores the edits from the browser's storage and
 * compares data and map with before the reload; then undoes everything and reloads (nothing is asked), makes one
 * edit, reloads, discards, and reloads once more to see that nothing is asked.
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

    // the changed features are listed at once, with no disclosure to open
    const list = dialog.locator('ul').first()
    const changes = await list.innerText()
    report(
      'the changed features are listed without a click: the road and the new point, not the undone delete',
      [true, true, true, false],
      [
        await list.isVisible(),
        changes.includes('Journalstraße'),
        changes.includes('Created'),
        changes.includes('Deleted'),
      ],
    )

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

    // everything undone leaves nothing to restore: the reload asks nothing (iD stores no empty difference either)
    await reload()
    await ready()
    report('no restore question when everything was undone', 0, await dialog.count())
    report(
      'after that reload: nothing to undo or redo',
      [false, false],
      [(await read()).undo.canUndo, (await read()).undo.canRedo],
    )

    // one edit left: the reload asks, and discard forgets it
    await page.evaluate(() => window.__maid.engine.addPoint(0, 0, {}))
    await settle()
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
