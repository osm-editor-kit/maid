/**
 * Check of the move handle on a touch device (packages/shell/src/components/MoveHandle.tsx), with real touch input
 * (CDP touch events): a selected building and a selected road each get the handle, a drag on it moves the whole
 * feature by the finger's way, keeps it selected and is one undo step, and the map neither pans nor selects what is
 * under the finger. With nothing selected there is no handle.
 *
 *   bun tools/bench/move-handle-check.ts [scene] [--app maid|bicycle|parking]
 *
 * Needs `bun run dev`. The page is a phone by `?device=touch-ios`. Prints `ok <check>` or `FAIL <check>`.
 */
import { pickBuildingAndRoad } from './check-helpers'
import { runCheck } from './check-page'

const sceneName = process.argv[2] ?? 'small'

const failed = await runCheck(
  sceneName,
  async ({ page, report, settle }) => {
    const select = async (id: string | null) => {
      await page.evaluate((id) => window.__bench.select(id), id)
      await settle()
    }
    const handle = page.getByRole('button', { name: 'Move feature', exact: true })
    const state = (way: string) =>
      page.evaluate((way) => {
        const { engine, map } = window.__maid
        const first = engine.data.way(way)!.nodes[0]!
        const loc = engine.data.node(first)!.loc!
        const centre = map.getCenter()
        return {
          at: window.__bench.project(loc[0], loc[1]),
          centre: [centre.lng, centre.lat],
          selected: window.__bench.selected(),
          mode: engine.mode,
          undo: engine.data.history.getUndoAnnotation(),
        }
      }, way)

    const cdp = await page.context().newCDPSession(page)
    /** A finger on the handle that moves by (dx, dy) in ten steps and lifts */
    const dragHandle = async (dx: number, dy: number) => {
      const box = (await handle.boundingBox())!
      const x = box.x + box.width / 2
      const y = box.y + box.height / 2
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
      for (let i = 1; i <= 10; i++) {
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: x + (dx * i) / 10, y: y + (dy * i) / 10 }],
        })
        await page.waitForTimeout(20)
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await settle()
    }

    const { building, road } = await pickBuildingAndRoad(page)
    report('the scene has a building and a road', true, Boolean(building && road))
    if (!building || !road) return

    await select(null)
    report('nothing selected: no handle', 0, await handle.count())

    for (const [what, way] of [
      ['building', building],
      ['road', road],
    ] as const) {
      await select(way)
      report(`${what}: one handle`, 1, await handle.count())
      const before = await state(way)
      // towards the middle of the window, so the finger stays on the page
      const box = (await handle.boundingBox())!
      const size = page.viewportSize()!
      const dx = box.x < size.width / 2 ? 60 : -60
      const dy = box.y < size.height / 2 ? 40 : -40
      await dragHandle(dx, dy)
      const after = await state(way)
      const moved = [Math.round(after.at.x - before.at.x), Math.round(after.at.y - before.at.y)]
      report(`${what}: the feature moved with the finger`, [dx, dy], moved)
      report(`${what}: the map did not pan`, before.centre, after.centre)
      report(
        `${what}: still selected, back to browsing`,
        [[way], 'browse'],
        [after.selected, after.mode],
      )
      report(`${what}: one undo step`, 'Moved a feature', after.undo)
      await page.evaluate(() => window.__maid.engine.undo())
      await settle()
      const undone = await state(way)
      report(
        `${what}: undo puts it back`,
        [Math.round(before.at.x), Math.round(before.at.y)],
        [Math.round(undone.at.x), Math.round(undone.at.y)],
      )
    }
  },
  'device=touch-ios',
  true,
)
process.exit(failed)
