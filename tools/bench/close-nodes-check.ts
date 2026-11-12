/**
 * Close points check for Maid: adds a 10 x 15 m building whose top edge has two points 3 cm apart (what is left
 * after lining up two edges with Extrude) and expects the issue "very close together" in the dock, an amber ring on
 * the map at the pair, and Square (Q) to be offered. Square merges the pair and drops the point on the straight edge:
 * four corners are left, the issue and the ring go, and Square is then "already square". Undo brings all back.
 *
 *   bun tools/bench/close-nodes-check.ts [scene]
 *
 * Prints one line per check: `ok <check>`, or `FAIL <check>`. Exits 1 on any failure. Expected: 7 `ok` lines.
 */
import { runCheck } from './check-page'

process.exit(
  await runCheck(process.argv[2] ?? 'small', async ({ page, report, settle }) => {
    const wayId = (await page.evaluate(() => {
      const { map, editor, model } = window.__maid
      const { lng, lat } = map.getCenter()
      const mLat = 1 / 111_320
      const mLon = 1 / (111_320 * Math.cos((lat * Math.PI) / 180))
      const at = (x: number, y: number): [number, number] => [lng + x * mLon, lat + y * mLat]
      const { history, context } = editor
      const nodes = [
        at(-5, 7.5),
        at(0, 7.5),
        at(0, 7.53),
        at(5, 7.53),
        at(5, -7.5),
        at(-5, -7.5),
      ].map((loc) => new model.OsmNode(context, { loc }))
      const way = new model.OsmWay(context, {
        nodes: [...nodes.map((node) => node.id), nodes[0]!.id],
        tags: { building: 'house' },
      })
      history.perform(
        ...nodes.map((node) => model.actionAddEntity(node)),
        model.actionAddEntity(way),
      )
      history.commit({ annotation: 'Added a building for the check', selectedIDs: [way.id] })
      return way.id as string
    })) as string
    await page.evaluate(() => window.__maid.map.jumpTo({ zoom: 19 }))
    await settle()

    await page.getByRole('tab', { name: 'Issues' }).click()
    const panel = page.getByRole('tabpanel')
    const rows = async () =>
      (await panel.getByRole('listitem').allInnerTexts()).map((t) => t.split('\n')[0] ?? '')
    report(
      'dock: two points of the building are very close together',
      true,
      (await rows()).some((t) => /very close together \(3 cm\)/.test(t)),
    )
    const rings = () =>
      page.evaluate(() => {
        const { map } = window.__maid
        if (!map.getLayer('validation-on-map-ring')) return 0
        return map.queryRenderedFeatures({ layers: ['validation-on-map-ring'] }).length
      }) as Promise<number>
    report('map: an amber ring at the pair', 1, await rings())

    await page.evaluate((id) => window.__bench.select(id), wayId)
    await settle()
    const squareState = () =>
      page.evaluate((id) => {
        const { model, editor } = window.__maid
        return model.actionOrthogonalize(id).disabled?.(editor.history.staging.graph) ?? 'none'
      }, wayId) as Promise<string | false>
    report('Square is offered (not "already square")', false, await squareState())

    await page.keyboard.press('q')
    await settle()
    await page.waitForTimeout(400) // the squaring is animated
    await settle()
    const nodeCount = () =>
      page.evaluate(
        (id) => window.__maid.engine.data.way(id)?.nodes.length ?? 0,
        wayId,
      ) as Promise<number>
    report('Square: four corners are left', 5, await nodeCount())
    report(
      'Square: the issue and the ring are gone',
      [false, 0],
      [(await rows()).some((t) => /very close together/.test(t)), await rings()],
    )
    report('Square again: already square', 'square_enough', await squareState())

    await page.evaluate(() => window.__maid.engine.undo())
    await settle()
    report(
      'undo: the pair, the issue and the ring are back',
      [7, 1],
      [await nodeCount(), await rings()],
    )
  }),
)
