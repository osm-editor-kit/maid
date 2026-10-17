import { checkHelpers, type XY, moveToOpenGround } from './check-helpers'
/**
 * Cut check for Maid (`--app parking`), with real mouse and key presses. Draws a four-corner area with key 3, then the
 * edit menu's "Cut" draws the default line across it: two points and a midpoint, both points outside the area. The line
 * and the handles are read from the module's source data (`map.getSource('cut-preview')`), not from rendered features.
 * Then: a press on the midpoint adds a point, which is dragged (the cut still works, the shared edge has the bend); a click
 * beside an end moves that end; Enter cuts the area into two closed ways with its tags, as one undo step. A line that
 * crosses the outline once is refused: the panel says why and Apply is disabled, and Enter changes nothing. Escape,
 * and Backspace, change nothing. Fixtures only: the area is drawn, not loaded.
 *
 *   bun tools/bench/cut-check.ts [scene] --app parking
 *
 * Prints one line per check: `ok <check>`, or `FAIL <check>` with expected and actual. Exits 1 on any failure,
 * including a request outside localhost. Expected: 25 ok lines (24 checks, and the runner's request check).
 */
import { app, runCheck } from './check-page'

const sceneName = process.argv[2] ?? 'small'

// the Cut operation is in the parking editor only (maid-parking's config turns the module on)
if (app !== 'parking') {
  console.error('cut-check needs --app parking')
  process.exit(2)
}

type Way = { nodes: string[]; tags: Record<string, string> }

/** The preview as the module's source holds it: each point and midpoint with its handle name and screen position */
type Preview = {
  points: { handle: string; at: XY }[]
  midpoints: { handle: string; at: XY }[]
  pieces: number
}

process.exit(
  await runCheck(sceneName, async ({ page, report, settle }) => {
    const { click, drag, key, near, selection, where } = await checkHelpers(page, settle)
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
    const select = async (id: string) => {
      await page.evaluate((id) => window.__bench.select(id), id)
      await settle()
    }
    const cutItem = () => page.getByRole('menuitem', { name: 'Cut', exact: true })
    const applyButton = () => page.getByRole('button', { name: 'Apply', exact: true })
    const alertText = () =>
      page.locator('[data-cut-panel] [role="alert"]').textContent() as Promise<string | null>
    // the handles and the pieces as the map's source has them now, in screen positions
    // MapLibre's GeoJSON source returns its data as a Promise, so the read awaits it
    const preview = () =>
      page.evaluate(async () => {
        const { map } = window.__maid
        const source = map.getSource('cut-preview') as { getData(): Promise<unknown> } | undefined
        const data = (await source?.getData()) as
          | {
              features: {
                geometry: { type: string; coordinates: any }
                properties: { kind: string; handle?: string }
              }[]
            }
          | undefined
        if (!data) return null
        const at = (coordinates: [number, number]) => {
          const p = map.project(coordinates)
          return { x: p.x, y: p.y }
        }
        const of = (kind: string) => data.features.filter((f) => f.properties.kind === kind)
        return {
          points: of('point').map((f) => ({
            handle: f.properties.handle ?? '',
            at: at(f.geometry.coordinates),
          })),
          midpoints: of('midpoint').map((f) => ({
            handle: f.properties.handle ?? '',
            at: at(f.geometry.coordinates),
          })),
          pieces: of('piece').length,
        }
      }) as Promise<Preview | null>

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
    const outside = (p: XY | undefined) =>
      !!p && (Math.abs(p.x - centre.x) > 30 || Math.abs(p.y - centre.y) > 30)

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

    // --- the edit menu offers Cut; Cut draws the default line: two points, one midpoint, two pieces ---
    await select(areaId)
    await click(centre, { button: 'right' })
    const item = cutItem()
    report(
      'the edit menu offers Cut, enabled',
      true,
      (await item.count()) === 1 && !(await item.isDisabled()),
    )
    await item.click()
    await settle()
    report('Cut starts the cut mode', 'cut-area', await modeId())

    const first = await preview()
    report(
      'the default line: two points, one midpoint between them, two pieces',
      [2, 1, 2],
      first ? [first.points.length, first.midpoints.length, first.pieces] : null,
    )
    report(
      'the default line: both ends outside the area, through its middle',
      [true, true, true],
      [
        outside(first?.points[0]?.at),
        outside(first?.points[1]?.at),
        near(first?.midpoints[0]?.at, centre, 3),
      ],
    )
    const headline = await page.locator('[data-cut-panel] h2').textContent()
    report(
      'the panel: its headline, and Apply enabled',
      ['Cut area', false],
      [headline, await applyButton().isDisabled()],
    )

    // --- a press on the midpoint adds a point there, and the drag moves it: a bend in the line ---
    const midpoint = first?.midpoints[0]?.at ?? centre
    const bend: XY = { x: centre.x + 12, y: centre.y }
    // a hand's press, 6 px and 5 px off the midpoint's centre (the midpoint's dot is 4 px in radius)
    await drag({ x: midpoint.x + 6, y: midpoint.y + 5 }, bend)
    // a click within 300 ms of a drag's end is not a click for the mode, so the next click waits
    await page.waitForTimeout(400)
    const bent = await preview()
    report(
      'a midpoint drag adds a point: three points, two midpoints, two pieces',
      [3, 2, 2],
      bent ? [bent.points.length, bent.midpoints.length, bent.pieces] : null,
    )
    report('the new point is the middle one of the three', 'point:1', bent?.points[1]?.handle)
    report('and it is where the pointer let go', true, near(bent?.points[1]?.at, bend, 3))

    // --- a click beside the far end, outside the area: the nearer end moves there, the other stays ---
    const far = bent?.points[2]?.at ?? centre
    const start = bent?.points[0]?.at ?? centre
    const away = { x: far.x - centre.x, y: far.y - centre.y }
    const length = Math.hypot(away.x, away.y) || 1
    const beside: XY = { x: far.x + (away.x / length) * 20, y: far.y + (away.y / length) * 20 }
    await click(beside)
    const moved = await preview()
    report(
      'a click beside the far end moves that end to the click',
      true,
      near(moved?.points[2]?.at, beside, 3),
    )
    report('and the other end stays where it was', true, near(moved?.points[0]?.at, start, 3))

    // --- Enter: two closed ways with the tags of the area, one undo step ---
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
    // the shared edge is the chord: its two crossings and the bend. A closed piece lists its first node twice, so the
    // nodes are counted once each
    const sharedNodes = [...new Set(pieces[0]?.nodes ?? [])].filter((id) =>
      (pieces[1]?.nodes ?? []).includes(id),
    )
    report('cut: the two pieces share three nodes, the bend included', 3, sharedNodes.length)
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

    // --- a line that crosses the outline once: the panel says why, Apply is disabled, Enter changes nothing ---
    await select(areaId)
    await click(centre, { button: 'right' })
    await cutItem().click()
    await settle()
    const ends = (await preview())?.points ?? []
    // the start is dragged into the area: the line then crosses the outline once
    await drag(ends[0]?.at ?? centre, { x: centre.x, y: centre.y - 10 })
    report(
      'a line that crosses once: the panel says why, and Apply is disabled',
      [true, true],
      [
        (await alertText())?.includes('must cross the outline twice') ?? false,
        await applyButton().isDisabled(),
      ],
    )
    report('while it is refused the preview has no pieces', 0, (await preview())?.pieces)
    await key('Enter')
    report('Enter on a refused line keeps the mode', 'cut-area', await modeId())
    report(
      'and changes nothing: same nodes, same undo step',
      [originalNodes, undoAfterDraw],
      [(await read(areaId))?.nodes ?? null, await undoLabel()],
    )
    // Backspace is taken by the mode: it removes nothing, and the mode stays
    await key('Backspace')
    report(
      'Backspace leaves the mode and the area alone',
      ['cut-area', originalNodes],
      [await modeId(), (await read(areaId))?.nodes ?? null],
    )
    await key('Escape')
    report(
      'Escape leaves the mode, and nothing changed',
      [null, originalNodes, undoAfterDraw],
      [await modeId(), (await read(areaId))?.nodes ?? null, await undoLabel()],
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
