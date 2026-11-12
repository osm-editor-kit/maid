/**
 * Check of rotating on a touch device (packages/shell/src/components/RotateHandle.tsx and the menu button beside the
 * move handle, MoveHandle.tsx), with real touch input (CDP touch events), on a selected building:
 * - the menu button beside the move handle opens the edit menu, and its Rotate starts the rotate mode
 * - in that mode the move handle and the menu button are gone; the rotate handle and the panel are there
 * - a drag of the rotate handle a quarter round turns the building a quarter round; the map neither pans nor turns
 * - two fingers that turn turn the building further, and the map keeps its bearing
 * - Done keeps it as one undo step, selected; Cancel puts it back; a tap on the map ends the mode as Done does
 *
 *   bun tools/bench/rotate-handle-check.ts [scene] [--app maid|bicycle|parking]
 *
 * Needs `bun run dev`. The page is a phone by `?device=touch-ios`. Prints `ok <check>` or `FAIL <check>`.
 */
import { pickBuildingAndRoad } from './check-helpers'
import { runCheck } from './check-page'

const sceneName = process.argv[2] ?? 'small'

/** Degrees in (-180, 180] */
const wrap = (degrees: number) => {
  const d = ((((degrees + 180) % 360) + 360) % 360) - 180
  return d === -180 ? 180 : d
}

const failed = await runCheck(
  sceneName,
  async ({ page, report, settle }) => {
    const moveHandle = page.getByRole('button', { name: 'Move feature', exact: true })
    const menuButton = page.getByRole('button', { name: 'Edit menu', exact: true })
    const rotateHandle = page.getByRole('button', { name: 'Rotate feature', exact: true })
    const panel = page.locator('[data-rotate-panel]')
    const cdp = await page.context().newCDPSession(page)

    const tap = async (x: number, y: number) => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await settle()
    }
    const tapOn = async (locator: typeof moveHandle) => {
      const box = (await locator.boundingBox())!
      await tap(box.x + box.width / 2, box.y + box.height / 2)
    }
    /** The angle of the way's first node around the pivot, on screen (degrees), and the map's state */
    const state = (way: string, pivot?: [number, number]) =>
      page.evaluate(
        ({ way, pivot }) => {
          const { engine, map } = window.__maid
          const first = engine.data.way(way)!.nodes[0]!
          const loc = engine.data.node(first)!.loc!
          const at = window.__bench.project(loc[0], loc[1])
          const centre = window.__bench.project(...(pivot ?? [loc[0], loc[1]]))
          const c = map.getCenter()
          return {
            angle: (Math.atan2(at.y - centre.y, at.x - centre.x) * 180) / Math.PI,
            at,
            centre: [Number(c.lng.toFixed(7)), Number(c.lat.toFixed(7))],
            bearing: map.getBearing(),
            mode: engine.mode,
            selected: window.__bench.selected(),
            undo: engine.data.history.getUndoAnnotation(),
            pivot: engine.transform.rotation?.pivot as [number, number] | undefined,
          }
        },
        { way, pivot },
      )
    const startRotating = async (way: string) => {
      await page.evaluate((id) => window.__bench.select(id), way)
      await settle()
      await tapOn(menuButton)
      await tapOn(page.getByRole('menuitem', { name: /^Rotate/ }))
      return (await state(way)).pivot
    }

    const { building } = await pickBuildingAndRoad(page)
    report('the scene has a building', true, Boolean(building))
    if (!building) return
    await page.evaluate((id) => window.__bench.select(id), building)
    await settle()
    report(
      'a selected building: the move handle and the menu button',
      [1, 1],
      [await moveHandle.count(), await menuButton.count()],
    )
    report('no rotate handle while browsing', 0, await rotateHandle.count())

    await tapOn(menuButton)
    report('the menu button opens the edit menu', 1, await page.getByRole('menu').count())
    await tapOn(page.getByRole('menuitem', { name: /^Rotate/ }))
    const before = await state(building)
    const pivot = before.pivot
    report('Rotate in that menu starts the rotate mode', 'rotate', before.mode)
    report(
      'rotating: the move handle and the menu button are gone',
      [0, 0],
      [await moveHandle.count(), await menuButton.count()],
    )
    report(
      'rotating: one rotate handle and the panel',
      [1, 1],
      [await rotateHandle.count(), await panel.count()],
    )
    if (!pivot) return
    const start = await state(building, pivot)

    // the handle a quarter round clockwise around the pivot, in twelve steps
    const box = (await rotateHandle.boundingBox())!
    const p = await page.evaluate((pivot) => window.__bench.project(...pivot), pivot)
    const hx = box.x + box.width / 2
    const hy = box.y + box.height / 2
    const r = Math.hypot(hx - p.x, hy - p.y)
    const a0 = Math.atan2(hy - p.y, hx - p.x)
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: hx, y: hy }],
    })
    for (let i = 1; i <= 12; i++) {
      const a = a0 + ((Math.PI / 2) * i) / 12
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: p.x + r * Math.cos(a), y: p.y + r * Math.sin(a) }],
      })
      await page.waitForTimeout(20)
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await settle()
    const turned = await state(building, pivot)
    report(
      'the handle turns the building a quarter round',
      90,
      Math.round(wrap(turned.angle - start.angle)),
    )
    report(
      'the handle: the map did not pan or turn',
      [start.centre, 0],
      [turned.centre, turned.bearing],
    )
    report('still rotating after the drag', 'rotate', turned.mode)

    // two fingers 120 px apart that turn by 30 degrees around their middle
    const mid = { x: p.x, y: p.y + 40 }
    const fingers = (degrees: number) => {
      const a = (degrees * Math.PI) / 180
      return [
        { x: mid.x - 60 * Math.cos(a), y: mid.y - 60 * Math.sin(a), id: 1 },
        { x: mid.x + 60 * Math.cos(a), y: mid.y + 60 * Math.sin(a), id: 2 },
      ]
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: fingers(0) })
    for (let i = 1; i <= 10; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: fingers(3 * i) })
      await page.waitForTimeout(20)
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await settle()
    const twisted = await state(building, pivot)
    report(
      'two fingers turn the building further',
      30,
      Math.round(wrap(twisted.angle - turned.angle)),
    )
    report('two fingers: the map keeps its bearing', 0, twisted.bearing)

    await tapOn(panel.getByRole('button', { name: /^(Done|Fertig)$/ }))
    const done = await state(building, pivot)
    report(
      'Done: back to browsing, still selected',
      ['browse', [building]],
      [done.mode, done.selected],
    )
    report('Done: one undo step', 'Rotated a feature', done.undo)
    report('Done: the turn is kept', 120, Math.round(wrap(done.angle - start.angle)))
    report('Done: the move handle is back', 1, await moveHandle.count())
    await page.evaluate(() => window.__maid.engine.undo())
    await settle()
    const undone = await state(building, pivot)
    report('undo puts it back', 0, Math.round(wrap(undone.angle - start.angle)))

    // Cancel: the turn is taken back
    await startRotating(building)
    const box2 = (await rotateHandle.boundingBox())!
    const x2 = box2.x + box2.width / 2
    const y2 = box2.y + box2.height / 2
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: x2, y: y2 }],
    })
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: x2 + 80, y: y2 + 40 }],
    })
    await page.waitForTimeout(50)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await settle()
    const moved = await state(building, pivot)
    report('a second rotation turns it', true, Math.abs(wrap(moved.angle - start.angle)) > 5)
    await tapOn(panel.getByRole('button', { name: /^(Cancel|Abbrechen)$/ }))
    const cancelled = await state(building, pivot)
    report(
      'Cancel: back to browsing, the turn taken back',
      ['browse', 0],
      [cancelled.mode, Math.round(wrap(cancelled.angle - start.angle))],
    )

    // a tap on the map ends the mode as Done does, and the tap's place does not turn it
    await startRotating(building)
    const size = page.viewportSize()!
    await tap(size.width / 2, size.height - 80)
    const tapped = await state(building, pivot)
    report('a tap on the map ends the rotate mode', 'browse', tapped.mode)
    report('the tap did not turn it', 0, Math.round(wrap(tapped.angle - start.angle)))
  },
  'device=touch-ios',
  true,
)
process.exit(failed)
