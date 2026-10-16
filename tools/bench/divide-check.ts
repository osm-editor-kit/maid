import { checkHelpers, moveToOpenGround } from './check-helpers'
import { app, runCheck } from './check-page'
/**
 * Divide check for the parking editor, with real key presses and mouse clicks: draws a four-cornered area, right-clicks it
 * and takes Divide, changes the columns and rows with the keys, and applies with Enter, which makes one undo step.
 * Then Escape changes nothing, and a five-cornered area is not offered Divide. After each step it checks the data, the
 * selection, the undo label and the preview's source on the map.
 *
 *   bun tools/bench/divide-check.ts small --app parking
 *
 * Needs two places with open ground in view: the small scene has them. Prints one line per check: `ok <check>`, or
 * `FAIL <check>` with expected and actual. Exits 1 on any failure, including a request outside localhost.
 * Expected: 24 `ok` lines.
 */

const sceneName = process.argv[2] ?? 'small'

type Corner = [number, number]
type WayState = { nodes: string[]; tags: Record<string, string> } | null

process.exit(
  await runCheck(sceneName, async ({ page, report, settle }) => {
    if (app !== 'parking') {
      report('the check runs on --app parking, where Divide is on', 'parking', app)
      return
    }
    const { click, key } = await checkHelpers(page, settle)
    // beside the scene's data: open ground for the drawings of this check
    await moveToOpenGround(page, settle, sceneName)

    // open ground for two areas: a rectangle of 120 x 80 px, and a five-cornered shape 260 px or more away from it
    const places = (await page.evaluate(() => {
      const { map } = window.__maid
      const { width, height } = map.getCanvas().getBoundingClientRect()
      const open = (p: [number, number]) =>
        map
          .queryRenderedFeatures([
            [p[0] - 14, p[1] - 14],
            [p[0] + 14, p[1] + 14],
          ])
          .every((f: any) => f.layer.type === 'fill')
      const rectangle = (x: number, y: number): [number, number][] => [
        [x - 60, y - 40],
        [x + 60, y - 40],
        [x + 60, y + 40],
        [x - 60, y + 40],
      ]
      const pentagon = (x: number, y: number): [number, number][] => [
        [x - 60, y - 40],
        [x + 60, y - 40],
        [x + 60, y + 40],
        [x, y + 70],
        [x - 60, y + 40],
      ]
      const centres: [number, number][] = []
      for (let y = 150; y < height - 150; y += 20)
        for (let x = 150; x < width - 150; x += 20) centres.push([x, y])
      const first = centres.find(([x, y]) => rectangle(x, y).every(open))
      const second =
        first &&
        centres.find(
          ([x, y]) => Math.hypot(x - first[0], y - first[1]) > 260 && pentagon(x, y).every(open),
        )
      if (!first || !second) return undefined
      return { area: rectangle(first[0], first[1]), pentagon: pentagon(second[0], second[1]) }
    })) as { area: Corner[]; pentagon: Corner[] } | undefined
    if (!places) {
      report('find open ground for a four-cornered and a five-cornered area', 'places', 'none')
      return
    }

    const wayOf = (id: string) =>
      page.evaluate((id) => {
        const way = window.__maid.engine.data.way(id)
        return way ? { nodes: [...way.nodes], tags: { ...way.tags } } : null
      }, id) as Promise<WayState>
    const undoLabel = () =>
      page.evaluate(() => window.__maid.engine.undoState().undoLabel ?? null) as Promise<
        string | null
      >
    const modeId = () =>
      page.evaluate(() => window.__maid.engine.moduleMode?.id ?? null) as Promise<string | null>
    const selection = () =>
      page.evaluate(() => [...window.__maid.engine.selection]) as Promise<string[]>
    // the source's own data: rendered features are cut at tile edges, so a part can come back twice
    const previewCount = () =>
      page.evaluate(async () => {
        const source = window.__maid.map.getSource('divide-preview') as
          | { getData: () => Promise<{ features?: unknown[] }> }
          | undefined
        return ((await source?.getData())?.features ?? []).length
      }) as Promise<number>
    const selectOne = async (id: string) => {
      await page.evaluate((id) => window.__bench.select(id), id)
      await settle()
    }

    /** Draws a closed area through the corners: key 3, a click on each corner, then the first corner again. Returns its id. */
    const drawArea = async (corners: Corner[]) => {
      await key('3')
      for (const [x, y] of corners) await click({ x, y })
      const [x, y] = corners[0]!
      await click({ x, y })
      const id = (await page.evaluate(() => window.__maid.engine.selection[0] ?? null)) as
        | string
        | null
      await key('Escape')
      if (id) await selectOne(id)
      return id
    }

    // the edit menu at the pointer, as in iD; a point a third of the way along the top edge, away from the corners
    const menu = page.getByRole('menu', { name: 'Edit' })
    const items = async () =>
      (await menu.getByRole('menuitem').allInnerTexts()).map((t) => t.split('\n')[0] ?? '')
    const rightClickEdge = async (corners: Corner[]) => {
      const [a, b] = [corners[0]!, corners[1]!]
      await click(
        { x: a[0] + (b[0] - a[0]) * 0.3, y: a[1] + (b[1] - a[1]) * 0.3 },
        { button: 'right' },
      )
    }

    // --- a four-cornered area: the menu offers Divide, the panel opens at 2 columns and 1 row ---
    const areaId = await drawArea(places.area)
    const area = areaId ? await wayOf(areaId) : null
    report(
      'the drawn area is closed with four corners',
      [5, true],
      area ? [area.nodes.length, area.nodes[0] === area.nodes[4]] : null,
    )
    if (!areaId || !area) return

    await rightClickEdge(places.area)
    report('the edit menu offers Divide for it', true, (await items()).includes('Divide'))
    const before = { undo: await undoLabel(), way: area }
    await menu.getByRole('menuitem', { name: 'Divide' }).click()
    await settle()

    const panel = page.locator('[data-divide-panel]')
    const columns = panel.getByRole('spinbutton', { name: 'Columns', exact: true })
    const rows = panel.getByRole('spinbutton', { name: 'Rows', exact: true })
    const numbers = async () => [await columns.inputValue(), await rows.inputValue()]
    report('Divide opens the panel at 2 columns and 1 row', ['2', '1'], await numbers())
    report('the panel says 2 parts', true, (await panel.innerText()).includes('2 parts'))
    report('the preview draws 2 parts', 2, await previewCount())
    report('the divide mode is on', 'divide-area', await modeId())

    // --- + adds a column, Shift with + adds a row; the data does not change before Apply ---
    await key('NumpadAdd')
    report('plus adds a column', ['3', '1'], await numbers())
    await key('NumpadAdd')
    report('a second plus makes 4 columns', ['4', '1'], await numbers())
    await key('Shift+NumpadAdd')
    report('Shift with plus adds a row: 4 by 2', ['4', '2'], await numbers())
    report('the panel says 8 parts', true, (await panel.innerText()).includes('8 parts'))
    report('the preview draws 8 parts', 8, await previewCount())
    report(
      'nothing is changed before Apply',
      { way: before.way, undo: before.undo },
      { way: await wayOf(areaId), undo: await undoLabel() },
    )

    // --- Enter applies: 8 closed parts sharing 15 grid nodes, all selected, one undo step ---
    await key('Enter')
    report('Enter applies, and the mode ends', null, await modeId())
    report('the undo step says what was made', 'Divided an area into 8 parts', await undoLabel())
    const parts = await selection()
    report('all eight parts are selected', 8, parts.length)
    const shapes = (await page.evaluate(
      (ids) =>
        ids.map((id) => {
          const way = window.__maid.engine.data.way(id)
          return way ? [...way.nodes] : null
        }),
      parts,
    )) as (string[] | null)[]
    report(
      'each part is a closed way of four corners',
      8,
      shapes.filter((n) => n?.length === 5 && n[0] === n[4] && new Set(n.slice(0, 4)).size === 4)
        .length,
    )
    report(
      'the parts share their grid nodes: 15 in all',
      15,
      new Set(shapes.flatMap((n) => n ?? [])).size,
    )
    report('the first part keeps the id of the area', true, parts.includes(areaId))

    // --- one undo restores the single area ---
    await page.evaluate(() => window.__maid.engine.undo())
    await settle()
    const restored = await wayOf(areaId)
    const otherParts = await page.evaluate(
      (ids) => ids.filter((id) => window.__maid.engine.data.way(id) !== undefined).length,
      parts.filter((id) => id !== areaId),
    )
    report(
      'one undo restores the single area',
      [true, 0],
      [JSON.stringify(restored?.nodes) === JSON.stringify(before.way?.nodes), otherParts],
    )

    // --- Escape ends the panel and changes nothing ---
    await selectOne(areaId)
    const undoBeforeEscape = await undoLabel()
    await rightClickEdge(places.area)
    await menu.getByRole('menuitem', { name: 'Divide' }).click()
    await settle()
    await key('NumpadAdd')
    await key('Escape')
    report(
      'Escape ends the panel and changes nothing',
      [null, undoBeforeEscape, true],
      [
        await modeId(),
        await undoLabel(),
        JSON.stringify((await wayOf(areaId))?.nodes) === JSON.stringify(before.way?.nodes),
      ],
    )

    // --- a five-cornered area is not offered Divide ---
    const fiveId = await drawArea(places.pentagon)
    const five = fiveId ? await wayOf(fiveId) : null
    report('the five-cornered area is closed with six nodes', 6, five?.nodes.length)
    await rightClickEdge(places.pentagon)
    report('a five-cornered area is not offered Divide', false, (await items()).includes('Divide'))
    await key('Escape')
  }),
)
