/**
 * Check of the route overview in the relation column, with real input: a bus route shows its stops and platforms in
 * travel order and no junction rows; the spacing toggle switches to "To scale" and back; the pointer on a row lights
 * the member on the map, and a member hovered on the map lights its row; a click on a row selects the member; an (i)
 * button opens its note and Escape closes it. A hiking route folds its junctions without a guidepost into rows that
 * open and close, with a note that this is no error, and has a group of members that are not loaded, which opens to list them. Its preview (the mock's Postpass fixture) loads on a press, mutes its rows, draws
 * on the map, reloads, comes back from the cache without a request, and a click on a preview row loads the member.
 *
 *   bun tools/bench/route-overview-check.ts [scene] [--app maid|bicycle|parking]
 *
 * Needs `bun run dev`. Runs on the relations scene (Köpenick): Bus 162 (r6783678) and the Müggel-Spree-Weg (r3001299).
 */
import { runCheck } from './check-page'

const BUS = 'r6783678'
const HIKING = 'r3001299'
/** Bus N65, a route_master with its two directions */
const MASTER = 'r17822'

const sceneName = process.argv[2] ?? 'relations'

type MaidWindow = {
  __maid: { engine: { setHover(id: string | null): void; hoverTarget(): string | null } }
}

const failed = await runCheck(
  sceneName,
  async ({ page, report, settle }) => {
    const column = page.getByRole('complementary', { name: 'Relation', exact: true })
    const overview = column.getByRole('region', { name: 'Route overview', exact: true })
    const rows = overview.locator('[data-row-key]')
    const keys = () =>
      rows.evaluateAll((all) => all.map((row) => row.getAttribute('data-row-key') ?? ''))
    const open = async (id: string) => {
      await page.evaluate((id) => {
        const url = new URL(location.href)
        url.searchParams.set('id', id)
        url.searchParams.set('relation', id)
        history.pushState(null, '', url)
        window.dispatchEvent(new PopStateEvent('popstate'))
      }, id)
      await settle()
      await overview.waitFor({ timeout: 8000 }).catch(() => undefined)
    }

    // --- a bus route: stops and platforms in order, no junctions ---
    await open(BUS)
    report('the bus route has its overview', 1, await overview.count())
    const busKeys = await keys()
    report('the overview starts with the start row', 'start', busKeys[0])
    report(
      'a bus route has no junction rows',
      0,
      busKeys.filter((key) => key.startsWith('junction:')).length,
    )
    report(
      'stops and platforms have rows',
      true,
      busKeys.filter((key) => key.startsWith('point:')).length >= 2,
    )

    // --- the spacing toggle ---
    const scaled = overview.getByRole('button', { name: 'To scale', exact: true })
    const schematic = overview.getByRole('button', { name: 'Schematic', exact: true })
    report('schematic is the default', 'true', await schematic.getAttribute('aria-pressed'))
    const lastTop = () =>
      rows.evaluateAll((all) => Math.max(...all.map((row) => (row as HTMLElement).offsetTop)))
    const before = await lastTop()
    await scaled.click()
    report('"To scale" is pressed after a click', 'true', await scaled.getAttribute('aria-pressed'))
    report('"To scale" moves the rows', true, (await lastTop()) !== before)
    await schematic.click()
    report('"Schematic" brings the rows back', before, await lastTop())

    // --- hover: row to map, map to row ---
    const stopKey = busKeys.find((key) => key.startsWith('point:')) ?? ''
    const stopRow = overview.locator(`[data-row-key="${stopKey}"]`)
    const stopId = await page.evaluate(
      ([relationId, key]) => {
        const maid = (
          window as unknown as {
            __maid: {
              editor: {
                history: {
                  staging: { graph: { entity(id: string): { members: { id: string }[] } } }
                }
              }
            }
          }
        ).__maid
        const index = Number(key?.split(':')[1])
        return maid.editor.history.staging.graph.entity(relationId ?? '').members[index]?.id ?? ''
      },
      [BUS, stopKey],
    )
    await stopRow.hover()
    report(
      'the pointer on a stop row hovers the stop on the map',
      stopId,
      await page.evaluate(() => (window as unknown as MaidWindow).__maid.engine.hoverTarget()),
    )
    await page.mouse.move(5, 5)
    await page.evaluate(
      (id) => (window as unknown as MaidWindow).__maid.engine.setHover(id),
      stopId,
    )
    report(
      'a stop hovered on the map lights its row',
      'true',
      await stopRow.getAttribute('data-lit'),
    )
    await page.evaluate(() => (window as unknown as MaidWindow).__maid.engine.setHover(null))
    report('the row goes dark again', null, await stopRow.getAttribute('data-lit'))

    // --- a click selects the member ---
    await stopRow.getByRole('button').first().click()
    await settle()
    report(
      'a click on the row selects the stop',
      stopId,
      await page.evaluate(() => new URL(location.href).searchParams.get('id')),
    )
    report(
      'the column keeps its scroll: the diagram stays in view',
      0,
      await column.locator('[data-stack-scroll]').evaluate((list) => list.scrollTop),
    )

    // --- an (i) note opens and closes ---
    const note = overview.locator('[data-issue-button]').first()
    report(
      'the overview has at least one (i) note',
      true,
      (await overview.locator('[data-issue-button]').count()) > 0,
    )
    await note.click()
    report('the (i) button opens its note', 1, await overview.getByRole('dialog').count())
    await page.keyboard.press('Escape')
    report('Escape closes the note', 0, await overview.getByRole('dialog').count())
    report(
      'the focus goes back to the (i) button',
      true,
      await note.evaluate((button) => button === document.activeElement),
    )
    report(
      'the note is not inside the list',
      0,
      await overview.getByRole('list').getByRole('dialog').count(),
    )
    await note.click()
    const hasWarningOrNote = /: (warning|note), /.test(
      (await note.getAttribute('aria-label')) ?? '',
    )
    report('the (i) button names warning or note', true, hasWarningOrNote)

    // --- the fold button, then another relation starts fresh ---
    const fold = overview.getByRole('button', { name: 'Route overview', exact: true })
    await fold.click()
    report('the fold button hides the line', 0, await rows.count())
    await fold.click()
    report('and shows it again', true, (await rows.count()) > 0)

    // --- a hiking route: junctions and the members that are not loaded ---
    await note.click()
    await open(HIKING)
    report(
      'a note open on the bus route is not open on the next route',
      0,
      await overview.getByRole('dialog').count(),
    )
    const hikingKeys = await keys()
    report(
      'the line rows come first, the groups below them',
      false,
      hikingKeys.some((key) => key.startsWith('unplaced:')),
    )
    // junctions without a guidepost one after another are one folded row, not hundreds of rows
    const folds = hikingKeys.filter((key) => key.startsWith('junctions:'))
    report('the hiking route folds its junctions without a guidepost', true, folds.length > 0)
    report(
      'no single junction row of a folded run is shown',
      false,
      hikingKeys.some((key) => key === `junction:${folds[0]?.slice('junctions:'.length)}`),
    )
    const foldRow = overview.locator(`[data-row-key="${folds[0]}"]`)
    await foldRow.hover()
    report(
      'a row without a single member lights while the pointer is on it',
      'true',
      await foldRow.getAttribute('data-lit'),
    )
    const foldButton = foldRow.getByRole('button', {
      name: /^\d+ junctions with no guidepost in the relation$/,
    })
    const count = Number(((await foldButton.innerText()).match(/^\d+/) ?? ['0'])[0])
    report('the fold says how many junctions it holds', true, count >= 2)
    report('the fold is closed', 'false', await foldButton.getAttribute('aria-expanded'))
    await foldButton.click()
    const openKeys = await keys()
    const at = openKeys.indexOf(folds[0] ?? '')
    report(
      'a click opens it: its junction rows follow it',
      Array(count).fill(true),
      openKeys.slice(at + 1, at + 1 + count).map((key) => key.startsWith('junction:')),
    )
    report('the fold is open', 'true', await foldButton.getAttribute('aria-expanded'))
    // its (i): what the list is for, and that it is no error
    await foldRow.locator('[data-issue-button]').click()
    const foldNote = overview.getByRole('dialog', { name: 'Junctions without a guidepost' })
    report('the fold has one (i) note', 1, await foldRow.locator('[data-issue-button]').count())
    report(
      'the note says it is no error',
      true,
      ((await foldNote.innerText()) ?? '').includes('This is not an error'),
    )
    await foldNote.getByRole('button', { name: 'Hide the junctions' }).click()
    report('"Hide the junctions" in the note folds them again', hikingKeys, await keys())
    const group = overview
      .locator('[data-group-key="unplaced:unloaded"]')
      .getByRole('button')
      .first()
    report('the members that are not loaded have a group row', 1, await group.count())
    await group.click()
    report(
      'the group opens to list its members',
      true,
      (await overview.getByRole('button', { name: /^Select / }).count()) > 10,
    )

    // --- a route master: its variants as groups, and the order view ---
    await open(MASTER)
    const heads = () =>
      column
        .locator('[data-stage]')
        .evaluateAll((all) => all.map((item) => item.getAttribute('data-stage') ?? ''))
    const order = await heads()
    report('the route master shows its two variants as groups', 2, order.length)
    report(
      'a variant group shows its line',
      true,
      (await column.locator('[data-stage] [data-row-key="start"]').count()) >= 1,
    )
    await column
      .getByRole('button', { name: /^Move / })
      .first()
      .click()
    report(
      'the handle opens the order view, every group folded',
      [true, 0],
      [
        await column.getByText(/Move the stages into their order/).isVisible(),
        await column.locator('[data-stage] [data-row-key]').count(),
      ],
    )
    await column
      .getByRole('button', { name: /^Move .* down$/ })
      .first()
      .click()
    await settle()
    report('"down" swaps the two variants', [order[1], order[0]], await heads())
    await page.keyboard.press('ControlOrMeta+z')
    await settle()
    report('one undo brings the order back', order, await heads())
    await column.getByRole('button', { name: 'Done', exact: true }).click()
    report(
      '"Done" ends the order view',
      false,
      await column.getByText(/Move the stages into their order/).isVisible(),
    )

    // --- the preview of the members that are not loaded, from the mock's Postpass fixture ---
    const asked: string[] = []
    page.on('request', (request) => {
      if (request.url().includes('/postpass/')) asked.push(request.url())
    })
    const bar = overview.locator('[data-preview-bar]')
    const previewRows = overview.locator('[data-preview]')
    const previewLines = () =>
      page.evaluate(() => {
        const source = (
          window as unknown as {
            __maid: {
              map: { getSource(id: string): { serialize(): { data: unknown } } | undefined }
            }
          }
        ).__maid.map.getSource('route-preview')
        const data = source?.serialize().data as { features?: unknown[] } | undefined
        return data?.features?.length ?? 0
      })
    await open(HIKING)
    const load = overview.getByRole('button', { name: /^Load preview of the \d+ missing members$/ })
    report('a route with missing members offers the preview above and below', 2, await load.count())
    report('nothing is asked before the press', 0, asked.length)
    report('no preview rows before the press', 0, await previewRows.count())
    await load.first().click()
    await bar.getByText(/^Preview from /).waitFor({ timeout: 8000 })
    await settle()
    report('one press asks once', 1, asked.length)
    report(
      'the query names the relation',
      true,
      (new URL(asked[0] ?? 'http://x').searchParams.get('data') ?? '').startsWith(
        `-- maid:route-preview ${HIKING.slice(1)}\n`,
      ),
    )
    report('the bar shows when the preview is from, and one bar only', 1, await bar.count())
    report(
      'the reload button is there',
      1,
      await bar.getByRole('button', { name: 'Reload the preview' }).count(),
    )
    report('the preview fills rows, muted', true, (await previewRows.count()) > 0)
    // the scene is from August, Postpass from today: three ways and a guidepost of the route are gone since
    report(
      'the members that are not loaded are now in the line: the group keeps the ones Postpass lacks',
      'Not loaded (4)',
      await overview
        .locator('[data-group-key="unplaced:unloaded"]')
        .getByRole('button')
        .first()
        .innerText(),
    )
    report('the map draws the preview lines', true, (await previewLines()) > 0)

    // a reload asks again and keeps the preview while it loads
    await bar.getByRole('button', { name: 'Reload the preview' }).click()
    await bar.getByText(/^Preview from /).waitFor({ timeout: 8000 })
    report('"Reload" asks again', 2, asked.length)
    report('the preview stays after the reload', true, (await previewRows.count()) > 0)

    // another route and back: the preview is still there, without a request
    await open(BUS)
    await open(HIKING)
    report(
      'back on the route, the preview is shown at once',
      1,
      await bar.getByText(/^Preview from /).count(),
    )
    report('and nothing is asked', 2, asked.length)

    // a new page: the stored preview (IndexedDB, 24 hours) comes back without a request
    await page.reload()
    await page.waitForFunction(() => window.__bench !== undefined, undefined, { timeout: 30000 })
    await page.evaluate(() => window.__bench.ready())
    await settle()
    const askedBefore = asked.length
    await open(HIKING)
    await bar.getByText(/^Preview from /).waitFor({ timeout: 8000 })
    report(
      'after a reload of the page the stored preview is shown',
      true,
      (await previewRows.count()) > 0,
    )
    report('and nothing is asked', askedBefore, asked.length)
    // a fresh page and no hover yet: the map layer finds the store the overview made after its first render
    report('the map draws the stored preview without a hover', true, (await previewLines()) > 0)

    // a click on a preview row loads the real member and selects it. The mock has the scene only: the map starts at
    // the east end of the bus route, so the stop Glienicker Straße (in the scene, further west) is not loaded yet
    await page.goto(
      page
        .url()
        .replace(/map=[^&]*/, 'map=19.00/52.44434/13.57437')
        .replace(/[?&](id|relation)=[^&]*/g, '') + `&id=${BUS}&relation=${BUS}`,
    )
    await page.waitForFunction(() => window.__bench !== undefined, undefined, { timeout: 30000 })
    await page.evaluate(() => window.__bench.ready())
    await settle()
    await overview.waitFor({ timeout: 8000 })
    await load.first().click()
    await bar.getByText(/^Preview from /).waitFor({ timeout: 8000 })
    const stopButton = overview
      .getByRole('button', { name: 'Load and select Glienicker Straße' })
      .first()
    const stopRowKey = await stopButton.evaluate(
      (button) => button.closest('[data-row-key]')?.getAttribute('data-row-key') ?? '',
    )
    await stopButton.hover()
    const target = await page.evaluate(() =>
      (window as unknown as MaidWindow).__maid.engine.hoverTarget(),
    )
    report(
      'the preview row hovers its member (the platform Glienicker Straße)',
      'w383448939',
      target,
    )
    const previewsBefore = await previewRows.count()
    await stopButton.click()
    await page.waitForFunction(
      (id) => new URL(location.href).searchParams.get('id') === id,
      target,
      { timeout: 8000 },
    )
    await settle()
    report(
      'a click loads the member into the data and selects it',
      true,
      await page.evaluate(
        (id) =>
          (
            window as unknown as {
              __maid: {
                editor: { history: { staging: { graph: { hasEntity(id: string): unknown } } } }
              }
            }
          ).__maid.editor.history.staging.graph.hasEntity(id ?? '') !== undefined,
        target,
      ),
    )
    report(
      'its row is no longer a preview row',
      0,
      await overview.locator(`[data-row-key="${stopRowKey}"] [data-preview]`).count(),
    )
    report('fewer rows are preview rows', true, (await previewRows.count()) < previewsBefore)
  },
  '',
)
process.exit(failed)
