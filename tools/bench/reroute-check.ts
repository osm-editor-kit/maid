/**
 * Reroute check for Maid: the inspector section "Reroute" of the route r156492 (the relations scene). It starts a
 * reroute, clicks two points on two member ways of the route a few members apart (the points are projected from the
 * ways' nodes, as a person clicks), and checks the module mode, the length line and Apply. Apply is one undo step that
 * restores the members exactly. Escape ends the mode, and with the mode off a click selects again. The time from the
 * second click to the length line is printed, not counted. Then the edit menu's "Reroute the route" on a way of the
 * route: the flyout of routes, the mode, the panel, a drag of the line onto a way nearby, Apply and one undo.
 *
 *   bun tools/bench/reroute-check.ts [scene] --app bicycle
 *
 * Prints one line per check: `ok <check>`, or `FAIL <check>`. Exits 1 on any failure.
 */
import { runCheck } from './check-page'

const sceneName = process.argv[2] ?? 'relations'
const ROUTE = 'r156492'

type Point = { wayId: string; loc: [number, number]; index: number }

process.exit(
  await runCheck(
    sceneName,
    async ({ page, report, settle }) => {
      // --- select the route, open its "Reroute" section, start a reroute ---
      await page.evaluate((id) => window.__maid.engine.setSelected([id]), ROUTE)
      await settle()
      // the section's heading: its title button is the switch (aria-expanded), a sticky heading in a scroller
      const toggle = page.locator('[data-stack-heading] button[aria-controls]', {
        hasText: /^Reroute$/,
      })
      if ((await toggle.first().getAttribute('aria-expanded')) !== 'true')
        await toggle.first().click()
      const start = page.getByRole('button', { name: 'Reroute a stretch', exact: true })
      report('the section offers "Reroute a stretch"', 1, await start.count())
      const modeId = () =>
        page.evaluate(() => window.__maid.engine.moduleMode?.id ?? null) as Promise<string | null>
      await start.first().click()
      await settle()
      report('starting a reroute turns the module mode on', 'reroute', await modeId())

      // --- two points on two member ways, a few members apart, both in one view ---
      const pair = (await page.evaluate((id) => {
        const { engine } = window.__maid
        const relation = engine.data.relation(id)!
        const loaded: { wayId: string; loc: [number, number]; index: number }[] = []
        relation.members.forEach((member: any, index: number) => {
          if (member.type !== 'way') return
          const way = engine.data.way(member.id)
          if (!way || way.nodes.length === 0) return
          const node = engine.data.node(way.nodes[Math.floor(way.nodes.length / 2)]!)
          if (node?.loc) loaded.push({ wayId: member.id, loc: [node.loc[0], node.loc[1]], index })
        })
        let best: { a: (typeof loaded)[number]; b: (typeof loaded)[number]; d: number } | undefined
        for (const a of loaded)
          for (const b of loaded) {
            const gap = b.index - a.index
            if (gap < 2 || gap > 6) continue
            const d = Math.hypot(a.loc[0] - b.loc[0], a.loc[1] - b.loc[1])
            if (!best || d < best.d) best = { a, b, d }
          }
        return best ? { a: best.a, b: best.b } : null
      }, ROUTE)) as { a: Point; b: Point } | null
      if (!pair) {
        report('the route has two loaded member ways a few members apart', 'found', null)
        return
      }
      const { a, b } = pair
      /** The view on both points: fitBounds, as a person would zoom to them (no animation, so the points are placed) */
      const frame = async () => {
        await page.evaluate(
          ({ a, b }) => {
            window.__maid.map.fitBounds(
              [
                [Math.min(a.loc[0], b.loc[0]) - 0.001, Math.min(a.loc[1], b.loc[1]) - 0.001],
                [Math.max(a.loc[0], b.loc[0]) + 0.001, Math.max(a.loc[1], b.loc[1]) + 0.001],
              ],
              { padding: 150, animate: false },
            )
          },
          { a, b },
        )
      }
      await frame()
      await settle()
      /** Where a map position is on the page, in viewport pixels (as a click on the map is) */
      const screen = (loc: [number, number]) =>
        page.evaluate((loc) => {
          const { map } = window.__maid
          const p = map.project(loc)
          const rect = map.getContainer().getBoundingClientRect()
          return { x: rect.left + p.x, y: rect.top + p.y }
        }, loc) as Promise<{ x: number; y: number }>

      const membersNow = () =>
        page.evaluate(
          (id) =>
            window.__maid.engine.data.relation(id)!.members.map((m: any) => [m.type, m.id, m.role]),
          ROUTE,
        ) as Promise<unknown[]>
      const lengthLine = page.getByText(/^Length: /)
      const applyButton = page.getByRole('button', { name: 'Apply', exact: true })

      // --- the first click sets the start; the second sets the end and the preview comes ---
      const pa = await screen(a.loc)
      await page.mouse.click(pa.x, pa.y)
      await settle()
      const pb = await screen(b.loc)
      const clickedAt = Date.now()
      await page.mouse.click(pb.x, pb.y)
      const appeared = await lengthLine
        .first()
        .waitFor({ timeout: 15000 })
        .then(
          () => true,
          () => false,
        )
      const previewMs = Date.now() - clickedAt
      await settle()
      report('the preview: the length line appears after the second click', true, appeared)
      console.log(
        `time from the second click to the length line: ${previewMs} ms (measured, not counted)`,
      )
      report('the section shows the length line once', 1, await lengthLine.count())
      report('Apply is enabled', true, await applyButton.isEnabled())

      // --- Apply: the members change, and one undo restores them exactly ---
      const before = await membersNow()
      await applyButton.click()
      await settle()
      const after = await membersNow()
      report(
        'Apply changes the members of the route',
        false,
        JSON.stringify(before) === JSON.stringify(after),
      )
      report('Apply ends the reroute: the section offers it again', 1, await start.count())
      await page.evaluate(() => window.__maid.engine.undo())
      await settle()
      report('one undo restores the members exactly', before, await membersNow())

      // --- Escape ends the mode ---
      await start.first().click()
      await settle()
      report('the mode is on again', 'reroute', await modeId())
      await page.keyboard.press('Escape')
      await settle()
      report('Escape ends the mode', null, await modeId())

      // --- with the mode off, a click selects the feature under it ---
      await frame()
      await settle()
      const onWay = (await page.evaluate((wayId) => {
        const { engine } = window.__maid
        const way = engine.data.way(wayId)!
        const p = engine.data.node(way.nodes[0]!)?.loc
        const q = engine.data.node(way.nodes[1]!)?.loc
        return p && q ? [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2] : null
      }, a.wayId)) as [number, number] | null
      if (!onWay) {
        report('a point on a member way to click', 'found', null)
      } else {
        const point = await screen(onWay as [number, number])
        await page.mouse.click(point.x, point.y)
        await settle()
        // the click picks the feature under the pointer: a way, or a vertex of one. Something other than the route
        // being selected is what "selects normally" means here
        const selection = (await page.evaluate(() => window.__maid.engine.selection)) as string[]
        console.log(`selection after the click: ${JSON.stringify(selection)}`)
        report(
          'with the mode off, a click selects a feature (not the route)',
          true,
          selection.length > 0 && !selection.includes(ROUTE),
        )
      }

      // --- the edit menu on a way of the route: "Reroute the route" (and its flyout of routes), the stretch starts on
      // that way, a drag of the line pulls the route onto another way, and the panel lists what leaves and joins ---
      // a place on the way between two of its nodes: a right click there is on the way, not on a vertex
      const onSegment = (await page.evaluate((wayId) => {
        const { engine } = window.__maid
        const way = engine.data.way(wayId)!
        // the middle of its longest segment
        let best: [number, number] = [0, 0]
        let longest = -1
        for (let k = 0; k + 1 < way.nodes.length; k++) {
          const p = engine.data.node(way.nodes[k]!)!.loc!
          const q = engine.data.node(way.nodes[k + 1]!)!.loc!
          const length = Math.hypot(p[0] - q[0], p[1] - q[1])
          if (length > longest) {
            longest = length
            best = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]
          }
        }
        return best
      }, a.wayId)) as [number, number]
      await page.evaluate((id) => window.__maid.engine.setSelected([id]), a.wayId)
      await page.evaluate((loc) => window.__maid.map.jumpTo({ center: loc, zoom: 19 }), onSegment)
      await settle()
      const middle = await screen(onSegment)
      await page.mouse.click(middle.x, middle.y, { button: 'right' })
      await settle()
      const menu = page.getByRole('menu', { name: 'Edit' })
      console.log(`edit menu: ${JSON.stringify(await menu.getByRole('menuitem').allInnerTexts())}`)
      const reroute = menu.getByRole('menuitem', { name: /^Reroute the route/ })
      report(
        'the edit menu of a way of the route offers "Reroute the route"',
        1,
        await reroute.count(),
      )
      if ((await reroute.count()) === 0) return
      if ((await reroute.getAttribute('aria-haspopup')) === 'menu') {
        await reroute.click()
        const routes = page.getByRole('menu', { name: 'Reroute the route' }).getByRole('menuitem')
        const names = await routes.allInnerTexts()
        console.log(`routes in the flyout: ${JSON.stringify(names)}`)
        const dahme = routes.filter({ hasText: 'Dahme Radweg' })
        report('the flyout names the route', 1, await dahme.count())
        await dahme.first().click()
      } else {
        await reroute.click()
      }
      await settle()
      report('the edit menu starts the reroute: the module mode is on', 'reroute', await modeId())
      const panel = page.locator('[data-reroute-panel]')
      report(
        'the panel over the map names the route',
        true,
        /Dahme Radweg/.test(await panel.innerText()),
      )
      report(
        'the way stays selected',
        [a.wayId],
        await page.evaluate(() => window.__maid.engine.selection),
      )

      // a routable way near the selected one that is not in the route: where the line is dragged to
      const target = (await page.evaluate(
        ({ id, wayId }) => {
          const { engine, editor } = window.__maid
          const graph = editor.history.staging.graph
          const relation = engine.data.relation(id)!
          const members = new Set(relation.members.map((member: any) => member.id))
          const way = engine.data.way(wayId)!
          const mid = engine.data.node(way.nodes[Math.floor(way.nodes.length / 2)]!)!.loc!
          let best: { loc: [number, number]; d: number } | undefined
          for (const [, found] of graph.base.entities) {
            const entity = found as any
            if (!entity || entity.type !== 'way' || members.has(entity.id)) continue
            const kind = entity.tags.highway as string
            if (
              ![
                'residential',
                'living_street',
                'service',
                'cycleway',
                'unclassified',
                'tertiary',
              ].includes(kind)
            )
              continue
            for (const nodeId of entity.nodes.slice(1, -1)) {
              const loc = engine.data.node(nodeId)?.loc
              if (!loc) continue
              const d = Math.hypot((loc[0] - mid[0]) * 0.61, loc[1] - mid[1]) * 111_000
              if (d > 40 && d < 250 && (!best || d < best.d)) best = { loc: [loc[0], loc[1]], d }
            }
          }
          return best ? best.loc : null
        },
        { id: ROUTE, wayId: a.wayId },
      )) as [number, number] | null
      if (!target) {
        report('a way near the route to drag the line onto', 'found', null)
        return
      }
      await page.evaluate(
        (points) => {
          const lons = points.map((p) => p[0])
          const lats = points.map((p) => p[1])
          window.__maid.map.fitBounds(
            [
              [Math.min(...lons) - 0.0005, Math.min(...lats) - 0.0005],
              [Math.max(...lons) + 0.0005, Math.max(...lats) + 0.0005],
            ],
            { padding: 120, animate: false },
          )
        },
        [onSegment, target, b.loc],
      )
      await settle()

      // the end of the way nearer to the other member way is a handle: dragged there, the stretch grows along the route
      const handleEnd = (await page.evaluate(
        ({ wayId, toward }) => {
          const { engine } = window.__maid
          const way = engine.data.way(wayId)!
          const first = engine.data.node(way.nodes[0]!)!.loc!
          const last = engine.data.node(way.nodes.at(-1)!)!.loc!
          const d = (p: number[]) => Math.hypot(p[0]! - toward[0], p[1]! - toward[1])
          return d(first) < d(last) ? [first[0], first[1]] : [last[0], last[1]]
        },
        { wayId: a.wayId, toward: b.loc },
      )) as [number, number]
      const lengthNow = async () => {
        const text = await panel.innerText()
        const found = /Length: ([\d.]+) m now/.exec(text)
        return found ? Number(found[1]) : undefined
      }
      const drag = async (fromLoc: [number, number], toLoc: [number, number]) => {
        const p = await screen(fromLoc)
        const q = await screen(toLoc)
        await page.mouse.move(p.x, p.y)
        await page.mouse.down()
        for (let k = 1; k <= 8; k++)
          await page.mouse.move(p.x + ((q.x - p.x) * k) / 8, p.y + ((q.y - p.y) * k) / 8)
        await page.mouse.up()
        await settle()
      }
      // a first change makes the plan, so the length line is there to read
      const lengthBefore = await lengthNow()
      await drag(handleEnd, b.loc)
      const lengthAfter = await lengthNow()
      console.log(`stretch length: ${lengthBefore} m, after the handle drag ${lengthAfter} m`)
      report(
        'a handle dragged along the route makes the stretch longer',
        true,
        lengthBefore === undefined
          ? lengthAfter !== undefined
          : lengthAfter !== undefined && lengthAfter > lengthBefore,
      )
      // press on the line in the middle of the way, and drag it onto the other way
      const membersBefore = await membersNow()
      await drag(onSegment, target)
      const joins = page.locator('[data-reroute-list="in"] li')
      await joins
        .first()
        .waitFor({ timeout: 15000 })
        .catch(() => {})
      console.log(`panel after the drag: ${JSON.stringify(await panel.innerText())}`)
      report(
        'the drag pulls the route onto other ways: the panel lists ways that join',
        true,
        (await joins.count()) > 0,
      )
      await page.screenshot({ path: 'reports/reroute-panel.png' })
      console.log('screenshot: reports/reroute-panel.png')
      report('Apply is enabled after the drag', true, await applyButton.isEnabled())
      await applyButton.click()
      await settle()
      report('Apply ends the mode', null, await modeId())
      report(
        'Apply changes the members of the route',
        false,
        JSON.stringify(membersBefore) === JSON.stringify(await membersNow()),
      )
      await page.evaluate(() => window.__maid.engine.undo())
      await settle()
      report('one undo restores the members exactly', membersBefore, await membersNow())
    },
    '',
    false,
  ),
)
