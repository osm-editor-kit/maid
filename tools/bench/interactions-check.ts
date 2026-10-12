/**
 * Interaction check for Maid, with real mouse, keyboard and touch events, against what iD does:
 * Shift-click selects several features, the nodes of a selected area and standalone points can be
 * dragged, a double click on a way adds a node and one on open ground zooms, a double click
 * closes a drawn area without zooming, Backspace takes back a drawn node and Escape keeps the
 * way, M moves and R rotates with the pointer, Cmd+C and Cmd+V copy and paste, and one finger
 * drags a node.
 *
 *   bun tools/bench/interactions-check.ts [scene]
 */
import { runCheck } from './check-page'

type XY = { x: number; y: number }

let failed = await runCheck(process.argv[2] ?? 'small', async ({ page, report, settle }) => {
  const origin = (await page.evaluate(() => {
    const box = (window as any).__maid.map.getCanvas().getBoundingClientRect()
    return { x: box.left, y: box.top }
  })) as XY
  const abs = (p: XY) => ({ x: origin.x + p.x, y: origin.y + p.y })
  const click = async (p: XY, options?: { shift?: boolean; count?: number }) => {
    const at = abs(p)
    await page.mouse.move(at.x, at.y)
    if (options?.shift) await page.keyboard.down('Shift')
    await page.mouse.click(at.x, at.y, { clickCount: options?.count ?? 1 })
    if (options?.shift) await page.keyboard.up('Shift')
    await settle()
  }
  const drag = async (from: XY, to: XY) => {
    const a = abs(from)
    const b = abs(to)
    await page.mouse.move(a.x, a.y)
    await page.mouse.down()
    await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 })
    await page.mouse.move(b.x, b.y, { steps: 4 })
    await page.mouse.up()
    await settle()
  }
  const key = async (name: string) => {
    // the editor's keys do not work in a text field: leave the type search first
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLInputElement) document.activeElement.blur()
    })
    await page.keyboard.press(name)
    await settle()
  }
  const state = () =>
    page.evaluate(() => {
      const { map, engine } = (window as any).__maid
      return {
        selection: [...engine.selection] as string[],
        zoom: Math.round(map.getZoom() * 100) / 100,
        mode: engine.mode as string,
        undo: (engine.undoState().undoLabel ?? null) as string | null,
      }
    })
  /** Screen positions of nodes */
  const where = (ids: string[]) =>
    page.evaluate((ids) => {
      const { map, engine } = (window as any).__maid
      return ids.map((id) => {
        const p = map.project(engine.data.node(id).loc)
        return { x: p.x, y: p.y }
      })
    }, ids) as Promise<XY[]>
  const near = (a: XY, b: XY, px = 3) => Math.hypot(a.x - b.x, a.y - b.y) <= px

  // what the checks work on: two buildings with a free corner each, a point, a road segment, open ground
  const found = (await page.evaluate(() => {
    const { map, engine } = (window as any).__maid
    const box = map.getCanvas().getBoundingClientRect()
    const inView = (p: XY) => p.x > 80 && p.y > 80 && p.x < box.width - 80 && p.y < box.height - 80
    type XY = { x: number; y: number }
    const alone = (p: XY, ownIds: string[], r = 12) =>
      map
        .queryRenderedFeatures([
          [p.x - r, p.y - r],
          [p.x + r, p.y + r],
        ])
        .every((f: any) => f.layer.type === 'fill' || ownIds.includes(String(f.id)))
    const buildings: { id: string; edge: XY; corner: string; nodes: string[] }[] = []
    let point: { id: string; at: XY } | undefined
    let road: { id: string; mid: XY } | undefined
    for (const f of map.queryRenderedFeatures()) {
      const id = String(f.id ?? '')
      if (id.startsWith('n') && !point && f.source.includes('points')) {
        const node = engine.data.node(id)
        const p = node?.loc && map.project(node.loc)
        if (p && inView(p) && alone(p, [id], 16)) point = { id, at: { x: p.x, y: p.y } }
      }
      const way = id.startsWith('w') && engine.data.way(id)
      if (!way || engine.data.wayMultipolygons.has(id)) continue
      const at = (n: string) => map.project(engine.data.node(n).loc)
      if (way.tags.building && !buildings.some((b) => b.id === id)) {
        // a corner that only this building uses, and the middle of an edge to click the outline
        const nodes = [...new Set<string>(way.nodes)]
        const corner = nodes.find(
          (n) => (engine.data.nodeUses.get(n) ?? 0) === 1 && inView(at(n)) && alone(at(n), [id, n]),
        )
        const a = at(way.nodes[0])
        const b = at(way.nodes[1])
        const edge = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
        if (
          nodes.length >= 4 &&
          Math.hypot(a.x - b.x, a.y - b.y) > 30 &&
          inView(edge) &&
          alone(edge, [id], 8)
        )
          buildings.push({ id, edge, corner: corner ?? '', nodes })
      }
      if (way.tags.highway && !road)
        for (let i = 0; i + 1 < way.nodes.length; i++) {
          const a = at(way.nodes[i])
          const b = at(way.nodes[i + 1])
          const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
          if (Math.hypot(a.x - b.x, a.y - b.y) > 80 && inView(mid) && alone(mid, [id])) {
            road = { id, mid }
            break
          }
        }
    }
    const free: XY[] = []
    for (let y = 100; y < box.height - 100 && free.length < 6; y += 10)
      for (let x = 100; x < box.width - 100 && free.length < 6; x += 10) {
        if (free.some((p) => Math.hypot(p.x - x, p.y - y) < 60)) continue
        if (alone({ x, y }, [], 16)) free.push({ x, y })
      }
    return { buildings, point, road, free }
  })) as {
    buildings: { id: string; edge: XY; corner: string; nodes: string[] }[]
    point?: { id: string; at: XY }
    road?: { id: string; mid: XY }
    free: XY[]
  }
  // the first building needs a corner of its own to drag; any other one will do as the second
  const first = found.buildings.find((b) => b.corner)
  const second = found.buildings.find((b) => b !== first)
  if (!first || !second || !found.point || !found.road || found.free.length < 6) {
    report('find two buildings, a point, a road segment and open ground', 'all in view', {
      buildings: found.buildings.length,
      point: !!found.point,
      road: !!found.road,
      free: found.free.length,
    })
    return
  }
  const free = (i: number) => found.free[i]!

  // --- Shift-click selects several, and takes one out again ---
  await click(first.edge)
  await click(second.edge, { shift: true })
  report('Shift-click adds a second feature', [first.id, second.id], (await state()).selection)
  await page.waitForTimeout(300)
  report(
    'the link has both',
    `${first.id},${second.id}`,
    await page.evaluate(() => new URL(location.href).searchParams.get('id')),
  )
  await click(first.edge, { shift: true })
  report('Shift-click on a selected feature takes it out', [second.id], (await state()).selection)

  // --- the nodes of a selected area can be dragged ---
  await click(first.edge)
  const [corner] = await where([first.corner])
  const target = { x: corner!.x + 30, y: corner!.y - 20 }
  await drag(corner!, target)
  const [moved] = await where([first.corner])
  report(
    'dragging a corner of the selected building moves it',
    [true, 'Moved a node'],
    [near(moved!, target), (await state()).undo],
  )
  await key('Meta+z')
  report('undo puts the corner back', true, near((await where([first.corner]))[0]!, corner!))

  // --- a click on a corner selects the node, and its building keeps its shape points ---
  await click(corner!)
  report('a click on a corner selects the node', [first.corner], (await state()).selection)
  await click(free(0))
  report('a click on open ground deselects', [], (await state()).selection)

  // --- a standalone point can be dragged ---
  const pointTarget = { x: found.point.at.x + 25, y: found.point.at.y + 25 }
  await drag(found.point.at, pointTarget)
  report('dragging a point moves it', true, near((await where([found.point.id]))[0]!, pointTarget))
  await key('Meta+z')

  // --- double click: on a way it adds a node, on open ground it zooms ---
  const zoom = (await state()).zoom
  const mapCentre = (await page.evaluate(() =>
    (window as any).__maid.map.getCenter().toArray(),
  )) as number[]
  const roadNodes = () =>
    page.evaluate(
      (id) => (window as any).__maid.engine.data.way(id).nodes.length as number,
      found.road!.id,
    )
  const before = await roadNodes()
  await click(found.road.mid, { count: 2 })
  await page.waitForTimeout(500)
  const afterDouble = await state()
  report(
    'double click on a road adds a node, selects it and does not zoom',
    [before + 1, true, zoom, 'Added a node to a way'],
    [
      await roadNodes(),
      afterDouble.selection[0]?.startsWith('n-') ?? false,
      afterDouble.zoom,
      afterDouble.undo,
    ],
  )
  await key('Meta+z')
  await click(free(0), { count: 2 })
  await page.waitForTimeout(600)
  report('double click on open ground zooms in', zoom + 1, (await state()).zoom)
  // the zoom was around the pointer: put zoom and centre back, the positions above depend on both
  await page.evaluate(
    ({ zoom, mapCentre }) => (window as any).__maid.map.jumpTo({ zoom, center: mapCentre }),
    { zoom, mapCentre },
  )
  await settle()

  // --- drawing an area: the double click closes it and does not zoom ---
  await key('3')
  await click(free(1))
  await click(free(2))
  await click(free(3), { count: 2 })
  await page.waitForTimeout(600)
  const drawn = await state()
  const area = await page.evaluate((id) => {
    const way = (window as any).__maid.engine.data.way(id)
    return way
      ? [way.nodes.length, way.nodes[0] === way.nodes[way.nodes.length - 1], way.tags.area]
      : null
  }, drawn.selection[0] ?? '')
  report('double click closes the area: three nodes, closed', [4, true, 'yes'], area)
  report(
    'double click closes the area: browse mode, one undo step, no zoom',
    ['browse', 'Added an area', zoom],
    [drawn.mode, drawn.undo, drawn.zoom],
  )
  const areaId = drawn.selection[0] ?? ''

  // --- drawing a line: Backspace takes back a node, Escape keeps the way ---
  await key('2')
  await click(free(4))
  await click(free(5))
  await click(free(0))
  await key('Backspace')
  await key('Escape')
  const line = await state()
  const lineNodes = await page.evaluate(
    (id) => (window as any).__maid.engine.data.way(id)?.nodes.length ?? 0,
    line.selection[0] ?? '',
  )
  report(
    'Backspace took one node back and Escape kept the line',
    [2, 'browse', 'Added a line'],
    [lineNodes, line.mode, line.undo],
  )
  await key('Meta+z')

  // --- M moves the selection with the pointer, R rotates it ---
  await key('Escape')
  await page.evaluate((id) => (window as any).__bench.select(id), areaId)
  const ids = (await page.evaluate(
    (id) => [...new Set((window as any).__maid.engine.data.way(id).nodes)],
    areaId,
  )) as string[]
  const start = await where(ids)
  await key('m')
  await page.mouse.move(origin.x + free(1).x, origin.y + free(1).y)
  await page.mouse.move(origin.x + free(1).x + 40, origin.y + free(1).y + 30, { steps: 3 })
  await settle()
  await page.mouse.click(origin.x + free(1).x + 40, origin.y + free(1).y + 30)
  await settle()
  const afterMove = await where(ids)
  report(
    'M: every node moved as far as the pointer',
    [true, 'Moved a feature', 'browse'],
    [
      afterMove.every((p, i) => near(p, { x: start[i]!.x + 40, y: start[i]!.y + 30 })),
      (await state()).undo,
      (await state()).mode,
    ],
  )
  const centre = (points: XY[]) => ({
    x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
    y: points.reduce((sum, p) => sum + p.y, 0) / points.length,
  })
  const radii = (points: XY[]) =>
    points.map((p) => Math.round(Math.hypot(p.x - centre(points).x, p.y - centre(points).y)))
  const c = centre(afterMove)
  await key('r')
  await page.mouse.move(origin.x + c.x + 100, origin.y + c.y)
  await page.mouse.move(origin.x + c.x, origin.y + c.y + 100, { steps: 4 })
  await settle()
  await page.mouse.click(origin.x + c.x, origin.y + c.y + 100)
  await settle()
  const afterRotate = await where(ids)
  report(
    'R: the nodes turned around their middle and kept their distance to it',
    [true, true, 'Rotated a feature'],
    [
      afterRotate.some((p, i) => !near(p, afterMove[i]!, 5)),
      radii(afterRotate).every((r, i) => Math.abs(r - radii(afterMove)[i]!) <= 2),
      (await state()).undo,
    ],
  )
  await key('m')
  await page.mouse.move(origin.x + 300, origin.y + 300)
  await page.mouse.move(origin.x + 360, origin.y + 300, { steps: 2 })
  await key('Escape')
  report(
    'Escape puts a move back',
    true,
    (await where(ids)).every((p, i) => near(p, afterRotate[i]!)),
  )

  // --- Cmd+C, Cmd+V: a copy where the pointer is ---
  await key('Meta+c')
  await page.mouse.move(origin.x + free(4).x, origin.y + free(4).y)
  await key('Meta+v')
  const pasted = await state()
  const copy = await page.evaluate((id) => {
    const { map, engine } = (window as any).__maid
    const way = engine.data.way(id)
    if (!way) return null
    const points = [...new Set<string>(way.nodes)].map((n) => map.project(engine.data.node(n).loc))
    return {
      nodes: way.nodes.length,
      tags: way.tags,
      x: points.reduce((s: number, p: any) => s + p.x, 0) / points.length,
      y: points.reduce((s: number, p: any) => s + p.y, 0) / points.length,
    }
  }, pasted.selection[0] ?? '')
  report(
    'paste: a new way with the same nodes and tags, selected',
    [true, 4, { area: 'yes' }, 'Pasted a feature'],
    [
      pasted.selection[0] !== areaId && (pasted.selection[0] ?? '').startsWith('w-'),
      copy?.nodes,
      copy?.tags,
      pasted.undo,
    ],
  )
  report(
    'paste: its middle is where the pointer is',
    true,
    copy ? near({ x: copy.x, y: copy.y }, free(4), 4) : false,
  )

  // --- right click: the edit menu at the pointer, as in iD ---
  const menu = page.getByRole('menu', { name: 'Edit' })
  const items = async () =>
    (await menu.getByRole('menuitem').allInnerTexts()).map((t) => t.split('\n')[0] ?? '')
  const rightClick = async (p: XY) => {
    await page.mouse.click(origin.x + p.x, origin.y + p.y, { button: 'right' })
    await settle()
  }
  await key('Escape')
  await rightClick(second.edge)
  report('right click on a feature selects it', [second.id], (await state()).selection)
  const offered = await items()
  report(
    'right click: the menu offers move, rotate, copy and delete',
    [true, true, true, true],
    ['Move', 'Rotate', 'Copy', 'Delete'].map((label) => offered.includes(label)),
  )
  await page.keyboard.press('Escape')
  report(
    'Escape closes the menu and keeps the selection',
    [0, [second.id]],
    [await menu.count(), (await state()).selection],
  )
  await rightClick(second.edge)
  await menu.getByRole('menuitem', { name: 'Delete' }).click()
  await settle()
  const deleted = await page.evaluate(
    (id) => (window as any).__maid.engine.data.way(id) === undefined,
    second.id,
  )
  report(
    'right click, Delete: the feature is gone',
    [true, 'Deleted a way'],
    [deleted, (await state()).undo],
  )
  await key('Meta+z')
  // free(0): the other places have the drawn area and its copy on them by now
  await rightClick(free(0))
  report(
    'right click on open ground: only Paste, and nothing selected',
    [['Paste'], []],
    [await items(), (await state()).selection],
  )
  await menu.getByRole('menuitem', { name: 'Paste' }).click()
  await settle()
  report('Paste from the menu adds a copy there', 'Pasted a feature', (await state()).undo)
  await key('2')
  await rightClick(free(5))
  report('no menu while drawing', 0, await menu.count())
  await key('Delete')
})

// --- touch: one finger drags a vertex, on a browser with a touch screen ---
failed += await runCheck(
  process.argv[2] ?? 'small',
  async ({ page, report, settle }) => {
    const vertex = (await page.evaluate(() => {
      const { map, engine } = (window as any).__maid
      const box = map.getCanvas().getBoundingClientRect()
      for (const f of map.queryRenderedFeatures()) {
        const id = String(f.id ?? '')
        if (!id.startsWith('n') || !f.source.includes('vertices')) continue
        const p = map.project(engine.data.node(id).loc)
        if (p.x < 100 || p.y < 100 || p.x > box.width - 100 || p.y > box.height - 100) continue
        // nothing else to pick within reach, so the finger lands on this vertex
        const others = map
          .queryRenderedFeatures([
            [p.x - 10, p.y - 10],
            [p.x + 10, p.y + 10],
          ])
          .filter((h: any) => String(h.id).startsWith('n') && String(h.id) !== id)
        if (others.length === 0) return { id, x: box.left + p.x, y: box.top + p.y }
      }
      return null
    })) as { id: string; x: number; y: number } | null
    if (!vertex) {
      report('find a vertex to drag', 'one in view', null)
      return
    }
    const cdp = await page.context().newCDPSession(page)
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', dx = 0, dy = 0) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: type === 'touchEnd' ? [] : [{ x: vertex.x + dx, y: vertex.y + dy }],
      })
    const read = () =>
      page.evaluate((id) => {
        const { map, engine } = (window as any).__maid
        const box = map.getCanvas().getBoundingClientRect()
        const p = map.project(engine.data.node(id).loc)
        const centre = map.getCenter()
        return {
          x: Math.round(box.left + p.x),
          y: Math.round(box.top + p.y),
          undo: engine.undoState().undoLabel ?? null,
          centre: [centre.lng, centre.lat],
        }
      }, vertex.id)
    const before = await read()
    await touch('touchStart')
    await touch('touchMove', -15, -15)
    await touch('touchMove', -30, -30)
    await touch('touchEnd')
    await settle()
    const after = await read()
    report(
      'touch: one finger drags a vertex and the map stays where it is',
      [true, 'Moved a node', before.centre],
      [
        Math.hypot(after.x - (vertex.x - 30), after.y - (vertex.y - 30)) <= 4,
        after.undo,
        after.centre,
      ],
    )
  },
  '',
  true,
)

process.exit(failed ? 1 : 0)
