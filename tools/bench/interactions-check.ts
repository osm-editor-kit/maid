import { checkHelpers, pickBuildingAndRoad, type XY } from './check-helpers'
/**
 * Interaction check for Maid, with real mouse, keyboard and touch events, against what iD does:
 * Shift-click selects several features, the nodes of a selected area and standalone points can be
 * dragged, a double click on a way adds a node and one on open ground zooms, a double click
 * closes a drawn area without zooming, Backspace takes back a drawn node and Escape keeps the
 * way, M moves and R rotates with the pointer (M keeps the shape of the ways that share a node with
 * the moved way, as iD does), Cmd+C and Cmd+V copy and paste, one finger
 * drags a node, and a selected way shows midpoint handles: a drag of one adds a node, a click adds nothing.
 *
 *   bun tools/bench/interactions-check.ts [scene]
 */
import { runCheck } from './check-page'

let failed = await runCheck(process.argv[2] ?? 'small', async ({ page, report, settle }) => {
  const { origin, abs, click, drag, key, state, where, near } = await checkHelpers(page, settle)

  // what the checks work on: two buildings with a free corner each, a point, a road segment, open ground
  const found = (await page.evaluate(() => {
    const { map, engine } = window.__maid
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
      const at = (n: string) => map.project(engine.data.node(n)!.loc!)
      if (way.tags.building && !buildings.some((b) => b.id === id)) {
        // a corner that only this building uses, and the middle of an edge to click the outline
        const nodes = [...new Set<string>(way.nodes)]
        const corner = nodes.find(
          (n) => (engine.data.nodeUses.get(n) ?? 0) === 1 && inView(at(n)) && alone(at(n), [id, n]),
        )
        const a = at(way.nodes[0]!)
        const b = at(way.nodes[1]!)
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
          const a = at(way.nodes[i]!)
          const b = at(way.nodes[i + 1]!)
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
  // Shift on open ground keeps the selection, as iD does; a plain click on open ground still clears it
  await click(first.edge, { shift: true })
  await click(free(0), { shift: true })
  report(
    'Shift-click on open ground keeps both selected',
    [second.id, first.id],
    (await state()).selection,
  )
  await click(free(0))
  report('a plain click on open ground clears the selection', [], (await state()).selection)

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
  const mapCentre = await page.evaluate<[number, number]>(() => {
    const c = window.__maid.map.getCenter()
    return [c.lng, c.lat]
  })
  const roadNodes = () =>
    page.evaluate((id) => window.__maid.engine.data.way(id)!.nodes.length, found.road!.id)
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
    ({ zoom, mapCentre }) => window.__maid.map.jumpTo({ zoom, center: mapCentre }),
    { zoom, mapCentre },
  )
  await settle()

  // --- midpoint handles: a selected way shows one in the middle of each segment long enough on screen;
  // a press on one that moves adds a node there, which the drag moves, as one undo step; a click adds nothing
  // (midpoints.ts, engine.pressMidpoint). A double click on a way adds a node, checked here on a building. ---
  const handles = () =>
    page.evaluate(() => {
      const { map, engine } = window.__maid
      return engine.midpointFeatures.map((f: any) => {
        const p = map.project(f.geometry.coordinates)
        return { edge: [...f.properties.edge] as string[], at: { x: p.x, y: p.y } }
      })
    }) as Promise<{ edge: string[]; at: XY }[]>
  const wayNodes = (id: string) =>
    page.evaluate((id) => [...window.__maid.engine.data.way(id)!.nodes] as string[], id)
  // the segments of the road that are over 40 px on screen with their middle in view, as "a b" node pairs:
  // what the handles should be, in the order of the way
  const roadId = found.road.id
  const wantedHandles = () =>
    page.evaluate((id) => {
      const { map, engine } = window.__maid
      const { clientWidth: w, clientHeight: h } = map.getContainer()
      const nodes = engine.data.way(id)!.nodes
      const at = nodes.map((n) => map.project(engine.data.node(n)!.loc!))
      const out: string[] = []
      for (let i = 0; i + 1 < at.length; i++) {
        const a = at[i]
        const b = at[i + 1]
        if (!a || !b) continue
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
  const view = await page.evaluate<{ zoom: number; centre: [number, number] }>(() => {
    const { map } = window.__maid
    const c = map.getCenter()
    return { zoom: map.getZoom(), centre: [c.lng, c.lat] }
  })
  const beforeZoom = await handlePairs()
  await page.evaluate(({ zoom, centre }) => window.__maid.map.jumpTo({ zoom, center: centre }), {
    zoom: view.zoom + 1,
    centre: view.centre,
  })
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
    ({ zoom, centre }) => window.__maid.map.jumpTo({ zoom, center: centre }),
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
    ({ zoom, mapCentre }) => window.__maid.map.jumpTo({ zoom, center: mapCentre }),
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
    const way = window.__maid.engine.data.way(id)
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
    (id) => window.__maid.engine.data.way(id)?.nodes.length ?? 0,
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
  await page.evaluate((id) => window.__bench.select(id), areaId)
  const ids = (await page.evaluate(
    (id) => [...new Set(window.__maid.engine.data.way(id)!.nodes)],
    areaId,
  )) as string[]
  const start = await where(ids)
  await key('m')
  await page.mouse.move(origin.x + free(1).x, origin.y + free(1).y)
  await page.mouse.move(origin.x + free(1).x + 40, origin.y + free(1).y + 30, { steps: 3 })
  await settle()
  await page.mouse.click(origin.x + free(1).x + 40, origin.y + free(1).y + 30)
  await settle()
  const afterMove = (await where(ids)) as XY[]
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
  const afterRotate = (await where(ids)) as XY[]
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

  // --- M on a way that shares a node with an unselected way: that way keeps its shape (iD's move) ---
  // Three ways are built in the middle of the view: `wayW` (selected) crosses `wayU` at `junction`,
  // which is bent there; `wayV` shares nothing.
  const built = (await page.evaluate(() => {
    const { map, editor, model } = window.__maid
    const { history, context } = editor
    const box = map.getCanvas().getBoundingClientRect()
    const node = (dx: number, dy: number) => {
      const p = map.unproject([box.width / 2 + dx, box.height / 2 + dy])
      return new model.OsmNode(context, { loc: [p.lng, p.lat] })
    }
    const junction = node(0, 0)
    const w0 = node(-90, 0)
    const w2 = node(90, 0)
    const u0 = node(0, -90)
    const u2 = node(70, 70)
    const v0 = node(260, -190)
    const v1 = node(320, -190)
    const v2 = node(320, -130)
    const way = (nodes: string[]) =>
      new model.OsmWay(context, { nodes, tags: { highway: 'service' } })
    const wayW = way([w0.id, junction.id, w2.id])
    const wayU = way([u0.id, junction.id, u2.id])
    const wayV = way([v0.id, v1.id, v2.id])
    history.perform(
      ...[junction, w0, w2, u0, u2, v0, v1, v2].map((n) => model.actionAddEntity(n)),
      model.actionAddEntity(wayW),
      model.actionAddEntity(wayU),
      model.actionAddEntity(wayV),
    )
    history.commit({ annotation: 'Added the ways for the move check', selectedIDs: [] })
    return {
      junction: junction.id as string,
      w: [w0.id, junction.id, w2.id] as string[],
      u: [u0.id, junction.id, u2.id] as string[],
      v: [v0.id, v1.id, v2.id] as string[],
      wayW: wayW.id as string,
      wayU: wayU.id as string,
      wayV: wayV.id as string,
    }
  })) as {
    junction: string
    w: string[]
    u: string[]
    v: string[]
    wayW: string
    wayU: string
    wayV: string
  }
  await settle()
  const nodesOf = (way: string) =>
    page.evaluate((id) => [...window.__maid.engine.data.way(id)!.nodes] as string[], way)
  const createdNodes = () =>
    page.evaluate(
      () =>
        window.__maid.engine.data.history
          .changes()
          .created.filter((e: { type: string }) => e.type === 'node').length as number,
    )
  /** Moves the way by 40 px right and 30 px down: the pointer goes to a free spot and then clicks */
  const moveWay = async (way: string) => {
    await page.evaluate((id) => window.__bench.select(id), way)
    await key('m')
    await page.mouse.move(origin.x + 300, origin.y + 800)
    await page.mouse.move(origin.x + 340, origin.y + 830, { steps: 3 })
    await settle()
    await page.mouse.click(origin.x + 340, origin.y + 830)
    await settle()
  }
  const movedBy = (now: XY, was: XY) => near(now, { x: was.x + 40, y: was.y + 30 })
  const sameAs = (now: (XY | null)[], was: (XY | null)[]) =>
    now.every((p, i) => near(p, was[i]!, 3))

  const pre = { w: await where(built.w), u: await where(built.u), v: await where(built.v) }
  const createdBefore = await createdNodes()
  await moveWay(built.wayW)
  const post = { w: await where(built.w), u: await where(built.u), v: await where(built.v) }
  const uNodes = await nodesOf(built.wayU)
  const replacement = uNodes.filter((n) => !built.u.includes(n))
  const replacementAt = replacement.length === 1 ? await where(replacement) : []
  report(
    'M: the selected way keeps its three nodes and its ends moved as far as the pointer',
    [built.w, true, true],
    [await nodesOf(built.wayW), movedBy(post.w[0]!, pre.w[0]!), movedBy(post.w[2]!, pre.w[2]!)],
  )
  report(
    'M: the unselected way keeps its ends and gets one vertex where the shared node was',
    [true, true, 4, true],
    [
      sameAs([post.u[0]!, post.u[2]!], [pre.u[0]!, pre.u[2]!]),
      uNodes.includes(built.junction) && uNodes.length === 4 && replacement.length === 1,
      uNodes.length,
      replacementAt.length === 1 && near(replacementAt[0]!, pre.u[1]!, 3),
    ],
  )
  // the junction is moved onto both ways, as iD's move snaps it between them (within a pixel or two)
  const distanceToSegment = (p: XY, a: XY, b: XY) => {
    const dx = b.x - a.x
    const dy = b.y - a.y
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)))
    return Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y)
  }
  const junctionAt = post.w[1]!
  const onWay = distanceToSegment(junctionAt, post.w[0]!, post.w[2]!)
  const onUnselected = replacementAt[0]
    ? Math.min(
        distanceToSegment(junctionAt, post.u[0]!, replacementAt[0]),
        distanceToSegment(junctionAt, replacementAt[0], post.u[2]!),
      )
    : Infinity
  report(
    'M: the shared junction lies on both ways after the move',
    [true, true],
    [onWay <= 3, onUnselected <= 3],
  )
  report('M: one undo step, labelled as a move', 'Moved a feature', (await state()).undo)
  await key('Meta+z')
  const restored = { w: await where(built.w), u: await where(built.u), v: await where(built.v) }
  report(
    'undo: every node of the three ways is where it was, the unselected way has its three nodes again',
    [true, 3, createdBefore],
    [
      sameAs(restored.w, pre.w) && sameAs(restored.u, pre.u) && sameAs(restored.v, pre.v),
      (await nodesOf(built.wayU)).length,
      await createdNodes(),
    ],
  )
  // a way that shares nothing: its nodes move and no node is made
  await moveWay(built.wayV)
  const movedV = await where(built.v)
  report(
    'M on a way that shares nothing: its nodes move and the move creates no node',
    [true, createdBefore],
    [built.v.every((_, i) => movedBy(movedV[i]!, pre.v[i]!)), await createdNodes()],
  )
  await key('Meta+z')
  // the copy below takes the area that was selected before these checks
  await page.evaluate((id) => window.__bench.select(id), areaId)
  await settle()

  // --- Cmd+C, Cmd+V: a copy where the pointer is ---
  await key('Meta+c')
  await page.mouse.move(origin.x + free(4).x, origin.y + free(4).y)
  await key('Meta+v')
  const pasted = await state()
  const copy = await page.evaluate((id) => {
    const { map, engine } = window.__maid
    const way = engine.data.way(id)
    if (!way) return null
    const points = [...new Set<string>(way.nodes)].map((n) =>
      map.project(engine.data.node(n)!.loc!),
    )
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
    (id) => window.__maid.engine.data.way(id) === undefined,
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
  // the copy lies partly outside the view, so Delete would refuse it ("too large"): undo takes it away
  await key('Escape')
  await key('Meta+z')

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
      const { engine } = window.__maid
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
      const features: GeoJSON.Feature[] = Reflect.get(window.__maid.engine, 'fieldFeatures')
      const of = (state: string) => features.filter((f) => f.properties?.state === state)
      return {
        sides: of('field-side').map((f) => f.properties!.side),
        bands: of('field-band').length,
        labels: of('field-label').map((f) => f.properties!.label),
      }
    })
  }
  const box = await page.evaluate(() => {
    const rect = window.__maid.map.getCanvas().getBoundingClientRect()
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
    const { map, engine } = window.__maid
    const box = map.getCanvas().getBoundingClientRect()
    const inView = (p: { x: number; y: number }) =>
      p.x > 60 && p.y > 60 && p.x < box.width - 60 && p.y < box.height - 60
    for (const f of map.queryRenderedFeatures()) {
      const id = String(f.id ?? '')
      const way = id.startsWith('w') && engine.data.way(id)
      if (!way || !way.tags.highway || engine.data.wayMultipolygons.has(id)) continue
      const pts = way.nodes.map((n: string) => map.project(engine.data.node(n)!.loc!))
      if (pts.length < 2 || !pts.every(inView)) continue
      let straightWay = true
      let length = 0
      for (let i = 0; i + 1 < pts.length; i++)
        length += Math.hypot(pts[i + 1]!.x - pts[i]!.x, pts[i + 1]!.y - pts[i]!.y)
      for (let i = 1; i + 1 < pts.length; i++) {
        const a1 = Math.atan2(pts[i]!.y - pts[i - 1]!.y, pts[i]!.x - pts[i - 1]!.x)
        const a2 = Math.atan2(pts[i + 1]!.y - pts[i]!.y, pts[i + 1]!.x - pts[i]!.x)
        if (Math.abs(Math.atan2(Math.sin(a2 - a1), Math.cos(a2 - a1))) > 0.21) straightWay = false
      }
      // the middle of the longest segment, away from its nodes, so that a click picks the way
      let best: { x: number; y: number; len: number } | null = null
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i]!
        const b = pts[i + 1]!
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

  // --- favourites by number: hold Alt, type the digits, let Alt go starts the favourite of that
  // number (packages/shell/src/components/favourites-keys.ts, components/FavouriteHint.tsx). Under automation the
  // settings are not stored, so the favourites are made in the picker: the building (an area) gets
  // number 3 and the bench (a point) gets 39 ---
  const holdAlt = async (digits: string[]) => {
    await page.keyboard.down('Alt')
    for (const digit of digits) await page.keyboard.press(`Digit${digit}`)
  }
  const hint = () =>
    page.evaluate(() => document.querySelector('[role="status"]')?.textContent ?? '')
  const changeType = page.getByTitle('Change the feature type')
  const numberOf = (name: string) =>
    page.getByRole('textbox', { name: `Number of ${name}`, exact: true })
  // the picker's search field; the page has other comboboxes (the title, the Add field search)
  const search = () => page.getByRole('combobox', { name: 'Search feature types', exact: true })

  // the building: the scene's building is an Industrial Building, and without a search the picker
  // lists only the first 50 presets by name, so "Building" is found by typing it. Its picker lists
  // the area favourites, and the field gives the number
  await click(first.edge)
  await changeType.click()
  await settle()
  await search().fill('Building')
  await settle()
  await page.getByRole('button', { name: 'Add Building to favourites', exact: true }).click()
  await settle()
  await numberOf('Building').fill('3')
  await numberOf('Building').press('Enter')
  await settle()
  report(
    'the building favourite gets number 3 in the list',
    '3',
    await numberOf('Building').inputValue(),
  )
  await key('Escape')

  // the bench: a point, found by its name in the search field of its picker
  await click(found.point!.at)
  await changeType.click()
  await search().fill('Bench')
  await settle()
  await page.getByRole('button', { name: 'Add Bench to favourites', exact: true }).click()
  await settle()
  await numberOf('Bench').fill('39')
  await numberOf('Bench').press('Enter')
  await settle()
  report(
    'the bench favourite gets number 39 in the list',
    '39',
    await numberOf('Bench').inputValue(),
  )
  await key('Escape')

  // (1) 3, then 9, then Alt let go: favourite 39 (a point, so add-point), not favourite 3 (an area)
  await key('Escape')
  await holdAlt(['3', '9'])
  await settle()
  report(
    'while typing 3 then 9 the hint shows the bench',
    true,
    (await hint()).includes('39 · Bench'),
  )
  await page.keyboard.up('Alt')
  await settle()
  report(
    'Alt let go after 3 then 9 starts favourite 39, not favourite 3',
    'add-point',
    (await state()).mode,
  )
  await key('Escape')

  // (2) 3 alone, then Alt let go: favourite 3, the area
  await holdAlt(['3'])
  await page.keyboard.up('Alt')
  await settle()
  report('Alt let go after 3 alone starts favourite 3, the area', 'draw-area', (await state()).mode)
  await key('Escape')

  // (4) a number without a favourite: nothing starts, and the hint says so
  await holdAlt(['7'])
  await settle()
  report('the hint says there is no favourite 7', true, (await hint()).includes('no favourite 7'))
  await page.keyboard.up('Alt')
  await settle()
  report('a number without a favourite starts nothing', 'browse', (await state()).mode)

  // (5) Escape while holding cancels: the hint goes, and letting Alt go starts nothing
  await holdAlt(['3', '9'])
  await page.keyboard.press('Escape')
  await settle()
  report('Escape while holding clears the hint', '', await hint())
  await page.keyboard.up('Alt')
  await settle()
  report('Escape, then Alt let go, starts nothing', 'browse', (await state()).mode)

  // (6) the same digits typed in the search field of a picker start nothing and change nothing
  await click(first.edge)
  await changeType.click()
  await settle()
  const undoBeforeField = (await state()).undo
  await holdAlt(['3', '9'])
  await page.keyboard.up('Alt')
  await settle()
  report(
    'digits typed in a text field start no favourite',
    ['browse', undoBeforeField],
    [(await state()).mode, (await state()).undo],
  )
  await page.keyboard.press('Escape')
  await key('Escape')

  // (3) the number of the building is set to 888 in the list; 8, 8, 8 starts it, and 3 starts nothing
  await click(first.edge)
  if (!(await numberOf('Building').isVisible())) await changeType.click()
  await settle()
  await numberOf('Building').fill('888')
  await numberOf('Building').press('Enter')
  await settle()
  report(
    'the building favourite gets number 888 in the list',
    '888',
    await numberOf('Building').inputValue(),
  )
  await key('Escape')
  await holdAlt(['8', '8', '8'])
  await page.keyboard.up('Alt')
  await settle()
  report(
    'Alt let go after 8, 8, 8 starts favourite 888, the area',
    'draw-area',
    (await state()).mode,
  )
  await key('Escape')
  await holdAlt(['3'])
  await page.keyboard.up('Alt')
  await settle()
  report('number 3 is free now and starts nothing', 'browse', (await state()).mode)
})

// --- snapping: a drop on a node or a way joins it, as iD does, and add point snaps too ---
failed += await runCheck(
  process.argv[2] ?? 'small',
  async ({ page, report, settle }) => {
    // the snapping check presses keys without leaving a text field first, as it always did
    const { click, drag, key, state, where, near } = await checkHelpers(page, settle, {
      leaveFields: false,
    })
    /** The nodes a way has now, and whether a node exists */
    const graph = (ids: string[], ways: string[]) =>
      page.evaluate(
        ({ ids, ways }) => {
          const { engine } = window.__maid
          return {
            nodes: ids.map((id) => !!engine.data.node(id)),
            ways: ways.map((id) => (engine.data.way(id)?.nodes ?? []) as string[]),
            tags: ids.map((id) => engine.data.node(id)?.tags ?? null),
          }
        },
        { ids, ways },
      ) as Promise<{ nodes: boolean[]; ways: string[][]; tags: (Record<string, string> | null)[] }>
    // what the checks work on: two buildings with a corner each, a road, a standalone point
    const scene = (await page.evaluate(() => {
      const { map, engine } = window.__maid
      const box = map.getCanvas().getBoundingClientRect()
      type P = { x: number; y: number }
      const inView = (p: P) => p.x > 80 && p.y > 80 && p.x < box.width - 80 && p.y < box.height - 80
      const at = (n: string): P => map.project(engine.data.node(n)!.loc!)
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
          const a = at(way.nodes[0]!)
          const b = at(way.nodes[1]!)
          const edge = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
          if (corner && inView(edge)) buildings.push({ id, nodes: way.nodes, corner, edge })
        }
        if (way.tags.highway && !road)
          for (let i = 0; i + 1 < way.nodes.length; i++) {
            const a = at(way.nodes[i]!)
            const b = at(way.nodes[i + 1]!)
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
      await click(second.edge, { shift: true })
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
      [await undoOf(), near(refused, a0, 4)],
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
      const { map, engine } = window.__maid
      const box = map.getCanvas().getBoundingClientRect()
      for (const f of map.queryRenderedFeatures()) {
        const id = String(f.id ?? '')
        if (!id.startsWith('n') || !f.source.includes('vertices')) continue
        const p = map.project(engine.data.node(id)!.loc!)
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
          ] satisfies [number, number][]) {
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
        const { map, engine } = window.__maid
        const box = map.getCanvas().getBoundingClientRect()
        const p = map.project(engine.data.node(id)!.loc!)
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
      const { map, engine } = window.__maid
      const box = map.getCanvas().getBoundingClientRect()
      for (const f of map.queryRenderedFeatures()) {
        const id = String(f.id ?? '')
        const way = id.startsWith('w') ? engine.data.way(id) : undefined
        if (!way?.tags.building || way.nodes.length < 4 || !engine.isReadOnly(id)) continue
        const a = map.project(engine.data.node(way.nodes[0]!)!.loc!)
        const b = map.project(engine.data.node(way.nodes[1]!)!.loc!)
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
        await page.evaluate(() => [...window.__maid.engine.selection]),
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
    const { click, key, selection, drag } = await checkHelpers(page, settle)
    // the pill is found by its accessible name: "3 features here, the first is selected"
    const pill = () => page.getByRole('button', { name: /features here, / })
    const pillText = async () =>
      (await pill().count()) === 0
        ? null
        : ((await pill().first().textContent()) ?? '').replace(/\s+/g, ' ').trim()
    // the layers a click picks from (the editor's pick): the features that a click can find
    const FEATURE_LAYERS =
      '^(highlight-vertex|vertex|point-pin|point-dot|point-address|line-(casing|stroke)(-dashed)?--?\\d|area-stroke|area-fill)'

    // a place where the features of a click are two or more, and open ground that has none
    const found = (await page.evaluate((pattern) => {
      const { map, engine } = window.__maid
      const box = map.getCanvas().getBoundingClientRect()
      const layers = map
        .getStyle()
        .layers.map((l: any) => l.id as string)
        .filter((id: string) => new RegExp(pattern).test(id))
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
    }, FEATURE_LAYERS)) as {
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
    await click(place, { button: 'right' })
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

    // --- the menu's marker: the count sits with the menu, no row covers it, and it goes with the menu ---
    type Place = { x: number; y: number; ids: string[]; lon: number; lat: number }
    // a place where a click finds two or more features; `lowest`: in the lowest 150 px of the map,
    // `draggable`: whose first feature is a node that can be dragged (what a press would drag)
    const findPlace = (wanted: { lowest?: boolean; draggable?: boolean }) =>
      page.evaluate(
        ({ wanted, pattern }) => {
          const { map, engine } = window.__maid
          const box = map.getCanvas().getBoundingClientRect()
          const layers = map
            .getStyle()
            .layers.map((l: any) => l.id as string)
            .filter((id: string) => new RegExp(pattern).test(id))
          const [y0, y1] = wanted.lowest
            ? [box.height - 150, box.height - 20]
            : [100, box.height - 100]
          for (let y = y0; y < y1; y += 6)
            for (let x = 100; x < box.width - 100; x += 6) {
              const ids: string[] = engine.pickAll({ x, y }, layers)
              if (ids.length < 2) continue
              if (wanted.draggable && !engine.isDraggable(ids[0] ?? null)) continue
              const at = map.unproject([x, y])
              return { x, y, ids, lon: at.lng, lat: at.lat }
            }
          return null
        },
        { wanted, pattern: FEATURE_LAYERS },
      ) as Promise<Place | null>
    // the menu and its marker, as the page has them now: positions in window pixels
    const layout = () =>
      page.evaluate(() => {
        const menu = document.querySelector<HTMLElement>('[role="menu"][aria-label="Edit"]')
        const marker = document.querySelector<HTMLElement>('[data-stack-marker]')
        const box = (el: Element) => {
          const r = el.getBoundingClientRect()
          return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
        }
        const m = marker ? box(marker) : null
        const rows = [...(menu?.querySelectorAll('[role="menuitem"]') ?? [])].map(box)
        const hit = m
          ? document.elementFromPoint((m.left + m.right) / 2, (m.top + m.bottom) / 2)
          : null
        const panel = menu ? box(menu) : null
        return {
          menu: menu !== null,
          marker: m !== null,
          text: marker?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
          inWindow:
            !!m && m.left >= 0 && m.top >= 0 && m.right <= innerWidth && m.bottom <= innerHeight,
          // what lies at the middle of the marker is the marker itself
          notCovered: !!m && !!marker?.contains(hit),
          overlapsRow:
            !!m &&
            rows.some(
              (r) => m.left < r.right && r.left < m.right && m.top < r.bottom && r.top < m.bottom,
            ),
          // the marker is over the menu, or under it when the menu flipped up
          under: !!m && !!panel && m.top >= panel.bottom - 0.5,
        }
      })
    const rowState = () =>
      page.evaluate(() => {
        const rows = [
          ...document.querySelectorAll('[role="menu"][aria-label="Edit"] [role="menuitem"]'),
        ]
        return {
          current: rows.findIndex((r) => r.getAttribute('aria-current') === 'true'),
          focused: rows.indexOf(document.activeElement as Element),
        }
      })

    // a right click on the place: the menu and its marker open together, in the window, not covered
    await click(place, { button: 'right' })
    const open = await layout()
    report(
      'a right click on several features opens the menu and its marker together',
      [true, true],
      [open.menu, open.marker],
    )
    report(
      'the marker is in the window, is not covered and no row of the menu lies under it',
      [true, true, true],
      [open.inWindow, open.notCovered, !open.overlapsRow],
    )
    report('the marker counts the selected feature: 1 of N', `1 of ${n}`, open.text)

    // Escape closes the menu, and the marker and the pill go with it
    await page.keyboard.press('Escape')
    await settle()
    const closed = await layout()
    report(
      'Escape removes the menu, its marker and the pill',
      [false, false, null],
      [closed.menu, closed.marker, await pillText()],
    )

    // stepping with the key, with the menu open: the count, the bold row and the focused row move together
    await click(place)
    await click(place, { button: 'right' })
    const beforeStep = { ...(await layout()), row: await rowState() }
    await key('.')
    const afterStep = { ...(await layout()), row: await rowState() }
    report(
      'stepping with the key moves the count, the current row and the focus together',
      [
        [`1 of ${n}`, 0, 0],
        [`2 of ${n}`, 1, 1],
      ],
      [
        [beforeStep.text, beforeStep.row.current, beforeStep.row.focused],
        [afterStep.text, afterStep.row.current, afterStep.row.focused],
      ],
    )
    await page.keyboard.press('Escape')
    await settle()

    // a press that starts a drag of a node with the menu open: the menu and its marker go, the pill too
    const node = await findPlace({ draggable: true })
    if (!node)
      report('find a place whose first feature is a node that can be dragged', 'found', null)
    else {
      await click(node, { button: 'right' })
      const dragOpen = await layout()
      report(
        'a node with several features: the menu and its marker are open',
        [true, true],
        [dragOpen.menu, dragOpen.marker],
      )
      // the menu's corner is at the place, so the press starts just outside that corner, on the node
      await drag({ x: node.x - 3, y: node.y - 3 }, { x: node.x + 17, y: node.y - 3 })
      const dragged = await layout()
      report(
        'a drag of the node with the menu open closes the menu, its marker and the pill',
        [false, false, null],
        [dragged.menu, dragged.marker, await pillText()],
      )
      await key('Meta+z')
    }

    // the same at the lowest 150 px of the map, where the menu flips up: the marker still shows and is not covered
    const home = await page.evaluate(() => {
      const c = window.__maid.map.getCenter()
      return { lng: c.lng, lat: c.lat }
    })
    await page.evaluate((y) => {
      // the centre moves so that the place (its screen x kept) lies 60 px above the bottom of the map
      const { map } = window.__maid
      const box = map.getCanvas().getBoundingClientRect()
      map.jumpTo({ center: map.unproject([box.width / 2, box.height / 2 + y - (box.height - 60)]) })
    }, place.y)
    await settle()
    const low = await findPlace({ lowest: true })
    if (!low) report('find a place with several features in the lowest 150 px', 'found', null)
    else {
      await click(low, { button: 'right' })
      const bottom = await layout()
      report(
        'at the bottom edge the menu flips up: its marker is under it and both show',
        [true, true, true],
        [bottom.menu, bottom.marker, bottom.under],
      )
      report(
        'the marker at the bottom edge is in the window, is not covered and no row lies under it',
        [true, true, true],
        [bottom.inWindow, bottom.notCovered, !bottom.overlapsRow],
      )
      await page.keyboard.press('Escape')
      await settle()
    }
    await page.evaluate(
      (centre) => window.__maid.map.jumpTo({ center: [centre.lng, centre.lat] }),
      home,
    )
    await settle()

    // --- the pill: shown after a plain click on the stack, and gone after the map is panned ---
    const pillAt = await findPlace({})
    if (!pillAt) report('find a place with several features in view', 'found', null)
    else {
      await click(pillAt)
      report('a left click on several features shows the pill', 1, await pill().count())
      await page.evaluate(() => window.__maid.map.panBy([120, 0], { duration: 0 }))
      await settle()
      report('a pan of the map takes the pill away', null, await pillText())
    }
  },
  '',
  false,
)

// --- the measuring tape of a width field: the button in its row, two clicks on the map, and what the clicks may not do ---
failed += await runCheck(
  process.argv[2] ?? 'small',
  async ({ page, report, settle }) => {
    const { click, key, state } = await checkHelpers(page, settle)
    const widthOf = (id: string) =>
      page.evaluate((id) => window.__maid.engine.entity(id)?.tags.width ?? null, id)
    const locsOf = (id: string) =>
      page.evaluate((id) => {
        const { engine } = window.__maid
        return engine.data.way(id)!.nodes.map((n: string) => engine.data.node(n)!.loc!)
      }, id)
    const measureButton = page.locator(
      '[data-focus-key="width"] button[aria-label^="Measure "][aria-label$=" on the map"]',
    )

    // a road, a building edge to click, and two places of open ground that are at least 100 px apart
    const found = (await page.evaluate(() => {
      const { map, engine } = window.__maid
      const box = map.getCanvas().getBoundingClientRect()
      const inView = (p: XY) =>
        p.x > 80 && p.y > 80 && p.x < box.width - 80 && p.y < box.height - 80
      type XY = { x: number; y: number }
      const alone = (p: XY, ownIds: string[], r = 12) =>
        map
          .queryRenderedFeatures([
            [p.x - r, p.y - r],
            [p.x + r, p.y + r],
          ])
          .every((f: any) => f.layer.type === 'fill' || ownIds.includes(String(f.id)))
      let road: string | undefined
      let building: { id: string; at: XY } | undefined
      for (const f of map.queryRenderedFeatures()) {
        const id = String(f.id ?? '')
        const way = id.startsWith('w') && engine.data.way(id)
        if (!way || engine.data.wayMultipolygons.has(id) || way.nodes.length < 2) continue
        const at = (n: string) => map.project(engine.data.node(n)!.loc!)
        if (way.tags.highway && !road && way.nodes[0] !== way.nodes[way.nodes.length - 1]) road = id
        if (way.tags.building && !building) {
          const a = at(way.nodes[0]!)
          const b = at(way.nodes[1]!)
          const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
          // nothing else there at all, not even another area's fill: which of two things on top of
          // each other a click takes is not what this step is about
          const only = map
            .queryRenderedFeatures([
              [mid.x - 8, mid.y - 8],
              [mid.x + 8, mid.y + 8],
            ])
            .every((f: any) => String(f.id) === id)
          if (inView(mid) && only) building = { id, at: mid }
        }
      }
      const free: XY[] = []
      for (let y = 100; y < box.height - 100 && free.length < 2; y += 10)
        for (let x = 100; x < box.width - 100 && free.length < 2; x += 10) {
          if (free.some((p) => Math.hypot(p.x - x, p.y - y) < 100)) continue
          if (alone({ x, y }, [], 16)) free.push({ x, y })
        }
      return { road, building, free }
    })) as {
      road?: string
      building?: { id: string; at: XY }
      free: XY[]
    }
    if (!found.road || !found.building || found.free.length < 2) {
      report('find a road, a building and two places of open ground', 'all in view', {
        road: !!found.road,
        building: !!found.building,
        free: found.free.length,
      })
      return
    }
    const road = found.road
    const building = found.building
    const [p1, p2] = found.free as [XY, XY]

    // the road, selected as the app selects it, and an add of its width field (as a user does), so
    // that the width has no tag yet
    await page.evaluate((id) => window.__bench.select(id), road)
    await settle()
    const addButton = page.getByRole('button', { name: 'Add field', exact: true })
    const addSearch = page.getByRole('combobox', { name: 'Search fields', exact: true })
    const addOptions = page.getByRole('option')
    const focusIs = (locator: typeof addButton) =>
      locator.evaluate((el) => el === document.activeElement)
    const rowIds = () =>
      page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('[data-field-id]')].map(
          (el) => el.dataset.fieldId,
        ),
      )
    // the button opens the flyout, and its search field has the focus
    await addButton.click()
    await settle()
    report(
      'the Add field button opens the flyout with the search field focused',
      true,
      await focusIs(addSearch),
    )
    // typing filters the list; Enter adds the first match, and its control has the focus
    const offered = await addOptions.count()
    await addSearch.fill('Width')
    await settle()
    const matching = await addOptions.count()
    await page.keyboard.press('Enter')
    await settle()
    report(
      'typing filters the list, and Enter adds the first match, whose control has the focus',
      { narrowed: true, rows: 1, focused: 'width' },
      {
        narrowed: matching < offered,
        rows: await page.locator('[data-field-id="width"]').count(),
        focused: await page.evaluate(
          () =>
            document.activeElement?.closest('[data-field-id]')?.getAttribute('data-field-id') ??
            null,
        ),
      },
    )
    // Escape closes the flyout, adds nothing, and gives the focus back to the button
    const rowsBefore = await rowIds()
    await addButton.click()
    await settle()
    await page.keyboard.press('Escape')
    await addSearch.waitFor({ state: 'detached' }).catch(() => undefined)
    await settle()
    report(
      'Escape closes the flyout, adds nothing and the focus is on the button again',
      { open: 0, rowsChanged: false, focusOnButton: true },
      {
        open: await addSearch.count(),
        rowsChanged: JSON.stringify(await rowIds()) !== JSON.stringify(rowsBefore),
        focusOnButton: await focusIs(addButton),
      },
    )

    // --- the width field has the button, the name field has none ---
    report(
      'a width field of the selected road has the measure button',
      1,
      await measureButton.count(),
    )
    report(
      'a name field has no measure button',
      [1, 0],
      await page.evaluate(() => [
        document.querySelectorAll('[data-focus-key="name"] input').length,
        document.querySelectorAll('[data-focus-key="name"] button[aria-label$="on the map"]')
          .length,
      ]),
    )

    // --- the button, two clicks on the map: the ground distance in the field, one undo step ---
    const nodesBefore = await locsOf(road)
    await measureButton.click()
    await settle()
    report('the button starts a measure', true, (await state()).measuring)
    await click(p1)
    await click(p2)
    const expected = await page.evaluate(
      ({ a, b }) => {
        const { map } = window.__maid
        const from = map.unproject([a.x, a.y])
        const to = map.unproject([b.x, b.y])
        // the same great-circle distance as measure.ts, written out here so that the check does not use it
        const rad = Math.PI / 180
        const dLat = (to.lat - from.lat) * rad
        const dLon = (to.lng - from.lng) * rad
        const h =
          Math.sin(dLat / 2) ** 2 +
          Math.cos(from.lat * rad) * Math.cos(to.lat * rad) * Math.sin(dLon / 2) ** 2
        const metres = 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(h)))
        return String(Math.round(metres * 10) / 10)
      },
      { a: p1, b: p2 },
    )
    const afterMeasure = await state()
    report('two clicks write the ground distance into the field', expected, await widthOf(road))
    report('the measure has ended', false, afterMeasure.measuring)
    report('the selection is unchanged', [road], afterMeasure.selection)
    report('no node was added or moved', nodesBefore, await locsOf(road))
    await key('Meta+z')
    report('one undo removes the value', null, await widthOf(road))

    // --- the button, one click, Escape: nothing is written, the selection stays ---
    const undoBefore = (await state()).undo
    await measureButton.click()
    await settle()
    await click(p1)
    report('a first click is the start of the measure', true, (await state()).measuring)
    await key('Escape')
    const afterEscape = await state()
    report('Escape ends the measure', false, afterEscape.measuring)
    report('Escape writes no tag', null, await widthOf(road))
    report('Escape makes no edit', undoBefore, afterEscape.undo)
    report('Escape keeps the selection', [road], afterEscape.selection)

    // --- while measuring, a click on another feature does not select it ---
    await measureButton.click()
    await settle()
    await click(building.at)
    report(
      'a click on a feature while measuring does not select it',
      { measuring: true, selection: [road] },
      { measuring: (await state()).measuring, selection: (await state()).selection },
    )
    await click(p2)
    report('the second click ends the measure', false, (await state()).measuring)

    // --- after measuring, a normal click selects again ---
    await click(building.at)
    report(
      'after measuring, a click selects the building again',
      [building.id],
      (await state()).selection,
    )
  },
  '',
  false,
)

// --- the magnifier of the measuring tape: a lens with the background, centred on the pointer, with the tape
// from the first click. `loupe=blank` draws the lens with an empty style (under automation there is no imagery,
// so no tile is asked for). While the measure runs the width band is not drawn; it is back when the field is hovered. ---
failed += await runCheck(
  process.argv[2] ?? 'small',
  async ({ page, report, settle }) => {
    const { abs, click, key, state } = await checkHelpers(page, settle)
    const measureButton = page.locator(
      '[data-focus-key="width"] button[aria-label^="Measure "][aria-label$=" on the map"]',
    )
    const bands = () =>
      page.evaluate(() => {
        const features: GeoJSON.Feature[] = Reflect.get(window.__maid.engine, 'fieldFeatures')
        return features.filter((f) => f.properties?.state === 'field-band').length
      })
    // the magnifiers that are shown (the lens is kept, hidden, until the pointer is over the map)
    const lenses = () =>
      page.evaluate(
        () =>
          [...document.querySelectorAll<HTMLElement>('[data-testid="measure-loupe"]')].filter(
            (el) => getComputedStyle(el).visibility === 'visible',
          ).length,
      )

    // a road, and two places of open ground that are at least 100 px apart
    const found = (await page.evaluate(() => {
      const { map, engine } = window.__maid
      const box = map.getCanvas().getBoundingClientRect()
      type XY = { x: number; y: number }
      const alone = (p: XY, r = 16) =>
        map
          .queryRenderedFeatures([
            [p.x - r, p.y - r],
            [p.x + r, p.y + r],
          ])
          .every((f: any) => f.layer.type === 'fill')
      let road: string | undefined
      for (const f of map.queryRenderedFeatures()) {
        const id = String(f.id ?? '')
        const way = id.startsWith('w') && engine.data.way(id)
        if (
          way &&
          way.tags.highway &&
          way.nodes.length >= 2 &&
          way.nodes[0] !== way.nodes[way.nodes.length - 1]
        ) {
          road = id
          break
        }
      }
      const free: XY[] = []
      for (let y = 100; y < box.height - 100 && free.length < 2; y += 10)
        for (let x = 100; x < box.width - 100 && free.length < 2; x += 10) {
          if (free.some((p) => Math.hypot(p.x - x, p.y - y) < 100)) continue
          if (alone({ x, y })) free.push({ x, y })
        }
      return { road, free }
    })) as { road?: string; free: XY[] }
    if (!found.road || found.free.length < 2) {
      report('find a road and two places of open ground', 'all in view', {
        road: !!found.road,
        free: found.free.length,
      })
      return
    }
    const road = found.road
    const [p1, p2] = found.free as [XY, XY]

    // the road, with a width, selected as the app selects it
    await page.evaluate((id) => {
      window.__maid.engine.setTag(id, 'width', '6')
    }, road)
    await page.evaluate((id) => window.__bench.select(id), road)
    await settle()

    // a width field that the pointer is on has its band on the map
    await page.locator('[data-focus-key="width"] input').hover()
    await settle()
    report('hovering a width field draws its band before a measure', 1, await bands())

    // the measure: the band is taken away, and there is no magnifier before the pointer is over the map
    await measureButton.click()
    await settle()
    report('the button starts a measure', true, (await state()).measuring)
    report('while measuring, the band is not drawn', 0, await bands())
    report('no magnifier until the pointer is over the map', 0, await lenses())

    // the magnifier follows the pointer: 160 px, not under the pointer, near it, with its crosshair in the middle
    await page.mouse.move(abs(p1).x, abs(p1).y)
    await settle()
    report('moving over the map shows one magnifier', 1, await lenses())
    const geometry = (await page.evaluate(() => {
      const lens = [
        ...document.querySelectorAll<HTMLElement>('[data-testid="measure-loupe"]'),
      ].find((el) => getComputedStyle(el).visibility === 'visible')
      const box = lens?.getBoundingClientRect()
      const cross = lens
        ?.querySelector('[data-testid="measure-loupe-cross"]')
        ?.getBoundingClientRect()
      if (!box || !cross) return null
      return {
        size: box.width,
        cx: box.left + box.width / 2,
        cy: box.top + box.height / 2,
        crossX: cross.left + cross.width / 2,
        crossY: cross.top + cross.height / 2,
      }
    })) as { size: number; cx: number; cy: number; crossX: number; crossY: number } | null
    const at = abs(p1)
    const distance = geometry ? Math.hypot(geometry.cx - at.x, geometry.cy - at.y) : -1
    report('the magnifier is 160 px across', 160, geometry ? Math.round(geometry.size) : null)
    report('the magnifier is not under the pointer', true, distance >= 80)
    report('the magnifier is near the pointer', true, distance > 0 && distance <= 140)
    report(
      "its crosshair is at the magnifier's centre",
      true,
      !!geometry &&
        Math.abs(geometry.crossX - geometry.cx) < 1 &&
        Math.abs(geometry.crossY - geometry.cy) < 1,
    )

    // the first click sets the start: the tape runs from the magnifier's centre to it, three times as long
    await click(p1)
    await page.mouse.move(abs(p2).x, abs(p2).y)
    await settle()
    const tape = await page.evaluate(() => {
      const line = document.querySelector<SVGLineElement>('[data-testid="measure-loupe-tape"]')
      if (!line) return null
      return {
        x1: Number(line.getAttribute('x1')),
        y1: Number(line.getAttribute('y1')),
        x2: Number(line.getAttribute('x2')),
        y2: Number(line.getAttribute('y2')),
      }
    })
    report('a first click puts the tape in the magnifier', true, tape !== null)
    report(
      'the tape runs from the centre to the first point, at three times the distance',
      true,
      !!tape &&
        tape.x1 === 80 &&
        tape.y1 === 80 &&
        Math.abs(tape.x2 - 80 - 3 * (p1.x - p2.x)) < 1.5 &&
        Math.abs(tape.y2 - 80 - 3 * (p1.y - p2.y)) < 1.5,
    )

    // Escape ends the measure and takes the magnifier away
    await key('Escape')
    report('Escape ends the measure', false, (await state()).measuring)
    report('Escape removes the magnifier', 0, await lenses())

    // after the measure, the band is back when the field is hovered again
    await page.locator('[data-focus-key="width"] input').hover()
    await settle()
    report('after the measure the band is back when the width field is hovered', 1, await bands())
  },
  'loupe=blank',
  false,
)

// --- the Tags section is the sheet: a row per tag and the empty row; a key and a value typed in the empty row add
// the tag; a paste of two lines is one step; one undo takes the paste back. Clipboard permissions for this block only.
failed += await runCheck(
  process.argv[2] ?? 'small',
  async ({ page, report, settle }) => {
    const { key, state } = await checkHelpers(page, settle)
    const settleFrame = () =>
      page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      )
    const sorted = (tags: Record<string, string>) =>
      Object.fromEntries(Object.entries(tags).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
    const tagsOf = (id: string) =>
      page
        .evaluate((id) => Object.entries(window.__maid.engine.entity(id)?.tags ?? {}), id)
        .then((entries) => sorted(Object.fromEntries(entries)))
    const cell = (label: string) => page.locator(`input[aria-label="${label}"]`)
    const keysShown = () =>
      page.$$eval('[role="grid"][aria-label="Tags"] [data-row] [data-col="key"] input', (inputs) =>
        inputs.map((input) => (input instanceof HTMLInputElement ? input.value : '')),
      )
    const statusTexts = () => page.locator('[role="status"]').allTextContents()

    const { road } = await pickBuildingAndRoad(page)
    if (!road) {
      report('find a residential road', 'found', 'none')
      return
    }
    await page.evaluate((id) => window.__bench.select(id), road)
    await settle()
    await settleFrame()

    // (1) the Tags section of the selected road: one row per tag, sorted, and the empty row last
    const before = await tagsOf(road)
    report(
      'the Tags section of a selected road: a row per tag, sorted, and the empty row last',
      [...Object.keys(before), ''],
      await keysShown(),
    )

    // (2) a key and a value typed in the empty row add the tag, as one step with the sheet's label
    await cell('Key of new row').click()
    await page.keyboard.type('maid:check')
    await page.keyboard.press('Tab')
    await page.keyboard.type('yes')
    await page.keyboard.press('Enter')
    await settleFrame()
    report(
      'a key and a value typed in the empty row add the tag, as one step labelled "Added a tag"',
      { tags: sorted({ ...before, 'maid:check': 'yes' }), undo: 'Added a tag' },
      { tags: await tagsOf(road), undo: (await state()).undo },
    )

    // (3) a paste of two lines into a key cell: one step, and the line under the sheet says what happened.
    // The setup gives the road a surface that differs from the pasted one, and no lit tag, so the paste adds one
    // tag and replaces one. The setup is one step of its own, so the paste is the step after it.
    await page.evaluate((id) => {
      const { engine } = window.__maid
      const next: Record<string, string> = Object.fromEntries(
        Object.entries(engine.entity(id)?.tags ?? {}).filter(([name]) => name !== 'lit'),
      )
      engine.setTags(id, { ...next, surface: 'gravel' }, 'Set up the check')
    }, road)
    await settleFrame()
    const beforePaste = await tagsOf(road)
    await page.evaluate(() => navigator.clipboard.writeText('lit=yes\nsurface=asphalt'))
    await cell('Key of surface').click()
    await page.keyboard.press('ControlOrMeta+V')
    await settleFrame()
    report(
      'a paste of two lines changes the tags in one step, and the line under the sheet says so',
      {
        tags: sorted({ ...beforePaste, lit: 'yes', surface: 'asphalt' }),
        undo: 'Changed tags',
        status: true,
      },
      {
        tags: await tagsOf(road),
        undo: (await state()).undo,
        status: (await statusTexts()).some((text) => text.includes('2 tags pasted, 1 replaced')),
      },
    )

    // (4) one undo, from the key outside the sheet, takes the paste back: the tags are those before it
    await key('Meta+z')
    report(
      'one undo restores the tags before the paste, and the step it takes next is the setup',
      { tags: beforePaste, undo: 'Set up the check' },
      { tags: await tagsOf(road), undo: (await state()).undo },
    )
  },
  '',
  false,
  ['clipboard-read', 'clipboard-write'],
)

process.exit(failed ? 1 : 0)
