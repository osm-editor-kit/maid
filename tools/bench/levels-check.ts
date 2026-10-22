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
    const levelButton = (level: string) => picker.locator(`button[data-level="${level}"]`)
    const listed = await picker
      .locator('button[data-level]')
      .evaluateAll((buttons) => buttons.map((button) => button.getAttribute('data-level')))
    report(
      'the picker lists levels -2 to 2 of the station, highest first, then none',
      true,
      ['2', '1', '0', '-1', '-2'].every((level) => listed.includes(level)) &&
        listed.indexOf('2') < listed.indexOf('-2') &&
        listed.at(-1) === 'none',
    )

    // on level -1: -1 is edited, -2 to 0 are shown (and locked), the levels further away are hidden
    const stateOf = (level: string) => levelButton(level).getAttribute('data-level-state')
    report(
      'the picker marks -1 edited, -2 and 0 shown, 2 hidden',
      ['edited', 'shown', 'shown', 'hidden'],
      [await stateOf('-1'), await stateOf('-2'), await stateOf('0'), await stateOf('2')],
    )

    report(
      'level 0 shows how many features in view are on it',
      true,
      Number((await levelButton('0').textContent())?.replace(/\D+/g, '') || 0) > 0,
    )

    // --- choosing level 0 in the picker ---
    await levelButton('0').click()
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

    // --- the pointer on a level that shows makes its features stand out ---
    await levelButton('1').hover()
    report(
      'the pointer on level 1 hovers it on the map',
      '1',
      await page.evaluate(() => window.__maid.map.getGlobalState().levelHover),
    )
    await page.mouse.move(600, 400)
    report(
      'and leaving it ends that',
      null,
      await page.evaluate(() => window.__maid.map.getGlobalState().levelHover ?? null),
    )

    // --- the features without a level: locked on a level, hidden with the eye, edited with "none" ---
    const STATION = 'n3856100108'
    report(
      'on level 0 the U-Bahn station (layer=-3, no level) is locked',
      true,
      await page.evaluate((id) => window.__maid.engine.isOffLevel(id), STATION),
    )
    // the "none" row's flyout: a click pins it open
    const choose = async (choice: string) => {
      if ((await page.locator(`[data-unleveled-choice="${choice}"]`).count()) === 0)
        await levelButton('none').click()
      await page.locator(`[data-unleveled-choice="${choice}"]`).click()
    }
    await choose('hidden')
    report(
      'the "none" flyout hides the features without a level',
      [false, false],
      await page.evaluate(() => [
        window.__maid.engine.unleveledVisible,
        window.__maid.map.getGlobalState().unleveled,
      ]),
    )
    await choose('shown')
    await page.keyboard.press('Escape')

    // --- a click on the station (no level, locked on level 0) offers levels; choosing one sets it, one undo step ---
    const at = await page.evaluate((id) => {
      const { map, engine } = window.__maid
      const loc = engine.data.node(id)?.loc
      return loc ? map.project(loc) : undefined
    }, STATION)
    const canvasBox = await page.locator('canvas').first().boundingBox()
    if (at && canvasBox) {
      await page.mouse.click(canvasBox.x + at.x, canvasBox.y + at.y)
      await settle()
      const menu = page.getByRole('menu', { name: 'Set level' })
      report('a click on the locked station opens "Set level"', 1, await menu.count())
      const first = menu.locator('[data-level="0"]')
      report('the edited level 0 is offered', 1, await first.count())
      // a right click (the edit menu) leaves it open
      await page.mouse.click(canvasBox.x + 40, canvasBox.y + 300, { button: 'right' })
      await settle()
      report('a right click elsewhere leaves it open', 1, await menu.count())
      await page.keyboard.press('Escape')
      if ((await menu.count()) === 0) await page.mouse.click(canvasBox.x + at.x, canvasBox.y + at.y)
      await first.click()
      await settle()
      report(
        'choosing it sets level=0 and selects the station',
        ['0', true],
        await page.evaluate(
          (id) => [
            window.__maid.engine.data.node(id)?.tags.level,
            window.__maid.engine.selected().includes(id),
          ],
          STATION,
        ),
      )
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z')
      await settle()
      report(
        'one undo takes the level off again',
        undefined,
        await page.evaluate((id) => window.__maid.engine.data.node(id)?.tags.level, STATION),
      )
    }
    await choose('edited')
    await settle()
    report(
      '"none" edits the features without a level: the station is editable, a room is locked',
      ['none', 'none', false, true],
      [
        await engineLevel(),
        await urlLevel(),
        await page.evaluate((id) => window.__maid.engine.isOffLevel(id), STATION),
        room ? await page.evaluate((id) => window.__maid.engine.isOffLevel(id), room.id) : true,
      ],
    )
    // fixing: a click on the station selects it and offers its levels left of the pointer
    if (at && canvasBox) {
      await page.keyboard.press('Escape')
      await page.mouse.click(canvasBox.x + at.x, canvasBox.y + at.y)
      await settle()
      const menu = page.getByRole('menu', { name: 'Set level' })
      const menuBox = await menu.boundingBox()
      report(
        'while fixing, a click selects the station and opens "Set level" left of the pointer',
        [true, 1, true],
        [
          await page.evaluate((id) => window.__maid.engine.selected().includes(id), STATION),
          await menu.count(),
          menuBox !== null && menuBox.x + menuBox.width <= canvasBox.x + at.x,
        ],
      )
      await menu.getByRole('menuitem').first().click()
      await settle()
      report(
        'choosing a level puts it on that level, and it leaves the view of the features without a level',
        [true, false],
        await page.evaluate(
          (id) => [
            window.__maid.engine.data.node(id)?.tags.level !== undefined,
            window.__maid.engine.selected().includes(id),
          ],
          STATION,
        ),
      )
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z')
      await settle()
    }
    await levelButton('0').click()
    await settle()

    // --- a point placed now is on level 0 ---
    const before = await page.evaluate(() => window.__maid.engine.levelTags())
    report('new features get level=0', { level: '0' }, before)

    // --- "All" ends the level mode ---
    await picker.getByRole('button', { name: 'All' }).click()
    await settle()
    report('"All" ends the level mode', [null, null], [await engineLevel(), await urlLevel()])
    if (room)
      report(
        'the room is no longer locked',
        false,
        await page.evaluate((id) => window.__maid.engine.isOffLevel(id), room.id),
      )

    // --- no level edited, a room selected: its level is marked in the picker, a click edits that level ---
    if (room) {
      const roomLevel = await page.evaluate((id) => {
        window.__maid.engine.setSelected(id)
        return String(window.__maid.engine.levelsOf(id)[0])
      }, room.id)
      await settle()
      report(
        "the selected room's level is marked in the picker",
        'true',
        await levelButton(roomLevel).getAttribute('data-selected-here'),
      )
      await levelButton(roomLevel).click()
      await settle()
      report(
        'a click edits that level and the room stays selected and editable',
        [roomLevel, true, false],
        await page.evaluate(
          (id) => [
            String(window.__maid.engine.level),
            window.__maid.engine.selected().includes(id),
            window.__maid.engine.isOffLevel(id),
          ],
          room.id,
        ),
      )
      await picker.getByRole('button', { name: 'All' }).click()
      await settle()
    }

    // --- the inspector's level section: stairs from → to, the direction swapped in one undo step ---
    {
      const STEPS = 'w59804707' // level=0;1, incline=down: from 1 to 0
      await page.evaluate((id) => window.__maid.engine.setSelected(id), STEPS)
      await settle()
      const inspector = page.getByRole('complementary', { name: 'Selected feature', exact: true })
      report(
        'the stairs show "from 1 to 0" at the top of the inspector',
        [1, 1],
        [
          await inspector.getByRole('button', { name: 'From level 1' }).count(),
          await inspector.getByRole('button', { name: 'To level 0' }).count(),
        ],
      )
      await inspector.getByRole('button', { name: 'Swap the direction' }).click()
      await settle()
      report(
        'swapping sets incline=up and keeps the levels',
        ['up', '0;1'],
        await page.evaluate((id) => {
          const tags = window.__maid.engine.data.way(id)?.tags
          return [tags?.incline, tags?.level]
        }, STEPS),
      )
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z')
      await settle()
      report(
        'one undo puts incline=down back',
        'down',
        await page.evaluate((id) => window.__maid.engine.data.way(id)?.tags.incline, STEPS),
      )
      await page.evaluate(() => window.__maid.engine.setSelected(null))
    }

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
