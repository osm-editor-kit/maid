/**
 * Edit menu check for Maid: Continue at the end of a line (the menu's first item, and the key A),
 * Paste only on open ground, and Treat as area on a closed untagged line with the type search after it.
 * Real mouse and key presses; the menu's own items are clicked, and the data and the mode are read back after
 * each step. A building's tags are removed first, so that a closed untagged line exists (fixtures only).
 *
 *   bun tools/bench/menu-check.ts [scene] --app maid
 *
 * Prints one line per check: `ok <check>`, or `FAIL <check>` with expected and actual. Exits 1 on any failure,
 * including a request outside localhost. Expected: 12 ok lines (11 checks, and the runner's request check).
 */
import { checkHelpers, type XY } from './check-helpers'
import { runCheck } from './check-page'

const sceneName = process.argv[2] ?? 'small'

/** The labels of the edit menu's commands: the feature names listed first ("Here: N features") are not among them */
const COMMANDS = [
  'Continue',
  'Move',
  'Rotate',
  'Copy',
  'Paste',
  'Reverse',
  'Split',
  'Merge',
  'Straighten',
  'Square',
  'Make round',
  'Treat as area',
  'Disconnect',
  'Extract',
  'Flip long',
  'Flip short',
  'Delete',
]

process.exit(
  await runCheck(
    sceneName,
    async ({ page, report, settle }) => {
      const { click, key, state, where } = await checkHelpers(page, settle)

      /** The labels of the menu's items, in order: a command's label without its key ("Paste⌘V" is "Paste") */
      const menuLabels = async () =>
        (await page.getByRole('menuitem').allTextContents()).map((text) => {
          const t = text.trim()
          return COMMANDS.find((label) => t.startsWith(label)) ?? t
        })
      /** The first label of the menu that is a command (feature names do not count) */
      const firstCommand = async () =>
        (await menuLabels()).find((text) => COMMANDS.some((label) => text.startsWith(label))) ??
        null

      // --- pick: a line with a free end, a point on it, a building away from it, and open ground in view ---
      const picked = (await page.evaluate(() => {
        const { map, engine } = window.__maid
        const bounds = map.getBounds()
        const inView = (id: string) => {
          const loc = engine.data.node(id)?.loc
          return loc !== undefined && bounds.contains([loc[0], loc[1]])
        }
        let line: string | undefined
        let end: string | undefined
        for (const f of map.queryRenderedFeatures()) {
          const id = String(f.id ?? '')
          const way = id.startsWith('w') && engine.data.way(id)
          if (!way || way.isClosed() || way.tags.area === 'yes' || !way.tags.highway) continue
          if (way.nodes.length < 3 || !way.nodes.every(inView)) continue
          // the end is one of this line only: Continue applies to it and no other line is a candidate
          const free = [way.nodes[0], way.nodes[way.nodes.length - 1]].find(
            (n) => n !== undefined && (engine.data.nodeWays.get(n) ?? []).length === 1 && inView(n),
          )
          if (free) {
            line = id
            end = free
            break
          }
        }
        if (!line || !end) return { error: 'no open line with a free end in view' }
        const lineNodes = engine.data.way(line)!.nodes as string[]
        let building: string | undefined
        for (const f of map.queryRenderedFeatures()) {
          const id = String(f.id ?? '')
          const way = id.startsWith('w') && engine.data.way(id)
          if (!way || !way.isClosed() || !way.tags.building || engine.data.wayMultipolygons.has(id))
            continue
          if (!way.nodes.every(inView) || way.nodes.some((n: string) => lineNodes.includes(n)))
            continue
          building = id
          break
        }
        // open ground: a point in the map where nothing is rendered
        const canvas = map.getContainer()
        let ground: { x: number; y: number } | undefined
        for (let y = 40; y < canvas.clientHeight - 40 && !ground; y += 40)
          for (let x = 40; x < canvas.clientWidth - 40 && !ground; x += 40)
            if (map.queryRenderedFeatures([x, y]).length === 0) ground = { x, y }
        return { line, end, building, ground, lineNodes }
      })) as {
        error?: string
        line?: string
        end?: string
        building?: string
        ground?: XY
        lineNodes?: string[]
      }
      if (picked.error || !picked.line || !picked.end || !picked.lineNodes) {
        report('find an open line with a free end in view', 'found', picked)
        return
      }
      const { line, end, lineNodes, building, ground } = picked
      const original = await page.evaluate(
        (id) => [...window.__maid.engine.data.way(id)!.nodes],
        line,
      )
      const midpointOf = async (a: string, b: string): Promise<XY | undefined> => {
        const [p, q] = await where([a, b])
        return p && q ? { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 } : undefined
      }

      // --- Continue: the vertex's menu, and the key A ---
      await page.evaluate((id) => window.__maid.engine.setSelected([id]), end)
      const [endAt] = await where([end])
      await click(endAt!, { button: 'right' })
      report(
        'Continue is the first command of the menu at the end of a line',
        'Continue',
        await firstCommand(),
      )
      await page.getByRole('menuitem', { name: 'Continue' }).first().click()
      await settle()
      const drawing = await page.evaluate(() => {
        const { engine } = window.__maid
        return {
          mode: engine.mode as string,
          way: engine.draw.way?.id ?? null,
          nodes: engine.draw.way ? engine.draw.way.nodes.length : null,
        }
      })
      report(
        'Continue draws on from the end of that line',
        ['draw-line', line, lineNodes.length + 1],
        [drawing.mode, drawing.way, drawing.nodes],
      )
      await key('Delete')
      report(
        'Delete drops the drawing: the line is as before',
        original,
        await page.evaluate((id) => [...window.__maid.engine.data.way(id)!.nodes], line),
      )

      await page.evaluate((id) => window.__maid.engine.setSelected([id]), end)
      await key('a')
      report(
        'the key A starts the same drawing',
        ['draw-line', line],
        await page.evaluate(() => [
          window.__maid.engine.mode as string,
          window.__maid.engine.draw.way?.id ?? null,
        ]),
      )
      await key('Delete')
      report(
        'the key A: Delete drops it, the line is as before',
        original,
        await page.evaluate((id) => [...window.__maid.engine.data.way(id)!.nodes], line),
      )

      // --- Paste: not on a feature, only on open ground ---
      await page.evaluate((id) => {
        window.__maid.engine.setSelected([id])
        window.__maid.engine.copy()
      }, line)
      await settle()
      const mid = await midpointOf(lineNodes[0]!, lineNodes[1]!)
      if (!mid) {
        report('the line has a middle to right-click on', 'a position', null)
        return
      }
      await click(mid, { button: 'right' })
      report(
        "a feature's menu has no Paste",
        0,
        await page.getByRole('menuitem', { name: 'Paste' }).count(),
      )
      await key('Escape')
      if (!ground) {
        report('find open ground in view', 'a point', null)
        return
      }
      await click(ground, { button: 'right' })
      report("open ground's menu offers Paste and nothing else", ['Paste'], await menuLabels())
      await key('Escape')

      // --- Treat as area: a closed untagged line (a building with its tags removed for the check) ---
      if (!building) {
        report('find a building away from the line', 'one in view', null)
        return
      }
      await page.evaluate((id) => {
        const { engine, model } = window.__maid
        engine.data.history.perform(model.actionChangeTags(id, {}))
        engine.data.history.commit({
          annotation: 'Removed the tags of a building for the check',
          selectedIDs: [id],
        })
      }, building)
      await settle()
      const outline = await page.evaluate(
        (id) => [...window.__maid.engine.data.way(id)!.nodes],
        building,
      )
      await page.evaluate((id) => window.__maid.engine.setSelected([id]), building)
      const edge = await midpointOf(outline[0]!, outline[1]!)
      if (!edge) {
        report('the building has an edge to right-click on', 'a position', null)
        return
      }
      await click(edge, { button: 'right' })
      const treat = page.getByRole('menuitem', { name: 'Treat as area' })
      report('the menu offers Treat as area on the closed untagged line', 1, await treat.count())
      await treat.first().click()
      await settle()
      report(
        'Treat as area: one undo step with its name',
        'Treated a closed line as an area',
        (await state()).undo,
      )
      report(
        'Treat as area: the way gets area=yes and no other tag',
        { area: 'yes' },
        await page.evaluate((id) => window.__maid.engine.data.way(id)!.tags, building),
      )

      // the type search lists the area presets for the way now: its picker opens from the feature's head
      const search = page.getByRole('combobox', { name: 'Search feature types' })
      const change = page.locator('[aria-description="Change the feature type"]')
      if ((await search.count()) === 0 && (await change.count()) > 0) await change.first().click()
      let options: string[] = []
      if ((await search.count()) > 0) {
        await search.first().fill('Building')
        await settle()
        options = (await page.getByRole('option').allTextContents()).map((text) => text.trim())
      }
      report(
        'the type search offers the area presets: Building',
        true,
        options.includes('Buildingbuilding=*'),
      )
      await key('Escape')
    },
    '',
    false,
    ['clipboard-read', 'clipboard-write'],
  ),
)
