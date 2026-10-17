/**
 * Check of the favourites, with real clicks in the type picker and the favourites flyout of the top bar: a point
 * preset is starred in the picker, its number shows as a badge there and in the flyout, the flyout changes the number
 * to 7 and lists the favourite as disabled under the Favourites row when an area is selected, its trash button
 * removes it, and a favourite of an area is started from the flyout's area icon: the editor draws an area.
 *
 *   bun tools/bench/favourites-check.ts [scene] [--app maid|bicycle|parking]
 *
 * Needs `bun run dev`. Favourites are kept in memory under automation, so each run starts with none.
 */
import { checkHelpers, pickBuildingAndRoad } from './check-helpers'
import { runCheck } from './check-page'

/** A click on the inspector head's icon, which opens the type picker */
const HEAD_ICON = { x: 24, y: 24 }

const sceneName = process.argv[2] ?? 'small'

const failed = await runCheck(sceneName, async ({ page, report, settle }) => {
  const { key, state } = await checkHelpers(page, settle)

  // the flyout of the top bar, found by its name; the picker and the flyout are dialogs of the same kind
  const flyout = () => page.getByRole('dialog', { name: 'Favourites', exact: true })
  const favouritesButton = () => page.getByRole('button', { name: 'Favourites', exact: true })
  const openFlyout = async () => {
    await favouritesButton().click()
    await settle()
  }
  const numberOf = (name: string) =>
    page.getByRole('textbox', { name: `Number of ${name}`, exact: true })
  // the head's icon: the middle of the head can hold its "i" and star, which are buttons of their own
  const changeType = page.locator('[aria-description="Change the feature type"]')
  const search = () => page.getByRole('combobox', { name: 'Search feature types', exact: true })
  // the star in the type picker (the inspector head has one too, for its own type)
  const star = (name: string) =>
    page
      .getByRole('dialog', { name: 'Change the feature type', exact: true })
      .getByRole('button', { name: `Add ${name} to favourites`, exact: true })

  // a feature is selected by its id in the URL, as the multi-feature check does
  const select = async (id: string) => {
    await page.evaluate((id) => {
      const url = new URL(location.href)
      url.searchParams.set('id', id)
      history.pushState(null, '', url)
      window.dispatchEvent(new PopStateEvent('popstate'))
    }, id)
    await settle()
  }

  // a building that is in view (an area), and a standalone point in view (a point)
  const { building } = await pickBuildingAndRoad(page)
  const point = await page.evaluate(() => {
    const { map, engine } = window.__maid
    const box = map.getCanvas().getBoundingClientRect()
    for (const f of map.queryRenderedFeatures()) {
      const id = String(f.id ?? '')
      if (!id.startsWith('n') || !f.source.includes('points')) continue
      const loc = engine.data.node(id)?.loc
      if (!loc || (engine.data.nodeUses.get(id) ?? 0) > 0) continue
      const p = map.project(loc)
      if (p.x > 80 && p.y > 80 && p.x < box.width - 80 && p.y < box.height - 80) return id
    }
    return undefined
  })
  report(
    'the scene has a building and a standalone point in view',
    [true, true],
    [building !== undefined, point !== undefined],
  )
  if (!building || !point) return

  // --- the point: a star in its type picker makes Bench a favourite, numbered 4 (the lowest free one) ---
  await select(point)
  await changeType.click({ position: HEAD_ICON })
  await settle()
  await search().fill('Bench')
  await settle()
  await star('Bench').click()
  await settle()
  report(
    'the star of Bench is filled: its button now removes it',
    1,
    await page.getByRole('button', { name: 'Remove Bench from favourites', exact: true }).count(),
  )
  report(
    'the picker shows its number 4 as a badge on the Bench row',
    1,
    await page
      .getByRole('option')
      .filter({ has: page.getByTitle(/type 4 to start Bench/) })
      .count(),
  )

  // --- the flyout lists it with its number; a change to 7 is given to the favourite ---
  await openFlyout()
  report('the flyout lists Bench with its number 4', '4', await numberOf('Bench').inputValue())
  report(
    'the flyout gives Bench one button for the geometry it allows: a point',
    1,
    await flyout().getByRole('button', { name: 'Add Bench as Point', exact: true }).count(),
  )
  await numberOf('Bench').fill('7')
  await numberOf('Bench').press('Enter')
  await settle()
  report('a new number is given to the favourite', '7', await numberOf('Bench').inputValue())

  // --- the building is selected: the point favourite fits no area, so the Favourites row lists it disabled ---
  await select(building)
  await changeType.click({ position: HEAD_ICON })
  await settle()
  await page.getByRole('option', { name: 'Favourites', exact: true }).click()
  await settle()
  report(
    'with an area selected, Bench is listed under Favourites and disabled',
    'true',
    await page.getByRole('option', { name: /Bench/ }).first().getAttribute('aria-disabled'),
  )

  // --- the trash button removes the favourite; the flyout says there are none ---
  await openFlyout()
  await flyout().getByRole('button', { name: 'Remove Bench from favourites', exact: true }).click()
  await settle()
  report(
    'the trash button removes Bench, and the flyout says there are no favourites',
    1,
    await page.getByText('You have no favourites yet', { exact: false }).count(),
  )

  // --- the building: a star makes Building a favourite, numbered 4; its area icon starts drawing an area ---
  await changeType.click({ position: HEAD_ICON })
  await settle()
  await search().fill('Building')
  await settle()
  await star('Building').click()
  await settle()
  await openFlyout()
  report(
    'Building is numbered 4 as the only favourite',
    '4',
    await numberOf('Building').inputValue(),
  )
  const areaButton = flyout().getByRole('button', { name: 'Add Building as Area', exact: true })
  report('its one button is the area icon', 1, await areaButton.count())
  await areaButton.click()
  await flyout()
    .waitFor({ state: 'detached', timeout: 3000 })
    .catch(() => undefined)
  report('starting an area closes the flyout', 0, await flyout().count())
  report(
    'the editor is drawing an area with the preset of Building',
    'draw-area',
    (await state()).mode,
  )
  await key('Escape')
})

process.exit(failed ? 1 : 0)
