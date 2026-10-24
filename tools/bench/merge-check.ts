/**
 * Merge check for the parking editor (`--app parking`), with real key presses and mouse clicks: two overlapping
 * four-corner areas drawn with the Area tool; the edit menu offers Merge disabled with the sentence for different
 * tags, and C changes nothing; the tags agree again, C merges them into one outline with eight corners (two of them
 * new, where the outlines cross), one undo step restores both, redo merges again; a line and an area: no Merge.
 * Plan: docs/research/drawing-tools/3-merge-areas.md. Fixtures only, nothing leaves localhost.
 *
 *   bun tools/bench/merge-check.ts small --app parking
 *
 * Prints one line per check: `ok <check>`, or `FAIL <check>` with expected and actual. Exits 1 on any failure.
 */
import { checkHelpers, type XY, moveToOpenGround } from './check-helpers'
import { runCheck } from './check-page'

const sceneName = process.argv[2] ?? 'small'

type WayData = { nodes: string[]; tags: Record<string, string> } | null

process.exit(
  await runCheck(sceneName, async ({ page, report, settle }) => {
    const { click, key, state, selection, where, near } = await checkHelpers(page, settle)
    // beside the scene's data: open ground for the drawings of this check
    await moveToOpenGround(page, settle, sceneName)

    // open ground for two areas side by side and a line to their right: no line, point or label in the box
    const spot = (await page.evaluate(() => {
      const { map } = window.__maid
      const { width, height } = map.getCanvas().getBoundingClientRect()
      const W = 300
      const H = 200
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
      report('find open ground for two areas and a line', 'a place', null)
      return
    }
    const at = (dx: number, dy: number): XY => ({ x: spot.x + dx, y: spot.y + dy })
    // square A: 120 px; square B: 120 px, offset by 60 px in both directions, so B's first corner lies inside A
    const cornersA = [at(0, 0), at(120, 0), at(120, 120), at(0, 120)]
    const cornersB = [at(60, 60), at(180, 60), at(180, 180), at(60, 180)]
    // the crossings of the two outlines, where the merged outline gets its new corners
    const crossings = [at(120, 60), at(60, 120)]
    // points on the outlines that no other outline is near
    const topOfA = at(60, 0)
    const rightOfB = at(180, 120)
    const lineFrom = at(210, 40)
    const lineTo = at(270, 40)

    const wayOf = (id: string) =>
      page.evaluate((id) => {
        const way = window.__maid.engine.data.way(id)
        return way ? { nodes: [...way.nodes], tags: { ...way.tags } } : null
      }, id) as Promise<WayData>
    const nodeIsThere = (id: string) =>
      page.evaluate((id) => window.__maid.engine.data.node(id) !== undefined, id)

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
    const idA = await drawArea(cornersA)
    const idB = await drawArea(cornersB)
    const a0 = await wayOf(idA)
    const b0 = await wayOf(idB)
    report(
      'area A: closed way with four corners',
      [5, true],
      [a0?.nodes.length, a0?.nodes[0] === a0?.nodes.at(-1)],
    )
    report('area A: tagged area=yes only', { area: 'yes' }, a0?.tags)
    report(
      'area B: closed way with four corners',
      [5, true],
      [b0?.nodes.length, b0?.nodes[0] === b0?.nodes.at(-1)],
    )
    report('area B: tagged area=yes only', { area: 'yes' }, b0?.tags)

    // the two areas, selected: the first by a click on its outline, the second with Shift
    const both = [idA, idB].sort()
    const selectBoth = async () => {
      await click(topOfA)
      await click(rightOfB, { shift: true })
    }
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
    const mergeItems = async () => (await menuItems()).filter((item) => item.label === 'Merge')

    // --- different tags: the menu says why, and C changes nothing ---
    await page.evaluate(
      ([a, b]) => {
        window.__maid.engine.changeTags([a!], { set: { building: 'yes' } }, 'Setup')
        window.__maid.engine.changeTags([b!], { set: { building: 'house' } }, 'Setup')
      },
      [idA, idB],
    )
    await selectBoth()
    report('two areas selected', both, (await selection()).sort())
    await click(rightOfB, { button: 'right' })
    const offered = await mergeItems()
    report('the edit menu offers one Merge', 1, offered.length)
    report(
      'Merge is disabled, with the sentence about the tags',
      { disabled: true, title: 'These areas have different tags.' },
      { disabled: offered[0]?.disabled, title: offered[0]?.title },
    )
    await key('Escape')
    report(
      'Escape closes the menu and keeps both areas selected',
      [0, both],
      [await menu.count(), (await selection()).sort()],
    )
    const beforeC = await state()
    const snapA = await wayOf(idA)
    const snapB = await wayOf(idB)
    await key('c')
    report(
      'C with different tags: no undo step, both areas unchanged',
      [beforeC.undo, snapA, snapB],
      [(await state()).undo, await wayOf(idA), await wayOf(idB)],
    )
    // the two changes of the tags are the two undo steps: undo them, the tags agree again
    await key('Meta+z')
    await key('Meta+z')
    report(
      'undo of the tag changes: both areas have their tags again',
      [{ area: 'yes' }, { area: 'yes' }],
      [(await wayOf(idA))?.tags, (await wayOf(idB))?.tags],
    )

    // --- an untagged area and a tagged one: they merge, the tagged one survives with its tags ---
    await page.evaluate((id) => {
      window.__maid.engine.changeTags([id], { set: { building: 'house' } }, 'Setup')
    }, idB)
    await selectBoth()
    await key('c')
    report(
      'C with one untagged area: the tagged area survives, selected, with its tags',
      [[idB], null, 'house'],
      [await selection(), await wayOf(idA), (await wayOf(idB))?.tags.building],
    )
    await key('Meta+z')
    await key('Meta+z')
    report(
      'undo of the merge and the tag change: both areas are back as before',
      [{ area: 'yes' }, { area: 'yes' }],
      [(await wayOf(idA))?.tags, (await wayOf(idB))?.tags],
    )

    // --- the same two areas: one outline, one undo step, redo ---
    await selectBoth()
    report('two areas selected again', both, (await selection()).sort())
    const beforeMerge = { a: await wayOf(idA), b: await wayOf(idB) }
    await key('c')
    const selected = await selection()
    const survivor = selected[0] ?? ''
    const loser = survivor === idA ? idB : idA
    report('C: the other area is gone', true, (await wayOf(loser)) === null)
    report(
      'C: the survivor is one of the two areas and is selected alone',
      [true, [survivor]],
      [[idA, idB].includes(survivor), selected],
    )
    const merged = await wayOf(survivor)
    // the closing node repeats the first one, so the corners are the nodes without it
    const corners = (merged?.nodes ?? []).slice(0, -1)
    const originals = new Set([...(beforeMerge.a?.nodes ?? []), ...(beforeMerge.b?.nodes ?? [])])
    report('outline: eight corners', 8, new Set(corners).size)
    const added = corners.filter((id) => !originals.has(id))
    report('outline: two new corners', 2, added.length)
    const addedAt = await where(added)
    report(
      'the new corners sit where the outlines cross',
      [true, true],
      crossings.map((p) => addedAt.some((q) => near(q, p, 3))),
    )
    report(
      'outline: the six other corners are kept',
      6,
      corners.filter((id) => originals.has(id)).length,
    )
    report(
      'the two corners inside the other area are deleted',
      [false, false],
      [
        await nodeIsThere(beforeMerge.a?.nodes[2] ?? ''),
        await nodeIsThere(beforeMerge.b?.nodes[0] ?? ''),
      ],
    )
    report('C: undo label', 'Merged two areas', (await state()).undo)

    await key('Meta+z')
    report(
      'undo: both areas are back with their own corners',
      [beforeMerge.a, beforeMerge.b],
      [await wayOf(idA), await wayOf(idB)],
    )
    report(
      'undo: the undo label is the step before the merge',
      'Added an area',
      (await state()).undo,
    )
    await key('Meta+Shift+Z')
    report(
      'redo: one area again, the other gone',
      true,
      (await wayOf(loser)) === null && (await wayOf(survivor)) !== null,
    )
    report('redo: the undo label is the merge', 'Merged two areas', (await state()).undo)

    // --- a line and an area: Merge is not offered ---
    await key('2')
    await click(lineFrom)
    await click(lineTo)
    await key('Enter')
    const lineId = (await selection())[0] ?? ''
    await key('Escape')
    const line = await wayOf(lineId)
    report('line: a new way with two nodes', 2, line?.nodes.length)
    const [p1, p2] = await where(line?.nodes ?? [])
    report('line: its nodes are on the map', true, !!p1 && !!p2)
    const lineMid = { x: ((p1?.x ?? 0) + (p2?.x ?? 0)) / 2, y: ((p1?.y ?? 0) + (p2?.y ?? 0)) / 2 }
    await click(topOfA)
    await click(lineMid, { shift: true })
    report('a line and an area selected', [lineId, survivor].sort(), (await selection()).sort())
    await click(topOfA, { button: 'right' })
    report('line and area: the edit menu has no Merge', 0, (await mergeItems()).length)
    await key('Escape')
    const beforeLineC = (await state()).undo
    await key('c')
    report('C with a line and an area: nothing changes', beforeLineC, (await state()).undo)
  }),
)
