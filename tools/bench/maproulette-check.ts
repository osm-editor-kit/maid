/**
 * MapRoulette check for module-maproulette (apps/maid-maproulette): the mock's made-up challenges on the small scene
 * (tools/mock-osm-api/maproulette.ts, fixtures/maproulette), so nothing goes to maproulette.org:
 *
 * - `?maproulette=9001` opens the challenge: the top bar button shows its name, the panel its description;
 * - without a challenge, the panel lists the challenges with open tasks in the view (all three at zoom 16);
 * - "Next task nearby" selects the task's way, the inspector shows the task above the fields, the URL names the task;
 * - "I fixed it" (with the upload) queues the task: the button counts one waiting task, Undo opens it again;
 * - "Right away" without a token: MapRoulette's 401 is shown; with a token the mock has the task as not an issue;
 * - a tag fix task: the diff shows `surface=asphalt`, Accept sets the tag in one undo step and queues the task.
 *
 *   bun tools/bench/maproulette-check.ts [scene] --app maproulette
 *
 * Prints one line per check: `ok <check>`, or `FAIL <check>`. Exits 1 on any failure.
 */
import { PORTS } from '../ports'
import { runCheck } from './check-page'

const sceneName = process.argv[2] ?? 'small'
const MOCK = `http://localhost:${PORTS.mockApi}`
const MR = `${MOCK}/maproulette/api/v2`

await fetch(`${MOCK}/maproulette/reset`)

const code = await runCheck(
  sceneName,
  async ({ page, report }) => {
    const button = page.getByRole('button', { name: 'MapRoulette', exact: true })
    const panel = page.getByTestId('maproulette-panel')
    const section = page.getByTestId('maproulette-section')
    const selected = () => page.evaluate(() => window.__maid.engine.selected())
    const tags = (id: string) =>
      page.evaluate(
        (id) => ({ ...window.__maid.editor.history.staging.graph.hasEntity(id)?.tags }),
        id,
      )
    const param = () => new URL(page.url()).searchParams.get('maproulette')

    // --- the challenge of the link ---
    await page.waitForFunction(
      () => document.body.textContent?.includes('Footways without surface'),
      undefined,
      {
        timeout: 15_000,
      },
    )
    report(
      'link: the button names the challenge',
      true,
      (await button.textContent())?.includes('Footways without surface'),
    )
    await button.click()
    await panel.waitFor()
    report(
      'panel: the challenge description',
      true,
      (await panel.textContent())?.includes('A made-up challenge'),
    )

    // --- the next task: its way is selected and the inspector shows it ---
    await panel.getByRole('button', { name: 'Next task nearby' }).click()
    await section.first().waitFor({ timeout: 10_000 })
    const [way] = await selected()
    report('next task: a way is selected', true, typeof way === 'string' && way.startsWith('w'))
    report(
      'next task: the URL names the challenge and the task',
      true,
      /^9001\/\d+$/.test(param() ?? ''),
    )
    report(
      'next task: the instructions in the inspector',
      true,
      (await section.first().textContent())?.includes('Add the surface of this footway'),
    )

    // --- with the upload: queued, counted, undone ---
    await page.keyboard.press('Escape')
    await section.first().getByRole('button', { name: 'I fixed it' }).click()
    await section.first().getByText('goes to MapRoulette with your next upload').waitFor()
    report(
      'with the upload: the button counts a waiting task',
      true,
      (await button.textContent())?.includes('1'),
    )
    await section.first().getByRole('button', { name: 'Undo' }).click()
    await section.first().getByRole('button', { name: 'I fixed it' }).waitFor()
    report('undo: the task is open again', true, !(await button.textContent())?.match(/\d$/))

    // --- right away: 401 without a token, sent with one ---
    const taskId = param()?.split('/')[1] ?? ''
    await section.first().getByRole('radio', { name: 'Right away' }).click()
    await section.first().getByRole('button', { name: 'Not an issue' }).click()
    await section.first().getByText('MapRoulette did not accept the login').waitFor()
    report('right away without a token: the 401 is shown', true, true)
    await button.click()
    await panel.getByText('Not logged in to MapRoulette').click()
    await panel.getByLabel('MapRoulette token').fill('mrt_test')
    await page.keyboard.press('Escape')
    await section.first().getByRole('button', { name: 'Not an issue' }).click()
    await section.first().getByText('MapRoulette knows').waitFor()
    const sent = (await (await fetch(`${MR}/task/${taskId}`)).json()) as { status: number }
    report('right away with a token: the mock has the task as not an issue', 2, sent.status)
    await section
      .first()
      .getByRole('radio', { name: 'With the upload' })
      .waitFor({ state: 'detached' })

    // --- a tag fix ---
    await page.evaluate(() => {
      const url = new URL(location.href)
      url.searchParams.delete('id')
      history.replaceState(null, '', url)
    })
    // back to zoom 16 (OSM; MapLibre 15) over the scene, where the tasks of all three challenges are in view
    await page.evaluate(() => window.__maid.map.jumpTo({ center: [13.4, 52.389], zoom: 15 }))
    await button.click()
    await panel.getByRole('button', { name: /Close the challenge/ }).click()
    await panel.getByRole('button', { name: /Service roads/ }).waitFor({ timeout: 10_000 })
    const names = await panel
      .getByTestId('maproulette-nearby')
      .getByRole('listitem')
      .allTextContents()
    report(
      'panel: the challenges in view',
      [
        'Footways without surface',
        'Service roads: surface=asphalt?',
        'Steps without handrail',
      ].toSorted(),
      names.map((name) => name.replace(/Challenge.*$/, '')).toSorted(),
    )
    await panel.getByRole('button', { name: /Service roads/ }).click()
    await panel.getByRole('button', { name: 'Next task nearby' }).click()
    await section.first().getByText('Suggested tag change').waitFor({ timeout: 10_000 })
    const [road] = await selected()
    report(
      'tag fix: the diff names surface=asphalt',
      true,
      (await section.first().textContent())?.includes('asphalt'),
    )
    await section.first().getByRole('button', { name: 'Accept' }).click()
    await section.first().getByText('goes to MapRoulette with your next upload').waitFor()
    report('tag fix: accept sets the tag', 'asphalt', road ? (await tags(road)).surface : undefined)
    report(
      'tag fix: one undo step',
      'Accepted a MapRoulette tag fix',
      await page.evaluate(() => window.__maid.engine.undoState().undoLabel ?? null),
    )
  },
  // zoom 16 over the scene: the tasks of all three challenges are in view
  'maproulette=9001&map=16/52.389/13.4',
)

process.exit(code)
