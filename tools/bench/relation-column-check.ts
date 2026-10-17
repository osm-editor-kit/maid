/**
 * Check of the relation column, with real clicks: a road of a bus route is selected, "Open" on the route in the
 * inspector's Relations section opens the column beside the inspector and keeps the road selected. A member row selects
 * that member and the column stays; the inspector lists no members while the column shows them. The column's head
 * selects the relation itself. "Fly to" moves the map to a member that is out of view. A feature that is not a member
 * gets the hint and "Add it" (one undo step). Dragging a way's handle above the one before it, and Alt+ArrowUp on
 * the handle, reorder the members: one edit and one undo step each. The head's close button, the "Open" button of the Members section and
 * Escape close and open it.
 *
 *   bun tools/bench/relation-column-check.ts [scene] [--app maid|bicycle|parking]
 *
 * Needs `bun run dev`. Runs on the relations scene (Köpenick): Müggelheimer Straße (w4875990) is a member of
 * Bus 162 (r6783678).
 */
import { runCheck } from './check-page'

const ROAD = 'w4875990'
const ROUTE = 'r6783678'
const ROUTE_NAME = 'Bus 162: U Rudow => Schloßplatz Köpenick'

const sceneName = process.argv[2] ?? 'relations'

const failed = await runCheck(sceneName, async ({ page, report, settle }) => {
  const column = page.getByRole('complementary', { name: 'Relation', exact: true })
  const inspector = page.getByRole('complementary', { name: 'Selected feature', exact: true })
  const selectedId = () => page.evaluate(() => new URL(location.href).searchParams.get('id'))
  const select = async (id: string) => {
    await page.evaluate((id) => {
      const url = new URL(location.href)
      url.searchParams.set('id', id)
      history.pushState(null, '', url)
      window.dispatchEvent(new PopStateEvent('popstate'))
    }, id)
    await settle()
  }
  const row = (id: string) => column.locator(`li[data-row="${id}"]`)

  // --- the road: "Open" on its bus route opens the column, the road stays selected ---
  await select(ROAD)
  await inspector.getByText('Relations', { exact: true }).click()
  await settle()
  await inspector
    .getByRole('button', { name: `Open ${ROUTE_NAME} beside the inspector`, exact: true })
    .click()
  await settle()
  // the column's code is a chunk of its own: its rows come once it is loaded
  await row(ROAD)
    .waitFor({ timeout: 5000 })
    .catch(() => undefined)
  report('"Open" shows the relation column', 1, await column.count())
  report('the road stays selected', ROAD, await selectedId())
  report('the road has its row in the column', 1, await row(ROAD).count())
  report(
    'the route\'s card in the inspector now offers "Close"',
    1,
    await inspector.getByRole('button', { name: 'Close the relation', exact: true }).count(),
  )

  // --- another member: its row selects it, the column stays ---
  const other = await page.evaluate(
    ({ road, route }) => {
      const graph = window.__maid.editor.history.staging.graph
      const relation = window.__maid.engine.data.relation(route)
      return relation?.members.find(
        (m) => m.type === 'way' && m.id !== road && graph.hasEntity(m.id),
      )?.id
    },
    { road: ROAD, route: ROUTE },
  )
  report('the route has another loaded way', true, other !== undefined)
  if (!other) return
  // into the middle of the list: the stacked group headings cover its top
  await row(other).evaluate((li) => {
    const list = li.closest('[data-stack-scroll]')
    if (list)
      list.scrollTop +=
        li.getBoundingClientRect().top - list.getBoundingClientRect().top - list.clientHeight / 2
  })
  await row(other).locator('button').first().click()
  await settle()
  report('a member row selects that member', other, await selectedId())
  report('the column stays open', 1, await column.count())

  // --- the head selects the relation; the inspector then lists no members ---
  await column.getByTitle('Show the tags of the relation', { exact: true }).click()
  await settle()
  report('the head selects the relation itself', ROUTE, await selectedId())
  report(
    'the inspector has no Members section while the column lists them',
    0,
    // the section's heading; the Element group's "Members" count row stays
    await inspector
      .locator('[data-stack-heading] button[aria-controls]', { hasText: /^Members/ })
      .count(),
  )

  // --- Fly to: a member out of view gets the button, and the map moves to it ---
  const fly = column.getByRole('button', { name: /^Fly to / }).first()
  report('a member out of view has a "Fly to" button', true, (await fly.count()) > 0)
  if ((await fly.count()) > 0) {
    const target = await fly.evaluate((button) => button.closest('li')?.dataset.row ?? '')
    await fly.click()
    await page.waitForTimeout(700)
    await settle()
    report(
      'after "Fly to" the member is in view',
      true,
      await page.evaluate((id) => window.__maid.engine.inView([id]), target),
    )
  }

  // --- a feature that is not a member: the hint, and "Add it" as one undo step ---
  const stranger = await page.evaluate((route) => {
    const { map, editor } = window.__maid
    const graph = editor.history.staging.graph
    const members = new Set(window.__maid.engine.data.relation(route)?.members.map((m) => m.id))
    for (const f of map.queryRenderedFeatures()) {
      const id = String(f.id ?? '')
      if (id.startsWith('w') && graph.hasEntity(id)?.tags.highway && !members.has(id)) return id
    }
    return undefined
  }, ROUTE)
  report('the view has a road that is not in the route', true, stranger !== undefined)
  if (stranger) {
    const count = () =>
      page.evaluate(
        (route) => window.__maid.engine.data.relation(route)?.members.length ?? -1,
        ROUTE,
      )
    const before = await count()
    await select(stranger)
    report(
      'the column says the feature is not in the relation',
      1,
      await column.getByText('is not in this relation', { exact: false }).count(),
    )
    await column.getByRole('button', { name: 'Add it', exact: true }).click()
    await settle()
    report('"Add it" adds one member', before + 1, await count())
    report('the added road now has its row', 1, await row(stranger).count())
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z')
    await settle()
    report('one undo takes it out again', before, await count())
  }

  // --- reordering: dragging the handle of the second way above the first is one edit and one undo step ---
  await select(ROUTE)
  const order = () =>
    page.evaluate(
      (route) => window.__maid.engine.data.relation(route)?.members.map((m) => m.id) ?? [],
      ROUTE,
    )
  const waysInColumn = () =>
    column
      .locator('ul')
      .filter({ has: page.locator('li[data-row]') })
      .nth(1)
      .locator('li[data-row]')
      .evaluateAll((items) => items.map((li) => (li as HTMLElement).dataset.row ?? ''))
  const ways = await waysInColumn()
  report('the route has at least two ways in the column', true, ways.length >= 2)
  if (ways.length >= 2) {
    const [first, second] = ways as [string, string]
    const before = await order()
    const handleOf = (id: string) => row(id).getByRole('button', { name: /^Drag .* to reorder$/ })
    // both rows in the middle of the list (the stacked headings cover its top), then measured where they are
    await row(first).evaluate((li) => {
      const list = li.closest('[data-stack-scroll]')
      if (list)
        list.scrollTop +=
          li.getBoundingClientRect().top - list.getBoundingClientRect().top - list.clientHeight / 2
    })
    await row(second).hover()
    const from = await handleOf(second).boundingBox()
    const to = await row(first).boundingBox()
    report('the second way has a drag handle', true, from !== null && to !== null)
    if (from && to) {
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
      await page.mouse.down()
      await page.mouse.move(from.x + from.width / 2, from.y - 4, { steps: 4 })
      await page.mouse.move(from.x + from.width / 2, to.y + 4, { steps: 10 })
      await page.mouse.up()
      await settle()
      const after = await order()
      report(
        'after the drop the second way comes before the first',
        true,
        after.indexOf(second) < after.indexOf(first),
      )
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z')
      await settle()
      report('one undo restores the order', before, await order())
    }
    // the keyboard: Alt+ArrowUp on the handle moves a way one place, and the handle keeps the focus
    const handle = row(second).getByRole('button', { name: /^Drag .* to reorder$/ })
    await handle.focus()
    const beforeKeys = await order()
    await page.keyboard.press('Alt+ArrowUp')
    await settle()
    const afterKeys = await order()
    report(
      'Alt+ArrowUp moves the way one place up',
      true,
      afterKeys.indexOf(second) < beforeKeys.indexOf(second),
    )
    report(
      "the moved way's handle keeps the focus",
      true,
      await page.evaluate(
        (id) => document.activeElement?.closest('li')?.dataset.row === id,
        second,
      ),
    )
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z')
    await settle()
    report('one undo restores the order after the key', beforeKeys, await order())
  }

  // --- removing: the trash of a row takes the member out, one undo step puts it back ---
  {
    await select(ROUTE)
    const members = () =>
      page.evaluate(
        (route) => window.__maid.engine.data.relation(route)?.members.length ?? -1,
        ROUTE,
      )
    const before = await members()
    const target = row(ROAD)
    await target.evaluate((li) => {
      const list = li.closest('[data-stack-scroll]')
      if (list)
        list.scrollTop +=
          li.getBoundingClientRect().top - list.getBoundingClientRect().top - list.clientHeight / 2
    })
    await target.hover()
    await target.getByRole('button', { name: /^Remove .* from the relation$/ }).click()
    await settle()
    report('the trash takes the member out', before - 1, await members())
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z')
    await settle()
    report('one undo puts it back', before, await members())
  }

  // --- a relation that holds this one is not offered: it would contain itself ---
  {
    const parent = await page.evaluate((route) => {
      const graph = window.__maid.editor.history.staging.graph
      const relation = graph.hasEntity(route)
      return relation ? graph.parentRelations(relation)[0]?.id : undefined
    }, ROUTE)
    if (parent) {
      await select(parent)
      // the parent is now the open one: open the route again beside it
      await page.evaluate((route) => {
        const url = new URL(location.href)
        url.searchParams.set('relation', route)
        history.pushState(null, '', url)
        window.dispatchEvent(new PopStateEvent('popstate'))
      }, ROUTE)
      await settle()
      report(
        'with its route master selected, the route says it would contain itself and offers no "Add it"',
        [1, 0],
        [
          await column.getByText('would then contain itself', { exact: false }).count(),
          await column.getByRole('button', { name: 'Add it', exact: true }).count(),
        ],
      )
    }
  }

  // --- closing: the head's button, then "Open" in the Members section, then Escape ---
  await select(ROUTE)
  await column.getByRole('button', { name: 'Close the relation', exact: true }).click()
  await settle()
  report('the close button closes the column', 0, await column.count())
  report('the relation stays selected', ROUTE, await selectedId())
  await inspector
    .getByRole('button', { name: `Open ${ROUTE_NAME} beside the inspector`, exact: true })
    .click()
  await settle()
  report('"Open" in the Members section opens it again', 1, await column.count())
  await page.locator('canvas').first().focus()
  await page.keyboard.press('Escape')
  await settle()
  report(
    'Escape ends the selection and closes the column',
    [null, 0],
    [await selectedId(), await column.count()],
  )
})

process.exit(failed ? 1 : 0)
