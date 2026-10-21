/**
 * Check of the level mode, with real clicks on the indoor scene (Berlin Hauptbahnhof): `level=` in a link chooses a
 * level, the level picker lists the floors in view and chooses another one, a room on another level is dimmed, cannot
 * be selected with a click and cannot be changed, a point placed now gets the level, "All" ends the mode, and "3D"
 * tilts the map and extrudes the rooms.
 *
 *   bun tools/bench/levels-check.ts [scene] [--app maid|bicycle]
 *
 * Needs `bun run dev`.
 */
import { runCheck } from './check-page'

const sceneName = process.argv[2] ?? 'indoor'

const failed = await runCheck(
  sceneName,
  async ({ page, report, settle }) => {
    const picker = page.getByRole('group', { name: 'Building levels' })
    const urlLevel = () => page.evaluate(() => new URL(location.href).searchParams.get('level'))
    const engineLevel = () => page.evaluate(() => window.__maid.engine.level)

    // --- a link with level=-1 edits on level -1 ---
    report('the link chooses level -1', -1, await engineLevel())
    report(
      'the map has the level as its global state, as text and as a number',
      ['-1', -1],
      await page.evaluate(() => {
        const state = window.__maid.map.getGlobalState()
        return [state.level, state.levelNumber]
      }),
    )
    report('the level picker shows', 1, await picker.count())
    report(
      'the picker lists levels -2 to 2 of the station',
      true,
      await page.evaluate(() =>
        ['-2', '-1', '0', '1', '2'].every((label) =>
          [
            ...document.querySelectorAll('[role="group"][aria-label="Building levels"] button'),
          ].some((button) => button.textContent?.trim() === label),
        ),
      ),
    )

    // on level -1: -1 is edited, -2 to 0 are shown (and locked), the levels further away are hidden
    const stateOf = (label: string) =>
      page.evaluate(
        (label) =>
          [...document.querySelectorAll('[role="group"][aria-label="Building levels"] button')]
            .find((button) => button.textContent?.trim() === label)
            ?.getAttribute('data-level-state') ?? null,
        label,
      )
    report(
      'the picker marks -1 edited, -2 and 0 shown, 2 hidden',
      ['edited', 'shown', 'shown', 'hidden'],
      [await stateOf('-1'), await stateOf('-2'), await stateOf('0'), await stateOf('2')],
    )

    // --- choosing level 0 in the picker ---
    await picker.getByRole('button').filter({ hasText: /^0$/ }).click()
    await settle()
    report('a click on 0 edits on level 0', [0, '0'], [await engineLevel(), await urlLevel()])

    // a room on other levels only, in view: a click in its middle must not select it
    const room = await page.evaluate(() => {
      const { map, engine } = window.__maid
      const seen = new Set<string>()
      for (const f of map.queryRenderedFeatures()) {
        const id = String(f.id ?? f.properties?.id ?? '')
        if (!id.startsWith('w') || seen.has(id)) continue
        seen.add(id)
        const way = engine.data.way(id)
        if (way?.tags.indoor !== 'room' || !engine.isOffLevel(id)) continue
        const locs = way.nodes.map((n) => engine.data.node(n)?.loc).filter((l) => l !== undefined)
        const lon = locs.reduce((sum, l) => sum + l[0], 0) / locs.length
        const lat = locs.reduce((sum, l) => sum + l[1], 0) / locs.length
        const point = map.project([lon, lat])
        return { id, x: point.x, y: point.y }
      }
      return undefined
    })
    report('the view has a room on another level than 0', true, room !== undefined)
    if (room) {
      report(
        'the room is off level, and read-only',
        [true, true],
        await page.evaluate(
          (id) => [window.__maid.engine.isOffLevel(id), window.__maid.engine.isReadOnly(id)],
          room.id,
        ),
      )
      const canvas = await page.locator('canvas').first().boundingBox()
      if (canvas) {
        await page.mouse.click(canvas.x + room.x, canvas.y + room.y)
        await settle()
      }
      report(
        'a click on it does not select it',
        false,
        await page.evaluate((id) => window.__maid.engine.selected().includes(id), room.id),
      )
      // selected by a link, it is shown read-only, and the inspector says why
      await page.evaluate((id) => {
        const url = new URL(location.href)
        url.searchParams.set('id', id)
        history.pushState(null, '', url)
        window.dispatchEvent(new PopStateEvent('popstate'))
      }, room.id)
      await settle()
      report(
        'selected by a link, the inspector says it is on another level',
        1,
        await page
          .getByText('Read-only: this feature is on another level', { exact: false })
          .count(),
      )
    }

    // --- a point placed now is on level 0 ---
    const before = await page.evaluate(() => window.__maid.engine.levelTags())
    report('new features get level=0', { level: '0' }, before)

    // --- "All" ends the level mode ---
    await picker.getByRole('button').filter({ hasText: /^All$/ }).click()
    await settle()
    report('"All" ends the level mode', [null, null], [await engineLevel(), await urlLevel()])
    if (room)
      report(
        'the room is no longer locked',
        false,
        await page.evaluate((id) => window.__maid.engine.isOffLevel(id), room.id),
      )

    // --- 3D ---
    await page.getByRole('button', { name: '3D' }).click()
    await page.waitForTimeout(1200)
    await settle()
    report(
      '3D tilts the map and extrudes the rooms',
      [true, true],
      await page.evaluate(() => {
        const { map } = window.__maid
        const extrusion = map.getStyle().layers.some((layer) => layer.type === 'fill-extrusion')
        return [map.getPitch() > 30, extrusion]
      }),
    )
    await page.getByRole('button', { name: '3D' }).click()
    await page.waitForTimeout(1200)
    report(
      'and turning it off makes the map flat again',
      true,
      await page.evaluate(() => window.__maid.map.getPitch() < 1),
    )
  },
  'level=-1',
)

process.exit(failed ? 1 : 0)
