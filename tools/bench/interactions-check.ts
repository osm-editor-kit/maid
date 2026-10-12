/**
 * Interaction check for Maid, with real mouse, keyboard and touch events, against what iD does:
 * Shift-click selects several features, the nodes of a selected area and standalone points can be
 * dragged, a double click on a way adds a node and one on open ground zooms, a double click
 * closes a drawn area without zooming, Backspace takes back a drawn node and Escape keeps the
 * way, M moves and R rotates with the pointer, Cmd+C and Cmd+V copy and paste, one finger
 * drags a node, and a selected way shows midpoint handles: a drag of one adds a node, a click adds nothing.
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

  // --- midpoint handles: a selected way shows one in the middle of each segment long enough on screen;
  // a press on one that moves adds a node there, which the drag moves, as one undo step; a click adds nothing
  // (midpoints.ts, engine.pressMidpoint). A double click on a way adds a node, checked here on a building. ---
  const handles = () =>
    page.evaluate(() => {
      const { map, engine } = (window as any).__maid
      return engine.midpointFeatures.map((f: any) => {
        const p = map.project(f.geometry.coordinates)
        return { edge: [...f.properties.edge] as string[], at: { x: p.x, y: p.y } }
      })
    }) as Promise<{ edge: string[]; at: XY }[]>
  const wayNodes = (id: string) =>
    page.evaluate((id) => [...(window as any).__maid.engine.data.way(id).nodes] as string[], id)
  // the segments of the road that are over 40 px on screen with their middle in view, as "a b" node pairs:
  // what the handles should be, in the order of the way
  const roadId = found.road.id
  const wantedHandles = () =>
    page.evaluate((id) => {
      const { map, engine } = (window as any).__maid
      const { clientWidth: w, clientHeight: h } = map.getContainer()
      const nodes = engine.data.way(id).nodes as string[]
      const at = nodes.map((n) => map.project(engine.data.node(n).loc))
      const out: string[] = []
      for (let i = 0; i + 1 < at.length; i++) {
        const a = at[i]
        const b = at[i + 1]
        if (Math.hypot(b.x - a.x, b.y - a.y) <= 40) continue
        const x = (a.x + b.x) / 2
        const y = (a.y + b.y) / 2
        if (x >= 0 && y >= 0 && x <= w && y <= h) out.push(`${nodes[i]} ${nodes[i + 1]}`)
      }
      return out
    }, roadId) as Promise<string[]>
  const handlePairs = async () => (await handles()).map((h) => h.edge.join(' '))

  await click(found.road.mid)
  const wanted = await wantedHandles()
  report(
    'a selected road shows a handle on each segment long enough on screen',
    [true, wanted],
    [wanted.length > 0, await handlePairs()],
  )
  // zoom in: every segment is twice as long on screen, so the set of handles must change (they are
  // computed when the view stops). Zoom and centre go back afterwards.
  const view = (await page.evaluate(() => {
    const { map } = (window as any).__maid
    return { zoom: map.getZoom() as number, centre: map.getCenter().toArray() as number[] }
  })) as { zoom: number; centre: number[] }
  const beforeZoom = await handlePairs()
  await page.evaluate(
    ({ zoom, centre }) => (window as any).__maid.map.jumpTo({ zoom, center: centre }),
    { zoom: view.zoom + 1, centre: view.centre },
  )
  await settle()
  const afterZoom = await handlePairs()
  report(
    'after the map zooms, the handles are those of the new zoom',
    await wantedHandles(),
    afterZoom,
  )
  // the check is only meaningful if the zoom did change the set
  report(
    'the zoom changed which segments have a handle',
    true,
    beforeZoom.join() !== afterZoom.join(),
  )
  await page.evaluate(
    ({ zoom, centre }) => (window as any).__maid.map.jumpTo({ zoom, center: centre }),
    view,
  )
  await settle()
  // a line that is drawn shows no handle: the handles are for browsing
  await key('2')
  const whileDrawing = (await handles()).length
  await key('Escape')
  report('no handle while a line is drawn', [0, 'browse'], [whileDrawing, (await state()).mode])
  await click(free(0))
  report('an unselected road shows no handle', 0, (await handles()).length)

  // a press on a handle that moves: one node joins the road between the segment's nodes, at the drop
  await click(found.road.mid)
  const handle = (await handles())[0]!
  const roadBefore = await wayNodes(found.road.id)
  await drag(handle.at, free(1))
  const roadAfter = await wayNodes(found.road.id)
  const added = roadAfter.filter((n) => !roadBefore.includes(n))
  const addedAt = added.length === 1 ? (await where(added))[0] : undefined
  const at = roadAfter.indexOf(added[0] ?? '')
  const between =
    at > 0 &&
    handle.edge.includes(roadAfter[at - 1] ?? '') &&
    handle.edge.includes(roadAfter[at + 1] ?? '')
  report(
    'dragging a handle adds one node between its segment nodes, at the drop, as one undo step',
    [roadBefore.length + 1, true, true, 'Added a node to a way'],
    [roadAfter.length, between, addedAt ? near(addedAt, free(1), 3) : false, (await state()).undo],
  )
  await key('Meta+z')
  report('one undo takes the added node back', roadBefore, await wayNodes(found.road.id))

  // a click on a handle, without a move, adds nothing and keeps the road selected
  await click(found.road.mid)
  const pressed = (await handles())[0]!
  const undoBefore = (await state()).undo
  const nodesBefore = (await wayNodes(found.road.id)).length
  await click(pressed.at)
  report(
    'a click on a handle adds nothing and keeps the road selected',
    [nodesBefore, undoBefore, [found.road.id]],
    [(await wayNodes(found.road.id)).length, (await state()).undo, (await state()).selection],
  )

  // a double click on the edge of a building adds one node to it and selects it
  const buildingBefore = await wayNodes(first.id)
  await click(first.edge, { count: 2 })
  await page.waitForTimeout(500)
  const afterBuilding = await state()
  const buildingAfter = await wayNodes(first.id)
  report(
    'a double click on a building edge adds one node to the building and selects it',
    [buildingBefore.length + 1, true, 'Added a node to a way'],
    [
      buildingAfter.length,
      buildingAfter.includes(afterBuilding.selection[0] ?? ''),
      afterBuilding.undo,
    ],
  )
  await key('Meta+z')

  // a double click on open ground adds nothing: no undo step, nothing selected, and the map zooms in
  const beforeGround = await state()
  await click(free(2), { count: 2 })
  await page.waitForTimeout(600)
  const afterGround = await state()
  report(
    'a double click on open ground adds nothing and zooms in',
    [beforeGround.undo, [], beforeGround.zoom + 1],
    [afterGround.undo, afterGround.selection, afterGround.zoom],
  )
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
    [true, 'Deleted an area'],
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

  // --- the menu on a point and a vertex (both can be dragged), on a second place, a member of a
  // selection, a Control-click and the menu key; open ground keeps the selection ---
  await key('Escape')
  await rightClick(found.point.at)
  report(
    'right click on a point: the point is selected and its menu opens',
    [[found.point.id], true, 1],
    [(await state()).selection, (await items()).includes('Move'), await menu.count()],
  )
  await key('Escape')
  await click(first.edge)
  const [cornerAt] = await where([first.corner])
  await rightClick(cornerAt!)
  report(
    'right click on a vertex of the selected building: the node is selected and its menu opens',
    [[first.corner], true, 1],
    [(await state()).selection, (await items()).includes('Delete'), await menu.count()],
  )
  await key('Escape')
  await rightClick(found.point.at)
  await rightClick(second.edge)
  const menuAt = await menu.boundingBox()
  report(
    'a second right click elsewhere moves the menu there, one menu only',
    [1, true],
    [await menu.count(), !!menuAt && Math.abs(menuAt.x - abs(second.edge).x) <= 4],
  )
  await key('Escape')
  await click(first.edge)
  await click(second.edge, { shift: true })
  await rightClick(first.edge)
  report(
    'right click on a member of the selection: the selection stays, its menu opens',
    [[first.id, second.id], 1],
    [(await state()).selection, await menu.count()],
  )
  await key('Escape')
  await click(free(0))
  const control = abs(second.edge)
  await page.keyboard.down('Control')
  await page.mouse.click(control.x, control.y)
  await page.keyboard.up('Control')
  await settle()
  report(
    'Control-click (a right click on a Mac) selects the feature and opens its menu',
    [[second.id], 1],
    [(await state()).selection, await menu.count()],
  )
  await key('Escape')
  await click(second.edge)
  await key('ContextMenu')
  report(
    'the menu key opens the menu of the selection',
    [1, true],
    [await menu.count(), (await items()).includes('Move')],
  )
  await key('Escape')
  await click(second.edge)
  await rightClick(free(0))
  report(
    'right click on open ground keeps the selection and offers only Paste',
    [[second.id], ['Paste']],
    [(await state()).selection, await items()],
  )
  await key('Escape')
  await click(free(0))

  // --- a field that has the focus or the pointer on it draws on the selected street: a side line
  // for a directional side (hidden when the way is too curved on screen), a band with its width for
  // a width field (the fork's features 7 and 10; field-overlay.ts) ---
  const setUpStreet = (id: string) =>
    page.evaluate((id) => {
      const { engine } = (window as any).__maid
      const tags = engine.entity(id)?.tags ?? {}
      // only streets show their sidewalk sides: a path would not
      if (tags.highway !== 'residential') engine.setTag(id, 'highway', 'residential')
      if (!tags['sidewalk:both']) engine.setTag(id, 'sidewalk:both', 'separate')
      engine.setTag(id, 'width', '6')
    }, id)
  const overlay = async () => {
    await settle()
    return page.evaluate(() => {
      // what the engine holds for the overlay, not what the map's tiles hold: a tile that is no
      // longer in view keeps its old features, and querySourceFeatures would still return them
      const features = (window as any).__maid.engine.fieldFeatures as any[]
      const of = (state: string) => features.filter((f) => f.properties?.state === state)
      return {
        sides: of('field-side').map((f) => f.properties.side),
        bands: of('field-band').length,
        labels: of('field-label').map((f) => f.properties.label),
      }
    })
  }
  const box = await page.evaluate(() => {
    const rect = (window as any).__maid.map.getCanvas().getBoundingClientRect()
    return { x: rect.left, y: rect.top, w: rect.width, h: rect.height }
  })
  // the pointer goes to open map: a field's hover ends there
  const leaveFields = async () => {
    await page.mouse.move(box.x + box.w - 40, box.y + box.h - 40)
    await settle()
  }

  // a curved street on screen: its side line is hidden
  await setUpStreet(found.road.id)
  await click(found.road.mid)
  await page.locator('[data-focus-key="sidewalk:left"] input').click()
  report(
    'a side line is hidden on a street that is too curved on screen',
    { sides: [], bands: 0, labels: [] },
    await overlay(),
  )
  await leaveFields()

  // a straight street in view: found by its corners on screen (under 12 degrees each), at least 120 px long
  const straight = (await page.evaluate(() => {
    const { map, engine } = (window as any).__maid
    const box = map.getCanvas().getBoundingClientRect()
    const inView = (p: { x: number; y: number }) =>
      p.x > 60 && p.y > 60 && p.x < box.width - 60 && p.y < box.height - 60
    for (const f of map.queryRenderedFeatures()) {
      const id = String(f.id ?? '')
      const way = id.startsWith('w') && engine.data.way(id)
      if (!way || !way.tags.highway || engine.data.wayMultipolygons.has(id)) continue
      const pts = way.nodes.map((n: string) => map.project(engine.data.node(n).loc))
      if (pts.length < 2 || !pts.every(inView)) continue
      let straightWay = true
      let length = 0
      for (let i = 0; i + 1 < pts.length; i++)
        length += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y)
      for (let i = 1; i + 1 < pts.length; i++) {
        const a1 = Math.atan2(pts[i].y - pts[i - 1].y, pts[i].x - pts[i - 1].x)
        const a2 = Math.atan2(pts[i + 1].y - pts[i].y, pts[i + 1].x - pts[i].x)
        if (Math.abs(Math.atan2(Math.sin(a2 - a1), Math.cos(a2 - a1))) > 0.21) straightWay = false
      }
      // the middle of the longest segment, away from its nodes, so that a click picks the way
      let best: { x: number; y: number; len: number } | null = null
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i]
        const b = pts[i + 1]
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
        const len = Math.hypot(b.x - a.x, b.y - a.y)
        const nearNode = pts.some(
          (p: { x: number; y: number }) => Math.hypot(p.x - mid.x, p.y - mid.y) < 15,
        )
        if (!nearNode && (!best || len > best.len)) best = { ...mid, len }
      }
      if (straightWay && length >= 120 && best) return { id, x: best.x, y: best.y }
    }
    return null
  })) as (XY & { id: string }) | null
  if (!straight) {
    report('find a straight street in view', 'found', null)
    return
  }
  await setUpStreet(straight.id)
  await click(straight)

  await page.locator('[data-focus-key="sidewalk:left"] input').click()
  report(
    'focusing the left side of a directional field draws a left side line',
    { sides: ['left'], bands: 0, labels: [] },
    await overlay(),
  )
  await page.locator('[data-focus-key="sidewalk:right"] input').click()
  report(
    'focusing the right side moves the line to the right side',
    { sides: ['right'], bands: 0, labels: [] },
    await overlay(),
  )
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await leaveFields()
  report(
    'blurring the field and leaving it takes the line away',
    { sides: [], bands: 0, labels: [] },
    await overlay(),
  )

  await page.locator('[data-focus-key="width"] input').click()
  report(
    'focusing a width field draws its band with the width',
    { sides: [], bands: 1, labels: ['6 m'] },
    await overlay(),
  )
  await page.keyboard.press('Backspace')
  await page.keyboard.type('3.5')
  report(
    'typing another width moves the band and its label while typing',
    { sides: [], bands: 1, labels: ['3.5 m'] },
    await overlay(),
  )
  await page.keyboard.press('Enter')
  await leaveFields()
  report(
    'leaving the width field takes the band away',
    { sides: [], bands: 0, labels: [] },
    await overlay(),
  )
})

// --- snapping: a drop on a node or a way joins it, as iD does, and add point snaps too ---
failed += await runCheck(
  process.argv[2] ?? 'small',
  async ({ page, report, settle }) => {
    const origin = (await page.evaluate(() => {
      const box = (window as any).__maid.map.getCanvas().getBoundingClientRect()
      return { x: box.left, y: box.top }
    })) as XY
    const abs = (p: XY) => ({ x: origin.x + p.x, y: origin.y + p.y })
    const click = async (p: XY) => {
      const at = abs(p)
      await page.mouse.move(at.x, at.y)
      await page.mouse.click(at.x, at.y)
      await settle()
    }
    const shiftClick = async (p: XY) => {
      const at = abs(p)
      await page.mouse.move(at.x, at.y)
      await page.keyboard.down('Shift')
      await page.mouse.click(at.x, at.y)
      await page.keyboard.up('Shift')
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
      await page.keyboard.press(name)
      await settle()
    }
    const state = () =>
      page.evaluate(() => {
        const { engine } = (window as any).__maid
        return {
          selection: [...engine.selection] as string[],
          mode: engine.mode as string,
          undo: (engine.undoState().undoLabel ?? null) as string | null,
        }
      })
    /** Screen positions of nodes; a node that is gone has none */
    const where = (ids: string[]) =>
      page.evaluate((ids) => {
        const { map, engine } = (window as any).__maid
        return ids.map((id) => {
          const loc = engine.data.node(id)?.loc
          if (!loc) return null
          const p = map.project(loc)
          return { x: p.x, y: p.y }
        })
      }, ids) as Promise<(XY | null)[]>
    /** The nodes a way has now, and whether a node exists */
    const graph = (ids: string[], ways: string[]) =>
      page.evaluate(
        ({ ids, ways }) => {
          const { engine } = (window as any).__maid
          return {
            nodes: ids.map((id) => !!engine.data.node(id)),
            ways: ways.map((id) => (engine.data.way(id)?.nodes ?? []) as string[]),
            tags: ids.map((id) => engine.data.node(id)?.tags ?? null),
          }
        },
        { ids, ways },
      ) as Promise<{ nodes: boolean[]; ways: string[][]; tags: (Record<string, string> | null)[] }>
    const near = (a: XY | null | undefined, b: XY | null | undefined, px = 4) =>
      !!a && !!b && Math.hypot(a.x - b.x, a.y - b.y) <= px

    // what the checks work on: two buildings with a corner each, a road, a standalone point
    const scene = (await page.evaluate(() => {
      const { map, engine } = (window as any).__maid
      const box = map.getCanvas().getBoundingClientRect()
      type P = { x: number; y: number }
      const inView = (p: P) => p.x > 80 && p.y > 80 && p.x < box.width - 80 && p.y < box.height - 80
      const at = (n: string): P => map.project(engine.data.node(n).loc)
      const alone = (p: P, ownIds: string[], r = 12) =>
        map
          .queryRenderedFeatures([
            [p.x - r, p.y - r],
            [p.x + r, p.y + r],
          ])
          .every((f: any) => f.layer.type === 'fill' || ownIds.includes(String(f.id)))
      const buildings: { id: string; nodes: string[]; corner: string; edge: P }[] = []
      let road: { id: string; mid: P } | undefined
      let point: { id: string; at: P } | undefined
      for (const f of map.queryRenderedFeatures()) {
        const id = String(f.id ?? '')
        if (id.startsWith('n') && !point && f.source.includes('points') && engine.data.node(id)) {
          const p = at(id)
          if (inView(p) && alone(p, [id], 16)) point = { id, at: p }
        }
        const way = id.startsWith('w') && engine.data.way(id)
        if (!way || engine.data.wayMultipolygons.has(id)) continue
        if (way.tags.building && buildings.length < 2 && !buildings.some((b) => b.id === id)) {
          const corner = way.nodes.find(
            (n: string) =>
              (engine.data.nodeUses.get(n) ?? 0) === 1 && inView(at(n)) && alone(at(n), [id, n]),
          )
          const a = at(way.nodes[0])
          const b = at(way.nodes[1])
          const edge = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
          if (corner && inView(edge)) buildings.push({ id, nodes: way.nodes, corner, edge })
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
      return { buildings, road, point }
    })) as {
      buildings: { id: string; nodes: string[]; corner: string; edge: XY }[]
      road?: { id: string; mid: XY }
      point?: { id: string; at: XY }
    }
    const [first, second] = scene.buildings
    if (!first || !second || !scene.road || !scene.point) {
      report('find two buildings with a corner, a road and a point', 'all in view', {
        buildings: scene.buildings.length,
        road: !!scene.road,
        point: !!scene.point,
      })
      return
    }
    const road = scene.road
    const point = scene.point
    const [cornerA, cornerB] = [first.corner, second.corner]
    const older = (a: string, b: string) => (Number(a.slice(1)) < Number(b.slice(1)) ? a : b)

    const undoOf = async () => (await state()).undo
    /** Both buildings selected: their corners are shape points, so they can be dropped on */
    const selectBoth = async () => {
      await click(first.edge)
      await shiftClick(second.edge)
    }
    const [a0, b0] = (await where([cornerA, cornerB])) as XY[]
    await selectBoth()

    // --- a vertex dropped on a vertex of another way: one node is left, the older, one undo step ---
    const start = await undoOf()
    await drag(a0!, b0!)
    const survivor = older(cornerA, cornerB)
    const sIdx = survivor === cornerA ? 0 : 1
    const joined = await graph([cornerA, cornerB], [first.id, second.id])
    report(
      'a vertex dropped on a vertex: the older node is the one left, both ways use it',
      [true, false, true, true],
      [
        joined.nodes[sIdx],
        joined.nodes[1 - sIdx],
        joined.ways[0]!.includes(survivor),
        joined.ways[1]!.includes(survivor),
      ],
    )
    report('the undo label names the connect', 'Connected a way to a node', await undoOf())
    await key('Meta+z')
    const back = await graph([cornerA, cornerB], [])
    report('one undo puts both nodes back', [true, true, start], [...back.nodes, await undoOf()])

    // --- the same drop with Alt held: nothing is connected ---
    await selectBoth()
    await page.keyboard.down('Alt')
    await drag(a0!, b0!)
    await page.keyboard.up('Alt')
    const alt = await graph([cornerA, cornerB], [])
    report(
      'Alt held: the drop connects nothing',
      [true, true, 'Moved a node'],
      [...alt.nodes, await undoOf()],
    )
    await key('Meta+z')

    // --- a corner dropped on the line of a road: the node joins the road, no node is made ---
    const roadNodesBefore = (await graph([], [road.id])).ways[0]!.length
    await click(first.edge)
    await drag(a0!, road.mid)
    const onRoad = await graph([cornerA], [road.id, first.id])
    report(
      'a corner dropped on a road: the road and the building share the node, no node is made',
      [true, true, roadNodesBefore + 1, 'Connected a way to a way'],
      [
        onRoad.ways[1]!.includes(cornerA),
        onRoad.ways[0]!.includes(cornerA),
        onRoad.ways[0]!.length,
        await undoOf(),
      ],
    )
    await key('Meta+z')

    // --- a standalone point dropped on a road: it becomes a node of the road, keeps its id and tags ---
    const pointBefore = await graph([point.id], [])
    await drag(point.at, road.mid)
    const pointOnRoad = await graph([point.id], [road.id])
    report(
      'a point dropped on a road: a node of the road, same id and tags',
      [true, JSON.stringify(pointBefore.tags[0]), 'Connected a point to a way'],
      [
        pointOnRoad.ways[0]!.includes(point.id),
        JSON.stringify(pointOnRoad.tags[0]),
        await undoOf(),
      ],
    )
    await key('Meta+z')

    // --- a corner dropped on its own neighbour in the same way: refused, the node goes back ---
    await click(first.edge)
    const i = first.nodes.indexOf(cornerA)
    const neighbour = first.nodes[i + 1] ?? first.nodes[i - 1]!
    const [nb] = (await where([neighbour])) as XY[]
    const before = await undoOf()
    await drag(a0!, nb!)
    const refused = (await where([cornerA]))[0]
    report(
      'a drop on the neighbour in the same way is refused: the node is back where it started',
      [before, true],
      [await undoOf(), near(refused, a0)],
    )

    // --- add point on a vertex: no second node, the vertex is selected ---
    const undoBeforeAdd = await undoOf()
    await key('1')
    await click(a0!)
    report(
      'add point on a vertex: no new node, the vertex is selected',
      [[cornerA], 'browse', undoBeforeAdd],
      [(await state()).selection, (await state()).mode, await undoOf()],
    )

    // --- add point on a line: one new node, a vertex of that road, selected ---
    const roadBeforeAdd = (await graph([], [road.id])).ways[0]!.length
    await key('1')
    await click(road.mid)
    const added = (await state()).selection
    const roadAfterAdd = (await graph([], [road.id])).ways[0]!
    report(
      'add point on a line: one new node in the road, selected',
      [roadBeforeAdd + 1, true, 'Added a node to a way'],
      [roadAfterAdd.length, added.length === 1 && roadAfterAdd.includes(added[0]!), await undoOf()],
    )
  },
  '',
)

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
        if (others.length === 0) {
          // the drop must not land on a node or a way of another feature, or it would snap (a connect)
          const own = new Set<string>([id, ...((engine.data.nodeWays.get(id) ?? []) as string[])])
          for (const [dx, dy] of [
            [-30, -30],
            [30, -30],
            [-30, 30],
            [30, 30],
            [-60, 0],
            [60, 0],
            [0, -60],
            [0, 60],
          ]) {
            const hits = map
              .queryRenderedFeatures([
                [p.x + dx - 12, p.y + dy - 12],
                [p.x + dx + 12, p.y + dy + 12],
              ])
              .filter((h: any) => h.layer.type !== 'fill' && !own.has(String(h.id)))
            if (hits.length === 0) return { id, x: box.left + p.x, y: box.top + p.y, dx, dy }
          }
        }
      }
      return null
    })) as { id: string; x: number; y: number; dx: number; dy: number } | null
    if (!vertex) {
      report('find a vertex to drag, with a clear place to drop it', 'one in view', null)
      return
    }
    const { dx, dy } = vertex
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
    await touch('touchMove', dx / 2, dy / 2)
    await touch('touchMove', dx, dy)
    await touch('touchEnd')
    await settle()
    const after = await read()
    report(
      'touch: one finger drags a vertex and the map stays where it is',
      [true, 'Moved a node', before.centre],
      [
        Math.hypot(after.x - (vertex.x + dx), after.y - (vertex.y + dy)) <= 4,
        after.undo,
        after.centre,
      ],
    )
  },
  '',
  true,
)

// --- a building that a filter protects: its menu opens with the commands greyed out and the reason ---
failed += await runCheck(
  process.argv[2] ?? 'small',
  async ({ page, report, settle }) => {
    const edge = (await page.evaluate(() => {
      const { map, engine } = (window as any).__maid
      const box = map.getCanvas().getBoundingClientRect()
      for (const f of map.queryRenderedFeatures()) {
        const id = String(f.id ?? '')
        const way = id.startsWith('w') ? engine.data.way(id) : undefined
        if (!way?.tags.building || way.nodes.length < 4 || !engine.isReadOnly(id)) continue
        const a = map.project(engine.data.node(way.nodes[0]).loc)
        const b = map.project(engine.data.node(way.nodes[1]).loc)
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
        if (mid.x > 120 && mid.y > 120 && mid.x < box.width - 120 && mid.y < box.height - 120)
          return { id, x: box.left + mid.x, y: box.top + mid.y }
      }
      return null
    })) as { id: string; x: number; y: number } | null
    if (!edge) {
      report('find a building that the filter protects', 'one in view', null)
      return
    }
    await page.mouse.click(edge.x, edge.y, { button: 'right' })
    await settle()
    const menu = page.getByRole('menu', { name: 'Edit' })
    const first = menu.getByRole('menuitem').first()
    report(
      'right click on a protected building: the menu opens, commands greyed out with the reason',
      [1, true, 'A filter protects this feature', [edge.id]],
      [
        await menu.count(),
        await first.isDisabled(),
        await first.getAttribute('title'),
        await page.evaluate(() => [...(window as any).__maid.engine.selection]),
      ],
    )
  },
  'filters=buildings:readonly',
  false,
)

// --- several features at one place: a click selects the first, the pill counts them, , and . and the
// list reach the others, a click elsewhere drops them, and a right click lists them in the menu ---
failed += await runCheck(
  process.argv[2] ?? 'small',
  async ({ page, report, settle }) => {
    const origin = (await page.evaluate(() => {
      const box = (window as any).__maid.map.getCanvas().getBoundingClientRect()
      return { x: box.left, y: box.top }
    })) as XY
    const abs = (p: XY) => ({ x: origin.x + p.x, y: origin.y + p.y })
    const click = async (p: XY, button: 'left' | 'right' = 'left') => {
      const at = abs(p)
      await page.mouse.move(at.x, at.y)
      await page.mouse.click(at.x, at.y, { button })
      await settle()
    }
    const key = async (name: string) => {
      await page.evaluate(() => {
        if (document.activeElement instanceof HTMLInputElement) document.activeElement.blur()
      })
      await page.keyboard.press(name)
      await settle()
    }
    const selection = () =>
      page.evaluate(() => [...(window as any).__maid.engine.selection] as string[])
    const pill = () => page.getByRole('button', { name: /\d+ of \d+/ })
    const pillText = async () =>
      (await pill().count()) === 0
        ? null
        : ((await pill().first().textContent()) ?? '').replace(/\s+/g, ' ').trim()

    // a place where the features of a click are two or more, and open ground that has none
    const found = (await page.evaluate(() => {
      const { map, engine } = (window as any).__maid
      const box = map.getCanvas().getBoundingClientRect()
      const layers = map
        .getStyle()
        .layers.map((l: any) => l.id as string)
        .filter((id: string) =>
          /^(highlight-vertex|vertex|point-pin|point-dot|point-address|line-(casing|stroke)(-dashed)?--?\d|area-stroke|area-fill)/.test(
            id,
          ),
        )
      let place: { x: number; y: number; ids: string[] } | null = null
      let free: { x: number; y: number } | null = null
      for (let y = 100; y < box.height - 100; y += 6)
        for (let x = 100; x < box.width - 100; x += 6) {
          const ids: string[] = engine.pickAll({ x, y }, layers)
          if (!place && ids.length >= 2) place = { x, y, ids }
          if (!free && ids.length === 0) free = { x, y }
          if (place && free) return { place, free }
        }
      return { place, free }
    })) as {
      place: { x: number; y: number; ids: string[] } | null
      free: XY | null
    }
    if (!found.place || !found.free) {
      report('find a place with two features and open ground', 'in view', found)
      return
    }
    const { place, free } = { place: found.place, free: found.free }
    const ids = place.ids
    const n = ids.length
    const target = Math.min(2, n - 1)

    await click(place)
    report('a click selects the first feature of the place', [ids[0]], await selection())
    report('the pill says 1 of N', `1 of ${n}`, await pillText())

    await key('.')
    report('the next key selects the second feature', [ids[1]], await selection())
    report('the pill says 2 of N', `2 of ${n}`, await pillText())

    await key(',')
    await key(',')
    report('the previous key wraps round to the last feature', [ids[n - 1]], await selection())
    report('the pill says N of N', `${n} of ${n}`, await pillText())

    // the list at the pill: a row chooses, the list stays open and the pill counts on
    await pill().first().click()
    await settle()
    const list = page.getByRole('menu', { name: 'Features here' })
    report('the pill opens the list of the features', 1, await list.count())
    await list.getByRole('menuitem').nth(target).click()
    await settle()
    report('a row of the list selects its feature', [ids[target]], await selection())
    report(
      'the list stays open and the pill follows',
      [1, `${target + 1} of ${n}`],
      [await list.count(), await pillText()],
    )
    await page.keyboard.press('Escape')
    await settle()
    report(
      'Escape closes the list and keeps the selection',
      [0, [ids[target]]],
      [await list.count(), await selection()],
    )

    // a click on open ground drops the stack
    await click(free)
    report(
      'a click elsewhere drops the stack: no pill, nothing selected',
      [null, []],
      [await pillText(), await selection()],
    )

    // a right click lists the features in the menu, as a first group
    await click(place, 'right')
    const menu = page.getByRole('menu', { name: 'Edit' })
    report(
      'a right click lists the features of the place under a heading',
      [1, 1],
      [await menu.count(), await menu.getByText(`Here: ${n} features`, { exact: true }).count()],
    )
    report(
      'the first feature of the place is the one selected and marked',
      'true',
      await menu.getByRole('menuitem').first().getAttribute('aria-current'),
    )
    await menu.getByRole('menuitem').nth(1).click()
    await settle()
    report(
      'choosing a feature in the menu selects it and keeps the menu open',
      [[ids[1]], 1],
      [await selection(), await menu.count()],
    )
    await page.keyboard.press('Escape')
    await settle()
  },
  '',
  false,
)

process.exit(failed ? 1 : 0)
