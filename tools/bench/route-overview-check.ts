/**
 * Check of the route overview in the relation column, with real input: a bus route shows its stops and platforms in
 * travel order and no junction rows; the spacing toggle switches to "To scale" and back; the pointer on a row lights
 * the member on the map, and a member hovered on the map lights its row; a click on a row selects the member; an (i)
 * button opens its note and Escape closes it. A hiking route shows junction rows and a group of members that are not
 * loaded, which opens to list them.
 *
 *   bun tools/bench/route-overview-check.ts [scene] [--app maid|bicycle|parking]
 *
 * Needs `bun run dev`. Runs on the relations scene (Köpenick): Bus 162 (r6783678) and the Müggel-Spree-Weg (r3001299).
 */
import { runCheck } from './check-page'

const BUS = 'r6783678'
const HIKING = 'r3001299'

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
    const junction = overview.locator('[data-row-key^="junction:"]').first()
    await junction.hover()
    report(
      'a row without a single member lights while the pointer is on it',
      'true',
      await junction.getAttribute('data-lit'),
    )
    const hikingKeys = await keys()
    report(
      'the line rows come first, the groups below them',
      false,
      hikingKeys.some((key) => key.startsWith('unplaced:')),
    )
    report(
      'the hiking route shows junctions',
      true,
      hikingKeys.some((key) => key.startsWith('junction:')),
    )
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
  },
  '',
)
process.exit(failed)
