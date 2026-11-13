/**
 * Reroute check for Maid: the route planner mode of the route r156492 (the relations scene, Tobias 2026-11-13). The
 * edit menu of one of its ways offers "Reroute the route" with a flyout of the way's routes. The mode shows the route
 * as a line with support points and a small bar. A drag from the way onto a way nearby is written at the drop, as one
 * undo step, and the route's list of ways on the left marks what joined and what left; the bar's Undo restores the
 * members exactly and the mode stays. A second drag from a support point,
 * Escape ends the mode, and with the mode off a click selects again. The inspector section starts the same mode.
 *
 *   bun tools/bench/reroute-check.ts [scene] --app bicycle
 *
 * Prints one line per check: `ok <check>`, or `FAIL <check>`. Exits 1 on any failure.
 */
import { runCheck } from './check-page'

const sceneName = process.argv[2] ?? 'relations'
const ROUTE = 'r156492'

type Loc = [number, number]

process.exit(
  await runCheck(
    sceneName,
    async ({ page, report, settle }) => {
      const modeId = () =>
        page.evaluate(() => window.__maid.engine.moduleMode?.id ?? null) as Promise<string | null>
      const membersNow = () =>
        page.evaluate(
          (id) =>
            window.__maid.engine.data.relation(id)!.members.map((m: any) => [m.type, m.id, m.role]),
          ROUTE,
        ) as Promise<unknown[]>
      /** Where a map position is on the page, in viewport pixels (as a click on the map is) */
      const screen = (loc: Loc) =>
        page.evaluate((loc) => {
          const { map } = window.__maid
          const p = map.project(loc)
          const rect = map.getContainer().getBoundingClientRect()
          return { x: rect.left + p.x, y: rect.top + p.y }
        }, loc) as Promise<{ x: number; y: number }>
      const drag = async (fromLoc: Loc, toLoc: Loc) => {
        const p = await screen(fromLoc)
        const q = await screen(toLoc)
        await page.mouse.move(p.x, p.y)
        await page.mouse.down()
        for (let k = 1; k <= 10; k++)
          await page.mouse.move(p.x + ((q.x - p.x) * k) / 10, p.y + ((q.y - p.y) * k) / 10)
        await page.mouse.up()
        await settle()
      }

      // --- a member way with a long segment, and a routable way near it that is not in the route ---
      /** A member way with a long segment, and a node of a way of these kinds near it that is not in the route */
      const findTarget = (kinds: string[], footwayOnly: boolean) =>
        page.evaluate(
          ({ id, kinds, footwayOnly }) => {
            const { engine, editor } = window.__maid
            const graph = editor.history.staging.graph
            const relation = engine.data.relation(id)!
            const members = new Set(relation.members.map((member: any) => member.id))
            let best:
              | {
                  wayId: string
                  at: [number, number]
                  target: [number, number]
                  d: number
                  other: string
                }
              | undefined
            for (const member of relation.members) {
              if (member.type !== 'way') continue
              const way = engine.data.way(member.id)
              if (!way) continue
              for (let k = 0; k + 1 < way.nodes.length; k++) {
                const p = engine.data.node(way.nodes[k]!)?.loc
                const q = engine.data.node(way.nodes[k + 1]!)?.loc
                if (!p || !q) continue
                const length = Math.hypot((p[0] - q[0]) * 0.61, p[1] - q[1]) * 111_000
                if (length < 25) continue
                const at: [number, number] = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]
                for (const [, found] of graph.base.entities) {
                  const other = found as any
                  if (!other || other.type !== 'way' || members.has(other.id)) continue
                  if (!kinds.includes(other.tags.highway as string)) continue
                  // a footway a bicycle may not use: no bicycle tag, no access tag
                  if (footwayOnly && (other.tags.bicycle || other.tags.access)) continue
                  for (const nodeId of other.nodes.slice(1, -1)) {
                    const loc = engine.data.node(nodeId)?.loc
                    if (!loc) continue
                    const d = Math.hypot((loc[0] - at[0]) * 0.61, loc[1] - at[1]) * 111_000
                    if (d > 40 && d < 120 && (!best || d < best.d))
                      best = { wayId: member.id, at, target: [loc[0], loc[1]], d, other: other.id }
                  }
                }
              }
            }
            return best ?? null
          },
          { id: ROUTE, kinds, footwayOnly },
        ) as Promise<{ wayId: string; at: Loc; target: Loc; other: string } | null>
      const found = await findTarget(
        ['residential', 'living_street', 'service', 'unclassified', 'tertiary', 'cycleway'],
        false,
      )
      if (!found) {
        report('a member way with a way near it to drag the route onto', 'found', null)
        return
      }
      const { wayId, at, target } = found
      await page.evaluate((id) => window.__maid.engine.setSelected([id]), wayId)
      await page.evaluate(
        ({ a, b }) =>
          window.__maid.map.fitBounds(
            [
              [Math.min(a[0], b[0]) - 0.0006, Math.min(a[1], b[1]) - 0.0006],
              [Math.max(a[0], b[0]) + 0.0006, Math.max(a[1], b[1]) + 0.0006],
            ],
            { padding: 150, animate: false },
          ),
        { a: at, b: target },
      )
      await settle()

      // --- the edit menu: "Reroute the route", its flyout of routes ---
      const point = await screen(at)
      await page.mouse.click(point.x, point.y, { button: 'right' })
      await settle()
      const menu = page.getByRole('menu', { name: 'Edit' })
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
        console.log(`routes in the flyout: ${JSON.stringify(await routes.allInnerTexts())}`)
        const dahme = routes.filter({ hasText: 'Dahme Radweg' })
        report('the flyout names the route', 1, await dahme.count())
        await dahme.first().click()
      } else {
        await reroute.click()
      }
      await settle()
      report('the edit menu starts the route mode', 'reroute', await modeId())
      const panel = page.locator('[data-reroute-panel]')
      report(
        'the panel over the map names the route',
        true,
        /Dahme Radweg/.test(await panel.innerText()),
      )
      const rendered = (layer: string) =>
        page.evaluate(
          (layer) => window.__maid.map.queryRenderedFeatures({ layers: [layer] }).length,
          layer,
        ) as Promise<number>
      report(
        'the route is a blue line on the map',
        true,
        (await rendered('reroute-route-line')) > 0,
      )
      report('the line has support points', true, (await rendered('reroute-route-anchor')) > 0)
      report(
        'where the menu was opened is a point to drag',
        true,
        (await rendered('reroute-handle')) > 0,
      )

      // --- a drag from the way onto the way nearby: written at the drop, one undo step ---
      const before = await membersNow()
      await drag(at, target)
      const joins = page.locator('aside [data-member-joined]')
      const lefts = page.locator('aside [data-member-left]')
      await joins
        .first()
        .waitFor({ timeout: 15000 })
        .catch(() => {})
      console.log(`marked in the list: +${await joins.count()} −${await lefts.count()}`)
      const after = await membersNow()
      report(
        'the drop changes the members of the route',
        false,
        JSON.stringify(before) === JSON.stringify(after),
      )
      report('the list of ways on the left marks what joined', true, (await joins.count()) > 0)
      const box = await panel.boundingBox()
      report('the bar over the map stays small', true, box !== null && box.height < 160)
      report('the mode stays on after the drop', 'reroute', await modeId())
      report(
        'what joined is marked green on the map',
        true,
        (await rendered('reroute-route-joined')) > 0,
      )
      await page.screenshot({ path: 'reports/reroute-panel.png' })
      console.log('screenshot: reports/reroute-panel.png')
      await panel.getByRole('button', { name: 'Undo', exact: true }).click()
      await settle()
      report('Undo in the panel restores the members exactly', before, await membersNow())
      report(
        'after the undo the list marks nothing',
        0,
        (await joins.count()) + (await lefts.count()),
      )
      report('the mode stays on after the undo', 'reroute', await modeId())

      // --- a support point dragged: the stretch between its neighbours ---
      const findAnchor = () =>
        page.evaluate(() => {
          const { map } = window.__maid
          const features = map.queryRenderedFeatures({ layers: ['reroute-route-anchor'] })
          const draggable = features.find((f: any) => typeof f.properties?.handle === 'string')
          return draggable ? (draggable.geometry as any).coordinates : null
        }) as Promise<Loc | null>
      let anchor = await findAnchor()
      // none in view: zoom out until one is, and back in on it, so that the drag is as precise as the first one
      for (let zoom = 17; !anchor && zoom >= 14; zoom--) {
        await page.evaluate((zoom) => window.__maid.map.jumpTo({ zoom }), zoom)
        await settle()
        anchor = await findAnchor()
      }
      if (anchor) {
        await page.evaluate((center) => window.__maid.map.jumpTo({ center, zoom: 18 }), anchor)
        await settle()
        anchor = (await findAnchor()) ?? anchor
      }
      if (anchor) {
        await drag(anchor, [anchor[0] + 0.0004, anchor[1] + 0.0003])
        console.log(
          `marked after the support point: +${await joins.count()} −${await lefts.count()}`,
        )
        report('a support point dragged keeps the mode', 'reroute', await modeId())
        const moved = JSON.stringify(await membersNow()) !== JSON.stringify(before)
        report('the list strikes through what left', true, !moved || (await lefts.count()) > 0)
        if (moved) {
          await page.evaluate(() => window.__maid.engine.undo())
          await settle()
        }
        report('after its undo the members are as before', before, await membersNow())
      } else {
        console.log('no draggable support point in view (not counted)')
      }

      // --- a footway a bicycle may not use is reached all the same (a mapper's route, Tobias 2026-11-13) ---
      const footway = await findTarget(['footway'], true)
      if (footway) {
        await page.evaluate(
          ({ a, b }) =>
            window.__maid.map.fitBounds(
              [
                [Math.min(a[0], b[0]) - 0.0006, Math.min(a[1], b[1]) - 0.0006],
                [Math.max(a[0], b[0]) + 0.0006, Math.max(a[1], b[1]) + 0.0006],
              ],
              { padding: 150, animate: false },
            ),
          { a: footway.at, b: footway.target },
        )
        await settle()
        await drag(footway.at, footway.target)
        await page.waitForTimeout(500)
        // the route runs through the node it was dropped on (the footway may be split there, so by the node)
        const reached = (await page.evaluate(
          ({ id, target }) => {
            const { engine } = window.__maid
            return engine.data.relation(id)!.members.some((member: any) => {
              const way = member.type === 'way' ? engine.data.way(member.id) : undefined
              return way?.nodes.some((nodeId: string) => {
                const loc = engine.data.node(nodeId)?.loc
                return loc !== undefined && loc[0] === target[0] && loc[1] === target[1]
              })
            })
          },
          { id: ROUTE, target: footway.target },
        )) as boolean
        report('a drop on a footway without a bicycle tag reaches it', true, reached)
        if (JSON.stringify(await membersNow()) !== JSON.stringify(before)) {
          await page.evaluate(() => window.__maid.engine.undo())
          await settle()
        }
        report('after its undo the members are as before (footway)', before, await membersNow())
      } else {
        console.log('no footway near the route (not counted)')
      }

      // --- Escape ends the mode; a click selects again ---
      await page.keyboard.press('Escape')
      await settle()
      report('Escape ends the mode', null, await modeId())
      const again = await screen(at)
      await page.mouse.click(again.x, again.y)
      await settle()
      const selection = (await page.evaluate(() => window.__maid.engine.selection)) as string[]
      report('with the mode off, a click selects a feature', true, selection.length > 0)

      // --- the inspector section of the route starts the same mode ---
      await page.evaluate((id) => window.__maid.engine.setSelected([id]), ROUTE)
      await settle()
      const toggle = page.locator('[data-stack-heading] button[aria-controls]', {
        hasText: /^Reroute$/,
      })
      if ((await toggle.first().getAttribute('aria-expanded')) !== 'true')
        await toggle.first().click()
      const start = page.getByRole('button', { name: 'Reroute the route', exact: true })
      report('the section offers "Reroute the route"', true, (await start.count()) > 0)
      await start.first().click()
      await settle()
      report('the section starts the route mode', 'reroute', await modeId())
      await page.keyboard.press('Escape')
      await settle()
    },
    '',
    false,
  ),
)
