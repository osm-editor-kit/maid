import { checkHelpers, moveToOpenGround, type XY } from './check-helpers'
import { runCheck } from './check-page'
/**
 * Three-click rectangle for Maid (`--app parking`): real key presses and mouse clicks on the small scene. Draws a
 * rectangle with key 4 and checks the new way (four new corners, right angles on the screen, tagged area=yes), the one
 * undo step, redo, that Escape after the second click writes nothing, the Area dropdown's "Rectangle" entry, a click
 * on an existing node that reuses its id, and a rectangle on a map turned to 30 degrees.
 *
 *   bun tools/bench/rectangle-check.ts small --app parking
 *
 * Prints one line per check: `ok <check>`, or `FAIL <check>` with expected and actual. Exits 1 on any failure.
 */

const sceneName = process.argv[2] ?? 'small'

type RingState = {
  /** The nodes of the way as written: the first is repeated at the end */
  nodes: string[]
  /** Angle at each corner on the screen, in degrees, in ring order */
  angles: number[]
  tags: Record<string, string>
} | null

process.exit(
  await runCheck(sceneName, async ({ page, report, settle }) => {
    const { click, key } = await checkHelpers(page, settle)
    /** The view the scene opens on: the steps that need a node of the scene go back to it */
    const home = await page.evaluate(() => {
      const { map } = window.__maid
      const c = map.getCenter()
      return { center: [c.lng, c.lat] as [number, number], zoom: map.getZoom() }
    })
    const goHome = async () => {
      await page.evaluate((view) => window.__maid.map.jumpTo(view), home)
      await settle()
    }

    /** The state of the editor the checks compare: the mode, the undo label, the entities of the data */
    const editorState = () =>
      page.evaluate(() => {
        const { engine } = window.__maid
        const graph = engine.data.history.staging.graph
        return {
          mode: (engine.moduleMode?.id ?? null) as string | null,
          undo: (engine.undoState().undoLabel ?? null) as string | null,
          entities: (graph.local?.entities?.size ?? -1) as number,
          selected: (engine.selection[0] ?? null) as string | null,
        }
      })

    /** The way's corners and their right angles on the screen, read from the data and the map's projection */
    const ringOf = (wayId: string): Promise<RingState> =>
      page.evaluate((wayId) => {
        const { map, engine } = window.__maid
        const way = engine.data.way(wayId)
        if (!way) return null
        const corners = way.nodes.slice(0, -1)
        const pts = corners.map((id: string) => {
          const loc = engine.data.node(id)?.loc
          if (!loc) return { x: NaN, y: NaN }
          const p = map.project([loc[0], loc[1]])
          return { x: p.x, y: p.y }
        })
        const n = pts.length
        const angles = pts.map((here: XY, i: number) => {
          const prev = pts[(i + n - 1) % n]!
          const next = pts[(i + 1) % n]!
          const ux = prev.x - here.x
          const uy = prev.y - here.y
          const vx = next.x - here.x
          const vy = next.y - here.y
          const cos = (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy))
          return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI
        })
        return { nodes: [...way.nodes], angles, tags: { ...way.tags } }
      }, wayId)

    /**
     * Open ground for a rectangle drawn with `depth` px on the side `depthPoint` gives: both ends of the wall and both far
     * corners are open. Open means no line, point or label within 14 px (a fill does not count: only outlines are
     * snapped to), and no panel of the page over the map. A far corner that lands on a node would be reused, so the
     * whole footprint is checked, not only the wall. Returns up to `count` walls, each end at least `gap` px from
     * `avoid`. `fixedA` puts the first end at a given place (a junction) and only the rest is searched.
     */
    const freeRectangles = (
      count: number,
      depth: number,
      avoid: XY[] = [],
      fixedA?: XY,
      gap = 60,
    ) =>
      page.evaluate(
        ({ count, depth, avoid, fixedA, gap }) => {
          const { map } = window.__maid
          const canvas = map.getCanvas()
          const box = canvas.getBoundingClientRect()
          const open = (x: number, y: number) => {
            if (x < 40 || y < 40 || x > box.width - 40 || y > box.height - 40) return false
            // a panel over the map (the feature picker's list) takes the click, so the map is not under it
            if (document.elementFromPoint(box.left + x, box.top + y) !== canvas) return false
            const hits = map.queryRenderedFeatures([
              [x - 14, y - 14],
              [x + 14, y + 14],
            ])
            return hits.every((f: any) => f.layer.type === 'fill')
          }
          // a far corner is only clicked on the screen, never snapped to a line: it needs no node near it, not open ground
          const clearOfNodes = (x: number, y: number) => {
            if (x < 40 || y < 40 || x > box.width - 40 || y > box.height - 40) return false
            if (document.elementFromPoint(box.left + x, box.top + y) !== canvas) return false
            return !map
              .queryRenderedFeatures([
                [x - 12, y - 12],
                [x + 12, y + 12],
              ])
              .some((f: any) => String(f.id ?? '').startsWith('n'))
          }
          const far = (p: XY, q: XY) => Math.hypot(p.x - q.x, p.y - q.y) >= gap
          const used: XY[] = [...avoid]
          // walls of 100, 150 and 200 px in every 30 degrees: a scene has little open ground, so the search tries many
          const offsets: [number, number][] = []
          for (const r of [100, 150, 200])
            for (let deg = 0; deg < 360; deg += 30)
              offsets.push([
                r * Math.cos((deg * Math.PI) / 180),
                r * Math.sin((deg * Math.PI) / 180),
              ])
          const starts: XY[] = []
          if (fixedA) starts.push(fixedA)
          else
            for (let y = 100; y < box.height - 100; y += 10)
              for (let x = 100; x < box.width - 100; x += 10) starts.push({ x, y })
          const out: { a: XY; b: XY; sign: number }[] = []
          for (const a of starts) {
            if (out.length >= count) break
            if (!fixedA && !open(a.x, a.y)) continue
            if (!used.every((p) => far(p, a))) continue
            for (const [dx, dy] of offsets) {
              const b = { x: a.x + dx, y: a.y + dy }
              if (!open(b.x, b.y) || !used.every((p) => far(p, b))) continue
              // the side of depthPoint, +1 or -1: the unit normal of A to B, turned a quarter turn
              const len = Math.hypot(dx, dy)
              const sign = [1, -1].find((s) => {
                const nx = (-dy / len) * s
                const ny = (dx / len) * s
                return (
                  clearOfNodes(a.x + nx * depth, a.y + ny * depth) &&
                  clearOfNodes(b.x + nx * depth, b.y + ny * depth)
                )
              })
              if (sign === undefined) continue
              const nx = (-dy / len) * sign
              const ny = (dx / len) * sign
              const d1 = { x: a.x + nx * depth, y: a.y + ny * depth }
              const d2 = { x: b.x + nx * depth, y: b.y + ny * depth }
              out.push({ a, b, sign })
              used.push(a, b, d1, d2)
              break
            }
          }
          return out
        },
        { count, depth, avoid, fixedA: fixedA ?? null, gap },
      ) as Promise<{ a: XY; b: XY; sign: number }[]>

    /**
     * The junction nodes in view, each with no other node within 14 px of it: the engine's snap takes the first node it
     * finds, so a click on a junction next to another node would reuse that one. A junction must also be visible (no
     * panel over it). Up to 40, in the order the map lists the ways.
     */
    const junctionsInView = () =>
      page.evaluate(() => {
        const { map, engine } = window.__maid
        const canvas = map.getCanvas()
        const box = canvas.getBoundingClientRect()
        const { width, height } = box
        const found: (XY & { id: string })[] = []
        for (const f of map.queryRenderedFeatures()) {
          const wayId = String(f.id ?? '')
          const way = wayId.startsWith('w') && !wayId.includes('-') && engine.data.way(wayId)
          if (!way || !way.tags.highway) continue
          for (const id of way.nodes) {
            if ((engine.data.nodeUses.get(id) ?? 0) < 2) continue
            const loc = engine.data.node(id)?.loc
            if (!loc) continue
            const p = map.project([loc[0], loc[1]])
            if (!(p.x > 80 && p.y > 80 && p.x < width - 80 && p.y < height - 80)) continue
            if (document.elementFromPoint(box.left + p.x, box.top + p.y) !== canvas) continue
            const others = map
              .queryRenderedFeatures([
                [p.x - 14, p.y - 14],
                [p.x + 14, p.y + 14],
              ])
              .some((g: any) => {
                const gid = String(g.id ?? '')
                return gid.startsWith('n') && gid !== id
              })
            if (!others) found.push({ id, x: p.x, y: p.y })
            if (found.length >= 40) return found
          }
        }
        return found
      }) as Promise<(XY & { id: string })[]>

    /** A point `distance` px from the middle of A to B, on the side the sign gives: the third click */
    const depthPoint = (a: XY, b: XY, distance: number, sign = 1): XY => {
      const mx = (a.x + b.x) / 2
      const my = (a.y + b.y) / 2
      const len = Math.hypot(b.x - a.x, b.y - a.y)
      // the unit normal of AB, turned a quarter turn: on screen, y points down
      const nx = (-(b.y - a.y) / len) * sign
      const ny = ((b.x - a.x) / len) * sign
      return { x: mx + nx * distance, y: my + ny * distance }
    }

    /** The greatest deviation of the four corners from a right angle, in degrees */
    const worstDeviation = (ring: RingState) =>
      ring ? Math.max(...ring.angles.map((angle) => Math.abs(angle - 90))) : Infinity

    /** The new way the editor selected after a draw: the one that announceDrawn named */
    /** The way the shell selects after a draw: waits until the selection differs from `previous` */
    const drawnWay = async (previous: string | null) => {
      await page
        .waitForFunction((prev) => (window.__maid.engine.selection[0] ?? null) !== prev, previous, {
          timeout: 3000,
        })
        .catch(() => {})
      return (await editorState()).selected
    }

    /** Three clicks on open ground: A, B, then the depth. Returns the new way and its corners. */
    const drawThree = async (a: XY, b: XY, depth = 60, sign = 1) => {
      const previous = (await editorState()).selected
      await click(a)
      await click(b)
      await click(depthPoint(a, b, depth, sign))
      const way = await drawnWay(previous)
      return { way, ring: way ? await ringOf(way) : null }
    }

    // --- the key starts the mode, three clicks draw the rectangle ---
    const [r0] = await freeRectangles(1, 60)
    if (!r0) {
      report('find open ground to draw on', 'a rectangle of open ground', 'none')
      return
    }
    const { a: a0, b: b0 } = r0
    const before = await editorState()
    await key('4')
    report('key 4 starts the rectangle mode', 'rectangle', (await editorState()).mode)

    const first = await drawThree(a0, b0, 60, r0.sign)
    const afterFirst = await editorState()
    const corners = first.ring?.nodes.slice(0, -1) ?? []
    report(
      'one closed way with four corners',
      { closed: true, corners: 4 },
      {
        closed: first.ring?.nodes[0] === first.ring?.nodes[4] && first.ring?.nodes.length === 5,
        corners: new Set(corners).size,
      },
    )
    report(
      'the four corners are new nodes',
      [true, true, true, true],
      corners.map((id) => id.includes('-')),
    )
    report(
      'four right angles on the screen (within 0.5 degrees)',
      true,
      worstDeviation(first.ring) < 0.5,
    )
    report('the way is tagged area=yes until it has a type', { area: 'yes' }, first.ring?.tags)
    report('one undo step: "Drew a rectangle"', 'Drew a rectangle', afterFirst.undo)
    report(
      'the mode ends and the new way is selected',
      [null, true],
      [afterFirst.mode, afterFirst.selected === first.way],
    )
    const picker = page.getByRole('combobox', { name: 'Search feature types', exact: true })
    const pickerShown = await picker.waitFor({ state: 'visible', timeout: 3000 }).then(
      () => true,
      () => false,
    )
    report('the type picker opens for the new way', true, pickerShown)

    // --- one undo removes the way and its corners; redo brings them back ---
    await key('Meta+z')
    const undone = await editorState()
    const wayGone = await page.evaluate(
      (ids) => {
        const { engine } = window.__maid
        const graph = engine.data.history.staging.graph
        return {
          way: engine.data.way(ids.way) !== undefined,
          corners: ids.corners.filter((id: string) => graph.hasEntity(id) !== undefined).length,
        }
      },
      { way: first.way ?? '', corners },
    )
    report('undo removes the way and its corners', { way: false, corners: 0 }, wayGone)
    report('undo goes back to the state before the rectangle', before.undo, undone.undo)
    await key('Meta+Shift+Z')
    const redone = await ringOf(first.way ?? '')
    report('redo brings the same way back with the same corners', first.ring?.nodes, redone?.nodes)

    // --- Escape after the second click: nothing is written (open ground, away from the scene's data) ---
    await moveToOpenGround(page, settle, sceneName)
    // depth 0: only the two ends of the wall are clicked here, so only they need open ground
    const [r1] = await freeRectangles(1, 0, [a0, b0])
    if (!r1) {
      report('find open ground for the Escape case', 'a rectangle of open ground', 'none')
      return
    }
    const { a: a1, b: b1 } = r1
    const beforeEscape = await editorState()
    await key('4')
    await click(a1)
    await click(b1)
    await key('Escape')
    const afterEscape = await editorState()
    report(
      'Escape after the second click: mode ends, no undo step, nothing written',
      { mode: null, undo: beforeEscape.undo, entities: beforeEscape.entities },
      { mode: afterEscape.mode, undo: afterEscape.undo, entities: afterEscape.entities },
    )

    // --- the Area dropdown lists "Rectangle", and starts it ---
    await page.getByRole('button', { name: 'More area tools', exact: true }).click()
    await settle()
    const listed = await page
      .getByRole('menuitem', { name: /^Rectangle/ })
      .isVisible()
      .catch(() => false)
    report('the Area dropdown lists "Rectangle"', true, listed)
    await page.getByRole('menuitem', { name: /^Rectangle/ }).click()
    await settle()
    report('the dropdown starts the rectangle mode', 'rectangle', (await editorState()).mode)

    const [r2] = await freeRectangles(1, 50, [a0, b0, a1, b1])
    if (!r2) {
      report('find open ground for the dropdown case', 'a rectangle of open ground', 'none')
      return
    }
    const fromMenu = await drawThree(r2.a, r2.b, 50, r2.sign)
    const fromMenuState = await editorState()
    report(
      'drawn from the dropdown: four right angles and four corners',
      { right: true, corners: 4 },
      {
        right: worstDeviation(fromMenu.ring) < 0.5,
        corners: new Set(fromMenu.ring?.nodes.slice(0, -1) ?? []).size,
      },
    )
    report('drawn from the dropdown: one undo step', 'Drew a rectangle', fromMenuState.undo)

    // --- a click on an existing node reuses its id ---
    // Escape closes the feature picker of the last rectangle: its list lies over the map and takes clicks there
    await key('Escape')
    await goHome()
    // the first junction with open ground beside it for the wall and the far corners
    let junction: (XY & { id: string }) | undefined
    let rj: { a: XY; b: XY; sign: number } | undefined
    for (const candidate of await junctionsInView()) {
      const [found] = await freeRectangles(1, 60, [], { x: candidate.x, y: candidate.y })
      if (found) {
        junction = candidate
        rj = found
        break
      }
    }
    if (!junction || !rj) {
      report('find a junction in view with open ground beside it', 'a junction', 'none')
      return
    }
    const b3 = rj.b
    const previousNode = (await editorState()).selected
    await key('4')
    await click({ x: junction.x, y: junction.y })
    await click(b3)
    await click(depthPoint({ x: junction.x, y: junction.y }, b3, 60, rj.sign))
    const onNode = await drawnWay(previousNode)
    const onNodeRing = onNode ? await ringOf(onNode) : null
    report(
      'a click on an existing node reuses its id as a corner',
      junction.id,
      onNodeRing?.nodes[0],
    )
    report(
      'the other three corners of that rectangle are new',
      [true, true, true],
      (onNodeRing?.nodes.slice(1, 4) ?? []).map((id) => id.includes('-')),
    )

    // --- a rectangle on a map turned to 30 degrees: still four right angles on the screen ---
    await moveToOpenGround(page, settle, sceneName)
    await page.evaluate(() => window.__maid.map.setBearing(30))
    await settle()
    report(
      'the map is turned to 30 degrees',
      30,
      await page.evaluate(() => Math.round(window.__maid.map.getBearing())),
    )
    const [r4] = await freeRectangles(1, 60, [{ x: junction.x, y: junction.y }])
    if (!r4) {
      report('find open ground on the turned map', 'a rectangle of open ground', 'none')
    } else {
      await key('4')
      const turned = await drawThree(r4.a, r4.b, 60, r4.sign)
      report('turned map: four right angles on the screen', true, worstDeviation(turned.ring) < 0.5)
    }
    await page.evaluate(() => window.__maid.map.setBearing(0))
    await settle()
  }),
)
