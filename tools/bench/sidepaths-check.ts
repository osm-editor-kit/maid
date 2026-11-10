/**
 * Side path check for the bicycle editor (`--app bicycle`, medium scene): the edit menu entries of the sidepaths module
 * on real fixture roads.
 * - Alexanderstraße (w112128422) has `cycleway:right=separate` and `cycleway:right:lane=advisory`: no entry, a lane key
 *   stays on the road.
 * - Bebelplatz (w1171295121) has `sidewalk:both=separate` and `sidewalk:both:surface=sett`; its right sidewalk has the
 *   same surface, its left one another: "both" runs, the right side's tag goes, the left one stays on the road as
 *   `sidewalk:left:surface`, the road stays selected; undo restores the road.
 * Fixtures only, nothing leaves localhost.
 *
 *   bun tools/bench/sidepaths-check.ts medium --app bicycle
 *
 * Prints one line per check: `ok <check>`, or `FAIL <check>`. Exits 1 on any failure.
 */
import { runCheck } from './check-page'

const sceneName = process.argv[2] ?? 'medium'

const ALEXANDERSTRASSE = { id: 'w112128422', center: [13.41213, 52.52405] as [number, number] }
const BEBELPLATZ = { id: 'w1171295121', center: [13.39521, 52.51698] as [number, number] }
const LEFT_DIFFERS = 'The separate way on the left side already has another value for surface.'

process.exit(
  await runCheck(sceneName, async ({ page, report, settle }) => {
    /** Jumps to a road and selects it; true when it is loaded */
    const select = async (road: { id: string; center: [number, number] }) => {
      await page.evaluate((center) => window.__maid.map.jumpTo({ center, zoom: 18 }), road.center)
      await settle()
      await page.waitForFunction((id) => window.__maid.engine.data.way(id) !== undefined, road.id, {
        timeout: 15_000,
      })
      await page.evaluate((id) => window.__maid.engine.setSelected([id]), road.id)
      await settle()
    }
    /** The sidepaths entries that apply to the selection: id and the reason when disabled */
    const entries = () =>
      page.evaluate(() => {
        const { engine, editor } = window.__maid
        const context = engine.operationContext()
        return editor
          .registry('edit.operation')
          .list()
          .filter((o) => o.id.startsWith('move-') && o.applies(context))
          .map((o) => ({ id: o.id, disabled: o.disabled(context) ?? null }))
      })
    const tags = (id: string) =>
      page.evaluate((id) => ({ ...window.__maid.engine.data.way(id)?.tags }), id) as Promise<
        Record<string, string>
      >

    await select(ALEXANDERSTRASSE)
    report('Alexanderstraße: a lane key alone is nothing to move', [], await entries())

    await select(BEBELPLATZ)
    report(
      'Bebelplatz: the sidewalk entries for both sides and each side; the left one alone has nothing to move',
      [
        { id: 'move-sidewalk-tags-both', disabled: null },
        { id: 'move-sidewalk-tags-left', disabled: LEFT_DIFFERS },
        { id: 'move-sidewalk-tags-right', disabled: null },
      ],
      await entries(),
    )
    // the edit menu shows them, by a right click on the middle of the road's first segment
    const point = await page.evaluate((id) => {
      const { engine, map } = window.__maid
      const way = engine.data.way(id)!
      const [a, b] = [0, 1].map((i) =>
        map.project(engine.data.node(way.nodes[i]!)!.loc as [number, number]),
      )
      const box = map.getCanvas().getBoundingClientRect()
      return { x: box.left + (a!.x + b!.x) / 2, y: box.top + (a!.y + b!.y) / 2 }
    }, BEBELPLATZ.id)
    await page.mouse.move(point.x, point.y)
    await page.mouse.click(point.x, point.y, { button: 'right' })
    await settle()
    const labels = await page
      .getByRole('menu', { name: 'Edit' })
      .getByRole('menuitem')
      .allInnerTexts()
    report(
      'the edit menu lists "Tags to both sidewalks"',
      true,
      labels.some((label) => label.includes('Tags to both sidewalks')) || labels,
    )
    await page.screenshot({ path: 'reports/sidepaths-menu.png' })
    console.log('screenshot: reports/sidepaths-menu.png')
    await page.keyboard.press('Escape')
    await page.evaluate((id) => window.__maid.engine.setSelected([id]), BEBELPLATZ.id)
    await settle()

    const before = await tags(BEBELPLATZ.id)
    const selection = await page.evaluate(() => {
      const { engine, editor } = window.__maid
      const operation = editor
        .registry('edit.operation')
        .list()
        .find((o) => o.id === 'move-sidewalk-tags-both')!
      return engine.runOperation(operation) ?? null
    })
    await settle()
    const after = await tags(BEBELPLATZ.id)
    report(
      'both sides: the shared surface goes, the left one stays as its own key',
      [undefined, 'sett', 'separate'],
      [after['sidewalk:both:surface'], after['sidewalk:left:surface'], after['sidewalk:both']],
    )
    report('a tag stays on the road: the road stays selected', [BEBELPLATZ.id], selection)
    report(
      'now only the left side has a surface, and its sidewalk has another one',
      [{ id: 'move-sidewalk-tags-left', disabled: LEFT_DIFFERS }],
      await entries(),
    )
    await page.evaluate(() => window.__maid.engine.undo())
    await settle()
    report('undo restores the road', before, await tags(BEBELPLATZ.id))
  }),
)
