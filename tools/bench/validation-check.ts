/**
 * Validation check for Maid: adds a footway that crosses a road without a junction and is
 * connected to nothing, and expects both to be reported in the dock and the sidebar. Then
 * uses the fix "Connect the features" and expects both issues to go.
 *
 *   bun tools/bench/validation-check.ts [scene]
 */
import { runCheck } from './check-page'

process.exit(
  await runCheck(process.argv[2] ?? 'small', async ({ page, report, settle }) => {
    // a footway across the middle of a road segment, about 15 m long
    const made = (await page.evaluate(() => {
      const { map, engine, editor, model } = window.__maid
      const bounds = map.getBounds()
      for (const f of map.querySourceFeatures('osm-lines')) {
        const id = String(f.id ?? '')
        const road = engine.data.way(id)
        if (road?.tags.highway !== 'residential' || road.tags.bridge || road.tags.tunnel) continue
        for (let i = 0; i + 1 < road.nodes.length; i++) {
          const a = engine.data.node(road.nodes[i]!)?.loc
          const b = engine.data.node(road.nodes[i + 1]!)?.loc
          if (!a || !b || !bounds.contains(a) || !bounds.contains(b)) continue
          const dx = b[0] - a[0]
          const dy = b[1] - a[1]
          const length = Math.hypot(dx, dy)
          if (length < 0.0004) continue
          const midX = (a[0] + b[0]) / 2
          const midY = (a[1] + b[1]) / 2
          const offX = (-dy / length) * 0.0001
          const offY = (dx / length) * 0.0001
          const { history, context } = editor
          const n1 = new model.OsmNode(context, { loc: [midX + offX, midY + offY] })
          const n2 = new model.OsmNode(context, { loc: [midX - offX, midY - offY] })
          const way = new model.OsmWay(context, {
            nodes: [n1.id, n2.id],
            tags: { highway: 'footway' },
          })
          history.perform(
            model.actionAddEntity(n1),
            model.actionAddEntity(n2),
            model.actionAddEntity(way),
          )
          history.commit({ annotation: 'Added a footway for the check', selectedIDs: [way.id] })
          return { wayId: way.id as string, roadId: id, edge: [road.nodes[i], road.nodes[i + 1]] }
        }
      }
      return null
    })) as { wayId: string; roadId: string; edge: string[] } | null
    if (!made) {
      report('find a road segment to cross', 'one in view', null)
      return
    }
    await settle()

    await page.getByRole('tab', { name: 'Issues' }).click()
    const panel = page.getByRole('tabpanel')
    const rows = async () =>
      (await panel.getByRole('listitem').allInnerTexts()).map((t) => t.split('\n')[0] ?? '')
    const first = await rows()
    report(
      'dock: the crossing is reported',
      true,
      first.some((t) => /crosses/.test(t)),
    )
    report(
      'dock: the footway is reported as not connected',
      true,
      first.some((t) => /not connected/.test(t)),
    )

    // the same in the sidebar for the selected footway
    await page.evaluate((id) => window.__bench.select(id), made.wayId)
    // the inspector is a chunk of its own: settled waits until it shows its content
    await settle()
    const sidebar = page.getByRole('complementary')
    report(
      'sidebar: a section "Issues" for the footway',
      1,
      await sidebar.getByRole('heading', { name: 'Issues' }).count(),
    )

    await panel.getByRole('button', { name: 'Connect the features' }).first().click()
    await settle()
    // the footway can cross several things; the first fix in the list connects it to one of them
    const shared = await page.evaluate(({ wayId }) => {
      const { engine } = window.__maid
      const way = engine.data.way(wayId)!
      return [
        way.nodes.length,
        way.nodes.filter((id: string) => engine.data.nodeUses.get(id) === 2).length,
      ]
    }, made)
    report('fix: the footway has a third node, shared with the way it crossed', [3, 1], shared)
    const after = await rows()
    // the footway may cross something else too: one crossing less, not necessarily none
    const crossings = (list: string[]) => list.filter((t) => /crosses/.test(t)).length
    report(
      'fix: "not connected" is gone and one crossing less is reported',
      [false, crossings(first) - 1],
      [after.some((t) => /not connected/.test(t)), crossings(after)],
    )

    await page.evaluate(() => {
      const { engine } = window.__maid
      engine.undo()
    })
    await settle()
    const back = await rows()
    report(
      'undo the fix: both are reported again',
      [true, true],
      [back.some((t) => /crosses/.test(t)), back.some((t) => /not connected/.test(t))],
    )
    await page.evaluate(() => window.__maid.engine.undo())
    await settle()
    report('undo the footway: nothing is reported', 0, (await rows()).length)
  }),
)
