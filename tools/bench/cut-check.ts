import { checkHelpers, type XY, moveToOpenGround } from './check-helpers'
/**
 * Cut check for Maid (`--app parking`), with real mouse and key presses: draws a four-corner area with key 3, then cuts
 * it with the edit menu's "Cut" and a line across it. A line that crosses once is refused and the mode stays on; Enter
 * on a valid line cuts the area into two closed ways with its tags, both selected, as one undo step; undo gives the
 * area back with its own nodes. A selected point has no "Cut" in the menu. Fixtures only: the area is drawn, not loaded.
 *
 *   bun tools/bench/cut-check.ts [scene] --app parking
 *
 * Prints one line per check: `ok <check>`, or `FAIL <check>` with expected and actual. Exits 1 on any failure,
 * including a request outside localhost. Expected: 14 ok lines (13 checks, and the runner's request check).
 */
import { app, runCheck } from './check-page'

const sceneName = process.argv[2] ?? 'small'

// the Cut operation is in the parking editor only (maid-parking's config turns the module on)
if (app !== 'parking') {
  console.error('cut-check needs --app parking')
  process.exit(2)
}

type Way = { nodes: string[]; tags: Record<string, string> }

process.exit(
  await runCheck(sceneName, async ({ page, report, settle }) => {
    const { click, key, where, selection } = await checkHelpers(page, settle)
    // beside the scene's data: open ground for the drawings of this check
    await moveToOpenGround(page, settle, sceneName)

    const read = (id: string) =>
      page.evaluate((id) => {
        const { engine } = window.__maid
        const way = engine.data.way(id)
        return way ? { nodes: [...way.nodes], tags: { ...way.tags } } : null
      }, id) as Promise<Way | null>
    const undoLabel = () =>
      page.evaluate(() => window.__maid.engine.undoState().undoLabel ?? null) as Promise<
        string | null
      >
    const modeId = () =>
      page.evaluate(() => window.__maid.engine.moduleMode?.id ?? null) as Promise<string | null>
    const statusText = () =>
      page.evaluate(() =>
        [...document.querySelectorAll('[role="status"]')]
          .map((el) => el.textContent ?? '')
          .join(' | '),
      ) as Promise<string>
    const select = async (id: string) => {
      await page.evaluate((id) => window.__bench.select(id), id)
      await settle()
    }
    const cutItem = () => page.getByRole('menuitem', { name: 'Cut', exact: true })

    // open ground for a 60 px square: no line or point within 60 px of its centre, so no corner or click snaps to one.
    // Fills and labels may be there: they are not snapped to.
    const spot = (await page.evaluate(() => {
      const { map } = window.__maid
      const { width, height } = map.getCanvas().getBoundingClientRect()
      for (let y = 200; y < height - 200; y += 20)
        for (let x = 200; x < width - 200; x += 20) {
          const hits = map.queryRenderedFeatures([
            [x - 60, y - 60],
            [x + 60, y + 60],
          ])
          if (hits.every((f: any) => f.layer.type === 'fill' || f.layer.type === 'symbol'))
            return { x, y }
        }
      return null
    })) as XY | null
    if (!spot) {
      report('find open ground for an area', 'a place', null)
      return
    }
    const centre = spot
    const corners: XY[] = [
      { x: centre.x - 30, y: centre.y - 30 },
      { x: centre.x + 30, y: centre.y - 30 },
      { x: centre.x + 30, y: centre.y + 30 },
      { x: centre.x - 30, y: centre.y + 30 },
    ]
    // a line across the square at its middle: it crosses the left and the right edge, and nothing else
    const left: XY = { x: centre.x - 55, y: centre.y }
    const right: XY = { x: centre.x + 55, y: centre.y }

    // --- draw the area: 3, four corners, a click on the first closes it ---
    await key('3')
    for (const p of [...corners, corners[0]!]) await click(p)
    // the drawn way is the selection until Escape, which gives the keyboard back to the map (as draw-check reads it)
    const areaId = (await selection()).find((id) => id.startsWith('w') && id.includes('-')) ?? ''
    await key('Escape')
    const area = await read(areaId)
    report(
      'draw: a closed area with four corners and area=yes',
      [5, true, { area: 'yes' }],
      [area?.nodes.length ?? 0, area?.nodes[0] === area?.nodes[4], area?.tags ?? null],
    )
    if (!area) return
    const originalNodes = area.nodes
    const undoAfterDraw = await undoLabel()

    // --- the edit menu offers Cut for the selected area ---
    await select(areaId)
    await click(centre, { button: 'right' })
    const item = cutItem()
    const offered = (await item.count()) === 1 && !(await item.isDisabled())
    report('the edit menu offers Cut, enabled', true, offered)
    await item.click()
    await settle()
    report('Cut starts the cut mode', 'cut-area', await modeId())

    // --- a line that crosses the outline once: refused, the mode stays, the status says why ---
    await click(left)
    await click(centre)
    await key('Enter')
    report('a line that crosses once: the mode stays on', 'cut-area', await modeId())
    report(
      'and the status says why',
      true,
      (await statusText()).includes('must cross the outline twice'),
    )
    report(
      'and nothing changed: same nodes, same undo step',
      [originalNodes, undoAfterDraw],
      [(await read(areaId))?.nodes ?? null, await undoLabel()],
    )
    await key('Escape')
    report(
      'Escape leaves the mode, and nothing changed',
      [null, originalNodes, undoAfterDraw],
      [await modeId(), (await read(areaId))?.nodes ?? null, await undoLabel()],
    )

    // --- a line across the middle: Cut, two clicks, Enter ---
    await select(areaId)
    await click(centre, { button: 'right' })
    await cutItem().click()
    await settle()
    await click(left)
    await click(right)
    await key('Enter')
    const selected = (await selection()).filter((id) => id.startsWith('w'))
    const newId = selected.find((id) => id !== areaId) ?? ''
    const pieces = [await read(areaId), await read(newId)]
    report(
      'cut: two closed ways, both with the tags of the area',
      [true, true],
      pieces.map(
        (piece) =>
          piece !== null &&
          piece.nodes[0] === piece.nodes[piece.nodes.length - 1] &&
          JSON.stringify(piece.tags) === JSON.stringify(area.tags),
      ),
    )
    report(
      'cut: the area keeps its id, the other piece is new',
      [true, true],
      [selected.includes(areaId), newId.includes('-')],
    )
    report('cut: both pieces are selected', [2, true], [selected.length, selected.includes(newId)])
    report('cut: one undo step, named Cut an area in two', 'Cut an area in two', await undoLabel())

    // --- undo: the area has its own nodes again, and the other piece is gone ---
    await key('Meta+z')
    report(
      'undo: the area is back with its own nodes, and the other piece is gone',
      [originalNodes, null],
      [(await read(areaId))?.nodes ?? null, await read(newId)],
    )

    // --- a point selected: the menu opens, and Cut is not in it ---
    // an untagged corner is drawn only while its area is selected: select the area, then click the corner
    const corner = originalNodes[0] ?? ''
    await select(areaId)
    const [cornerAt] = await where([corner])
    if (!cornerAt) {
      report('find the corner on the map', 'a place', null)
      return
    }
    await click(cornerAt)
    await click(cornerAt, { button: 'right' })
    report(
      'a point selected: the menu opens, and it has no Cut',
      [1, 0],
      [await page.getByRole('menu').count(), await cutItem().count()],
    )
    await key('Escape')
  }),
)
