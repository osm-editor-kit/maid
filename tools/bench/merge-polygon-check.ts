/**
 * Merge into a multipolygon (C) with real key presses and mouse clicks, as iD makes one: an outer area and an inner
 * area inside it, both drawn with the Area tool (key 3). Shift-click selects both, the edit menu offers one Merge that
 * is enabled, and C makes one `type=multipolygon` relation: the outer way's tags move to it and the way is left
 * untagged, the inner way gets the role `inner` and no tags (its area=yes was the only tag), and the selection is the
 * two ways, as iD selects them. One undo step takes both back, redo makes the relation again. The same runs in the
 * parking app: its union does not take a nested area, so the core Merge does it there too.
 * Plan: docs/research/drawing-tools/6-merge-to-multipolygon.md. Fixtures only, nothing leaves localhost.
 *
 *   bun tools/bench/merge-polygon-check.ts small --app maid
 *   bun tools/bench/merge-polygon-check.ts small --app parking
 *
 * Prints one line per check: `ok <check>`, or `FAIL <check>` with expected and actual. Exits 1 on any failure.
 */
import { checkHelpers, type XY, moveToOpenGround } from './check-helpers'
import { runCheck } from './check-page'

const sceneName = process.argv[2] ?? 'small'

type WayData = { nodes: string[]; tags: Record<string, string> } | null
type RelationData = {
  id: string
  tags: Record<string, string>
  members: { id: string; type: string; role: string }[]
} | null

process.exit(
  await runCheck(sceneName, async ({ page, report, settle }) => {
    const { click, key, state, selection } = await checkHelpers(page, settle)
    // beside the scene's data: open ground for the drawings of this check
    await moveToOpenGround(page, settle, sceneName)

    // open ground for the outer area and the inner one: no line, point or label in the box
    const spot = (await page.evaluate(() => {
      const { map } = window.__maid
      const { width, height } = map.getCanvas().getBoundingClientRect()
      const W = 260
      const H = 260
      for (let y = 100; y < height - H - 100; y += 10)
        for (let x = 100; x < width - W - 100; x += 10) {
          const hits = map.queryRenderedFeatures([
            [x - 14, y - 14],
            [x + W + 14, y + H + 14],
          ])
          if (hits.every((f: any) => f.layer.type === 'fill')) return { x, y }
        }
      return null
    })) as XY | null
    if (!spot) {
      report('find open ground for an outer and an inner area', 'a place', null)
      return
    }
    const at = (dx: number, dy: number): XY => ({ x: spot.x + dx, y: spot.y + dy })
    // the outer square is 200 px; the inner one is 80 px, well inside it and not touching its outline
    const outerCorners = [at(0, 0), at(200, 0), at(200, 200), at(0, 200)]
    const innerCorners = [at(60, 60), at(140, 60), at(140, 140), at(60, 140)]
    // points on the outlines, for the clicks that select: the top edges, away from the other outline
    const topOfOuter = at(100, 0)
    const topOfInner = at(100, 60)

    const wayOf = (id: string) =>
      page.evaluate((id) => {
        const way = window.__maid.engine.data.way(id)
        return way ? { nodes: [...way.nodes], tags: { ...way.tags } } : null
      }, id) as Promise<WayData>
    /** The multipolygon that holds the way, read from the editor's head graph: null when none does */
    const relationOf = (wayId: string) =>
      page.evaluate((wayId) => {
        const { editor, engine } = window.__maid
        const graph = editor.history.staging.graph
        const way = engine.data.way(wayId)
        if (!way) return null
        const [relation] = graph.parentRelations(way)
        if (!relation) return null
        return {
          id: relation.id,
          tags: { ...relation.tags },
          members: relation.members.map((m: any) => ({ id: m.id, type: m.type, role: m.role })),
        }
      }, wayId) as Promise<RelationData>

    /** Draws an area with the Area tool: four corners, then a click on the first one closes it. Returns its id. */
    const drawArea = async (corners: XY[]) => {
      await key('3')
      for (const p of corners) await click(p)
      await click(corners[0]!)
      // the finished area is selected; Escape then leaves the type picker and the selection
      const id = (await selection())[0] ?? ''
      await key('Escape')
      return id
    }
    const outer = await drawArea(outerCorners)
    const inner = await drawArea(innerCorners)
    const o0 = await wayOf(outer)
    const i0 = await wayOf(inner)
    report(
      'outer area: closed way with four corners',
      [5, true],
      [o0?.nodes.length, o0?.nodes[0] === o0?.nodes.at(-1)],
    )
    report('outer area: tagged area=yes only', { area: 'yes' }, o0?.tags)
    report(
      'inner area: closed way with four corners',
      [5, true],
      [i0?.nodes.length, i0?.nodes[0] === i0?.nodes.at(-1)],
    )
    report('inner area: tagged area=yes only', { area: 'yes' }, i0?.tags)

    // the outer area is a building, so its tags move to the relation
    await page.evaluate((id) => {
      window.__maid.engine.changeTags([id], { set: { building: 'yes' } }, 'Setup')
    }, outer)

    // the two areas, selected: the outer by a click on its outline, the inner with Shift
    const both = [outer, inner].sort()
    await click(topOfOuter)
    await click(topOfInner, { shift: true })
    report('two areas selected', both, (await selection()).sort())

    /** The items of the open edit menu: label, whether disabled, and the reason in its title */
    const menu = page.getByRole('menu', { name: 'Edit' })
    const menuItems = async () => {
      const items = []
      for (const item of await menu.getByRole('menuitem').all()) {
        items.push({
          label: ((await item.innerText()).split('\n')[0] ?? '').trim(),
          disabled: (await item.getAttribute('disabled')) !== null,
          title: await item.getAttribute('title'),
        })
      }
      return items
    }
    await click(topOfInner, { button: 'right' })
    const offered = (await menuItems()).filter((item) => item.label === 'Merge')
    report(
      'the edit menu offers one Merge, enabled',
      [1, false],
      [offered.length, offered[0]?.disabled],
    )
    await key('Escape')
    report('Escape closes the menu and keeps both areas selected', both, (await selection()).sort())

    // --- C: one multipolygon ---
    const beforeC = await state()
    await key('c')
    const relation = await relationOf(outer)
    report('C: the outer area is in one relation', true, relation !== null)
    report(
      'C: the relation is a multipolygon with the outer tags, and no area tag',
      { type: 'multipolygon', building: 'yes' },
      relation?.tags,
    )
    report(
      'C: outer is the role outer, inner the role inner, in that order',
      [
        { id: outer, type: 'way', role: 'outer' },
        { id: inner, type: 'way', role: 'inner' },
      ],
      relation?.members.filter((m) => m.id === outer || m.id === inner),
    )
    report('C: the relation has two members and no others', 2, relation?.members.length)
    report('C: the outer way has no tags of its own', {}, (await wayOf(outer))?.tags)
    report(
      'C: the inner way has no tags (its area=yes was the only tag)',
      {},
      (await wayOf(inner))?.tags,
    )
    report('C: the selection is the two ways, as iD selects them', both, (await selection()).sort())
    report('C: undo label', 'Merged 2 features.', (await state()).undo)

    // --- one undo: both areas back with their own tags, no relation ---
    await key('Meta+z')
    report(
      'undo: the outer area has its tags again',
      { area: 'yes', building: 'yes' },
      (await wayOf(outer))?.tags,
    )
    report('undo: the inner area has its tag again', { area: 'yes' }, (await wayOf(inner))?.tags)
    report('undo: no relation holds the outer area', null, await relationOf(outer))
    report('undo: the undo label is the one before the merge', beforeC.undo, (await state()).undo)

    // --- redo: the relation again ---
    await key('Meta+Shift+Z')
    // redo runs the same action again: the relation may get a new id, so only its type and members are compared
    const again = await relationOf(outer)
    report(
      'redo: the relation again, a multipolygon with its two members',
      ['multipolygon', 2],
      [again?.tags.type, again?.members.length],
    )
    report('redo: the undo label is the merge', 'Merged 2 features.', (await state()).undo)
    report('redo: the inner way has no tags', {}, (await wayOf(inner))?.tags)
  }),
)
