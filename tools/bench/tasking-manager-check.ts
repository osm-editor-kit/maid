/**
 * Tasking Manager check for module-tasking-manager (apps/maid-buildings): the mock's made-up project 4242 on the small
 * scene (tools/mock-osm-api/tasking-manager.ts, fixtures/tasking-manager), so nothing goes to the TM:
 *
 * - `?tm=4242/22` opens the dock tab "Tasking Manager" with the project's name, the task's status and its instructions
 *   with x, y and z filled in, the project's instructions and a link to the project's tasks in the TM;
 * - the map is moved onto task 22 and draws it as the current task, the other 35 as tasks;
 * - the save form starts with the project's changeset comment; the link keeps `tm=4242/22`;
 * - a private project (4243) shows the TM's login message.
 *
 *   bun tools/bench/tasking-manager-check.ts [scene] --app buildings
 *
 * Prints one line per check: `ok <check>`, or `FAIL <check>`. Exits 1 on any failure.
 */
import tasks from '../../fixtures/tasking-manager/tasks-4242.json'
import { runCheck } from './check-page'

const sceneName = process.argv[2] ?? 'small'
const TASK = 22
const square =
  tasks.features.find((feature) => feature.properties.taskId === TASK)?.geometry
    .coordinates[0]?.[0] ?? []
const lons = square.map((point) => point[0] ?? 0)
const lats = square.map((point) => point[1] ?? 0)

const code = await runCheck(
  sceneName,
  async ({ page, report }) => {
    const view = page.getByTestId('tm-view')
    await view.getByText('Buildings in Lichtenrade (made up)').waitFor({ timeout: 15_000 })
    report('link: the dock shows the project', true, await view.isVisible())
    report(
      'task: its status',
      'Available for mapping',
      await page.getByTestId('tm-task-status').textContent(),
    )
    report(
      'task: its instructions with x, y and z',
      true,
      /Map the buildings of tile \d+\/\d+ at zoom 17\./.test(
        (await page.getByTestId('tm-task-instructions').textContent()) ?? '',
      ),
    )
    report(
      'project: its instructions as Markdown',
      true,
      (await page.getByTestId('tm-instructions').locator('li').count()) >= 2,
    )
    report(
      'task: the link to the TM',
      'https://tasks.hotosm.org/projects/4242/tasks',
      await view
        .getByRole('link', { name: `Open task ${TASK} in the Tasking Manager` })
        .getAttribute('href'),
    )

    // the map is on the task, which is drawn as the current one
    // fitBounds eases for 400 ms
    await page.waitForTimeout(1_000)
    await page.waitForFunction(() => !window.__maid.map.isMoving(), undefined, { timeout: 10_000 })
    const center = await page.evaluate(() => window.__maid.map.getCenter().toArray())
    report(
      'map: on the task',
      true,
      center[0] >= Math.min(...lons) &&
        center[0] <= Math.max(...lons) &&
        center[1] >= Math.min(...lats) &&
        center[1] <= Math.max(...lats),
    )
    const drawn = await page.evaluate(() => {
      const map = window.__maid.map
      const count = (layer: string) => map.queryRenderedFeatures({ layers: [layer] }).length
      return { current: count('tm-task-current') > 0, others: count('tm-task-line') > 0 }
    })
    report('map: the current task and the others are drawn', { current: true, others: true }, drawn)

    report(
      'save: the project comment starts the form',
      '#hotosm-project-4242 #maid-test Buildings in Lichtenrade',
      await page.evaluate(
        () =>
          window.__maid.editor
            .registry('changeset.tags')
            .list()
            .find((item) => item.id === 'tasking-manager')
            ?.comment?.() ?? null,
      ),
    )
    report('url: keeps the task', `4242/${TASK}`, new URL(page.url()).searchParams.get('tm'))

    // a private project: the TM shows it only after its login
    const url = new URL(page.url())
    url.searchParams.set('tm', '4243')
    await page.goto(url.toString())
    const alert = page.getByTestId('tm-view').and(page.getByRole('alert'))
    await alert.waitFor({ timeout: 15_000 })
    report(
      'private project: the login message',
      true,
      (await alert.textContent())?.includes('private or a draft'),
    )
  },
  `tm=4242/${TASK}`,
)

process.exit(code)
