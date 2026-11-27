/**
 * Check of the inspector's "Allowed Access" field (packages/ui fields/Access.tsx), shared by every app: on a
 * residential road with foot=use_sidepath and mofa=no, the values and placeholders show as labels, the set
 * mofa gets a row of its own, "+" adds a row for another mode of transport whose value is written as one undo
 * step, and the field's trash removes every access key.
 *
 *   bun tools/bench/access-check.ts [scene] [--app <app>]
 */
import { runCheck } from './check-page'

const sceneName = process.argv[2] ?? 'small'

type Tags = Record<string, string>

const failed = await runCheck(sceneName, async ({ page, report, settle }) => {
  const road = await page.evaluate(() => {
    const { map, engine } = window.__maid
    const bounds = map.getBounds()
    for (const f of map.querySourceFeatures('osm-lines')) {
      const id = String(f.id ?? '')
      const way = id.startsWith('w') && engine.data.way(id)
      if (!way || way.tags.highway !== 'residential' || way.tags.access) continue
      const inView = way.nodes.some((n: string) => {
        const loc = engine.data.node(n)?.loc
        return loc !== undefined && bounds.contains([loc[0], loc[1]])
      })
      if (inView) return id
    }
    return undefined
  })
  if (!road) {
    report('find a residential road in view', 'one', null)
    return
  }
  const accessOf = () =>
    page.evaluate((id) => {
      const tags = window.__maid.engine.data.way(id)!.tags as Tags
      const keys = ['access', 'foot', 'bicycle', 'motor_vehicle', 'horse', 'mofa', 'bus']
      return Object.fromEntries(keys.filter((key) => tags[key]).map((key) => [key, tags[key]]))
    }, road)
  // the setup, as one step: no access keys but foot=use_sidepath and mofa=no
  await page.evaluate((id) => {
    const { engine } = window.__maid
    const tags = engine.data.way(id)!.tags as Tags
    const remove = ['access', 'bicycle', 'motor_vehicle', 'horse', 'bus', 'vehicle'].filter(
      (key) => tags[key],
    )
    engine.changeTags([id], { set: { foot: 'use_sidepath', mofa: 'no' }, remove }, 'Setup')
  }, road)
  await page.evaluate((id) => {
    const url = new URL(location.href)
    url.searchParams.set('id', id)
    history.pushState(null, '', url)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, road)
  await settle()
  const sidebar = page.locator('aside').first()
  const field = sidebar.getByRole('group', { name: 'Allowed Access', exact: true })
  await field.scrollIntoViewIfNeeded()
  const input = (label: string) => field.getByLabel(label, { exact: true })
  const rowLabels = () => field.locator('label').allInnerTexts()

  report(
    'the rows: the five of the field and the set mofa, in the wiki order',
    ['Access', 'Foot', 'Horse', 'Bicycle', 'Motor vehicle', 'Mofa'],
    await rowLabels(),
  )
  report('foot=use_sidepath shows as its label', 'Use sidepath', await input('Foot').inputValue())
  report('mofa=no shows as its label', 'Prohibited', await input('Mofa').inputValue())
  report(
    'the implied values show as labels in the placeholders',
    ['Allowed', 'Allowed', 'Allowed'],
    [
      await input('Access').getAttribute('placeholder'),
      await input('Motor vehicle').getAttribute('placeholder'),
      await input('Bicycle').getAttribute('placeholder'),
    ],
  )

  // --- "+" adds a row for a bus; its value is one undo step ---
  const stepBefore = await page.evaluate(() => window.__maid.engine.undoState().undoLabel ?? null)
  await sidebar.getByRole('button', { name: 'Add a mode of transport', exact: true }).click()
  const picker = field.getByPlaceholder('Add a mode of transport', { exact: true })
  report(
    'the "+" opens the key picker, focused',
    true,
    await picker.evaluate((el) => el === document.activeElement),
  )
  await page.keyboard.type('Bus')
  await page.getByRole('option', { name: /^Bus/ }).click()
  await settle()
  report('the bus row is added, in its place', true, (await rowLabels()).at(-1) === 'Bus')
  report(
    'the new row takes the focus',
    true,
    await input('Bus').evaluate((el) => el === document.activeElement),
  )
  report('adding a row writes nothing', { foot: 'use_sidepath', mofa: 'no' }, await accessOf())
  await page.keyboard.type('Designated')
  await page.keyboard.press('Enter')
  await settle()
  report(
    'the value is written as bus=designated',
    { foot: 'use_sidepath', mofa: 'no', bus: 'designated' },
    await accessOf(),
  )
  await page.evaluate(() => window.__maid.engine.undo())
  await settle()
  report('one undo takes it back', { foot: 'use_sidepath', mofa: 'no' }, await accessOf())
  report(
    'and the step before it is the setup again',
    stepBefore,
    await page.evaluate(() => window.__maid.engine.undoState().undoLabel ?? null),
  )

  // --- the field's trash removes every access key, the added ones too ---
  await field
    .getByRole('button', { name: /^Remove/ })
    .first()
    .click()
  await settle()
  report('the trash removes foot and mofa', {}, await accessOf())
})

process.exit(failed ? 1 : 0)
