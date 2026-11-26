/**
 * Task list check for module-tasks (ADR 0013): `?tasks=<url>` with fixtures/tasks/small.tasks.geojson from the mock,
 * on the small scene. The progress is kept in the browser only, which automation switches off (`isAutomated`), so
 * nothing about it is checked here (local.test.ts covers it):
 *
 * - the dock tab "Tasks" with 40 open tasks; a row selects its way and shows the task in the inspector;
 * - an option's diff and "Apply": the tags change in one undo step, the task is done;
 * - "Ignore" on another task;
 * - undo takes the tags back;
 * - a "create" option adds a tagged node at the task's point, a "delete" option deletes the task's node; each is
 *   one undo step, and undo also takes the done status back;
 * - performance: a list of 20 000 tasks, from the URL to the counts, and a status click to the new count
 *   (`reports/tasks-perf.json`).
 *
 *   bun tools/bench/tasks-check.ts [scene] [--app maid|bicycle|parking]
 *
 * Prints one line per check: `ok <check>`, or `FAIL <check>`. Exits 1 on any failure.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { syntheticTasks } from '../../packages/tasks/src/index.ts'
import { PORTS } from '../ports'
import { runCheck } from './check-page'

const sceneName = process.argv[2] ?? 'small'
const MOCK = `http://localhost:${PORTS.mockApi}`
const TASKS_URL = `${MOCK}/tasks/small.tasks.geojson`
/** A large list for the timings, served by the page's route under a local URL (the mock serves only fixtures) */
const BIG_URL = `${MOCK}/tasks-big/synthetic-20000.geojson`
/** A list with a "create" and a "delete" option, served the same way */
const EDIT_URL = `${MOCK}/tasks-edit/create-delete.geojson`
const REPORT = join(import.meta.dir, '../../reports/tasks-perf.json')

const timings: Record<string, number> = {}

const code = await runCheck(
  sceneName,
  async ({ page, report, settle }) => {
    const byId = (id: string) => page.getByTestId(id)
    const count = async (status: string) =>
      Number((await byId(`tasks-count-${status}`).textContent())?.replace(/\D/g, '') || 'NaN')
    const tags = (id: string) =>
      page.evaluate(
        (id) => ({ ...window.__maid.editor.history.staging.graph.hasEntity(id)?.tags }),
        id,
      )
    const undoLabel = () => page.evaluate(() => window.__maid.engine.undoState().undoLabel ?? null)
    /** After a reload or a new address: the bench API is there again and the map is ready */
    const ready = async () => {
      await page.waitForFunction(() => window.__bench !== undefined, undefined, { timeout: 30_000 })
      await page.evaluate(() => window.__bench.ready())
    }
    // --- the list from the URL ---
    await byId('tasks-view').waitFor({ timeout: 15_000 })
    report(
      'the dock has the "Task lists (n)" tab',
      1,
      await page.getByRole('tab', { name: /^Task lists \(\d+\)$/ }).count(),
    )
    report(
      '40 tasks, all open',
      [40, 0, 0, 0],
      [await count('open'), await count('done'), await count('ignored'), await count('skipped')],
    )

    // the first task: a way with options; find one that is not applied yet
    const file = await (await fetch(TASKS_URL)).json()
    type Option = { id: string; set?: Record<string, string>; remove?: string[] }
    type Feature = { properties: { task_id: string; osm?: string[]; options?: Option[] } }
    const features = file.features as Feature[]
    const first = features[0]!.properties
    const wayId = first.osm![0]!.replace('way/', 'w')
    await byId(`tasks-row-${first.task_id}`).click()
    await settle()
    const selected = await page.evaluate(() => new URL(location.href).searchParams.get('id'))
    report('a row selects the way of its task', true, JSON.stringify(selected).includes(wayId))
    // the inspector only points to the task; the task itself is in the dock beside the list
    await byId('tasks-section').waitFor({ timeout: 5_000 })
    report(
      'the inspector points to the task, the dock shows it',
      [1, 0, 1],
      [
        await byId(`tasks-hint-${first.task_id}`).count(),
        await byId('tasks-section')
          .locator(`[data-testid="tasks-content-${first.task_id}"]`)
          .count(),
        await byId('tasks-detail')
          .locator(`[data-testid="tasks-content-${first.task_id}"]`)
          .count(),
      ],
    )
    // a click elsewhere on the map: the task stays, and "Select its feature" brings its way back
    await page.evaluate(() => window.__maid.engine.setSelected([]))
    await settle()
    const kept = await byId('tasks-detail')
      .locator(`[data-testid="tasks-content-${first.task_id}"]`)
      .count()
    await byId('tasks-show').click()
    await settle()
    const back = await page.evaluate(() => new URL(location.href).searchParams.get('id'))
    report(
      'the task stays without a selection, and its button selects the way again',
      [1, true],
      [kept, JSON.stringify(back).includes(wayId)],
    )

    const before = await tags(wayId)
    const option = first.options!.find(
      (o) =>
        Object.entries(o.set ?? {}).some(([k, v]) => before[k] !== v) ||
        (o.remove ?? []).some((k) => k in before),
    )!
    report(
      'each option shows a diff and an Apply button',
      first.options!.length,
      await page.locator('[data-testid^="tasks-apply-"], [data-testid^="tasks-applied-"]').count(),
    )
    const undoBefore = await undoLabel()
    await byId(`tasks-apply-${option.id}`).click()
    await settle()
    const after = await tags(wayId)
    report(
      "Apply sets the option's tags",
      true,
      Object.entries(option.set ?? {}).every(([k, v]) => after[k] === v) &&
        (option.remove ?? []).every((k) => !(k in after)),
    )
    report('Apply is one undo step', true, (await undoLabel()) !== undoBefore)
    report('the applied task is done', 1, await count('done'))

    // a second task: ignored
    const second = features[1]!.properties
    await byId(`tasks-row-${second.task_id}`).click()
    await settle()
    await page
      .locator(`[data-testid="tasks-status-ignored"][data-task-id="${second.task_id}"]`)
      .first()
      .click()
    report('"Ignore" counts the task as ignored', 1, await count('ignored'))

    // a reload: the list comes from the URL again, with every task open (nothing is kept under automation)
    await page.reload()
    await ready()
    await byId('tasks-view').waitFor({ timeout: 15_000 })

    // the edit journal offers the applied tags of before the reload: they are not the task's business here
    const discard = page.getByRole('button', { name: 'Discard them' })
    await discard.waitFor({ timeout: 5_000 }).catch(() => undefined)
    if (await discard.count()) await discard.click()
    const dialogs = await page
      .locator('[data-testid$="-dialog"]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')))
    report('no task dialog after the reload', [], dialogs)

    // --- undo, on a fresh page: the applied tags were not saved, so undo the edit of this session instead ---
    await byId(`tasks-row-${first.task_id}`).click()
    await settle()
    const tagsBefore = await tags(wayId)
    const again = byId(`tasks-apply-${option.id}`)
    report('after the discarded edits the option can be applied again', 1, await again.count())
    if (await again.count()) {
      await again.click()
      await settle()
      await page.keyboard.press('ControlOrMeta+z')
      await settle()
      report('undo takes the applied tags back', tagsBefore, await tags(wayId))
    }

    // --- create and delete ---
    const deleteRef = features[3]!.properties.osm![0]!
    const deleteId = deleteRef.replace('node/', 'n')
    const editFile = {
      type: 'FeatureCollection',
      maid_tasks: {
        version: 1,
        list_id: 'check-create-delete',
        title: 'Create and delete',
        description: '',
      },
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [13.4, 52.389] },
          properties: {
            task_id: 'add',
            title: 'Add a bench',
            description: '',
            options: [
              { id: 'bench', label: 'Add the bench', action: 'create', set: { amenity: 'bench' } },
            ],
          },
        },
        {
          type: 'Feature',
          geometry: (file.features as { geometry: unknown }[])[3]!.geometry,
          properties: {
            task_id: 'remove',
            title: 'Delete the node',
            description: '',
            osm: [deleteRef],
            options: [{ id: 'gone', label: 'It is gone', action: 'delete' }],
          },
        },
      ],
    }
    await page.route(EDIT_URL, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/geo+json',
        body: JSON.stringify(editFile),
        headers: { 'Access-Control-Allow-Origin': '*' },
      }),
    )
    const editUrl = new URL(page.url())
    editUrl.searchParams.set('tasks', EDIT_URL)
    editUrl.searchParams.delete('id')
    await page.goto(editUrl.toString())
    await ready()
    await byId('tasks-view').waitFor({ timeout: 15_000 })
    const discardEdit = page.getByRole('button', { name: 'Discard them' })
    await discardEdit.waitFor({ timeout: 3_000 }).catch(() => undefined)
    if (await discardEdit.count()) await discardEdit.click()
    await byId('tasks-row-add').click()
    await settle()
    await byId('tasks-apply-bench').click()
    await settle()
    // the edits of this page: only the new node
    const created = await page.evaluate(() => {
      const entity = window.__maid.editor.history
        .difference()
        .created()
        .find((each) => each.tags.amenity === 'bench')
      return entity
        ? { id: entity.id, tags: { ...entity.tags }, loc: (entity as { loc?: number[] }).loc }
        : null
    })
    report(
      '"create" adds a node with the tags at the task\'s point',
      { tags: { amenity: 'bench' }, loc: [13.4, 52.389] },
      created && { tags: created.tags, loc: created.loc },
    )
    report('the create task is done', 1, await count('done'))
    await page.keyboard.press('ControlOrMeta+z')
    await settle()
    const createdAfterUndo = await page.evaluate(
      (id) => window.__maid.editor.history.staging.graph.hasEntity(id) !== undefined,
      created?.id ?? '',
    )
    report(
      'undo removes the new node and reopens the task',
      [false, 0],
      [createdAfterUndo, await count('done')],
    )

    await byId('tasks-row-remove').click()
    await settle()
    await page.waitForFunction(
      (id) => window.__maid.editor.history.staging.graph.hasEntity(id) !== undefined,
      deleteId,
      { timeout: 10_000 },
    )
    await byId('tasks-apply-gone').click()
    await settle()
    const exists = () =>
      page.evaluate(
        (id) => window.__maid.editor.history.staging.graph.hasEntity(id) !== undefined,
        deleteId,
      )
    report(
      '"delete" deletes the task\'s node, and the task is done',
      [false, 1],
      [await exists(), await count('done')],
    )
    await page.keyboard.press('ControlOrMeta+z')
    await settle()
    report(
      'undo brings the node back and reopens the task',
      [true, 0],
      [await exists(), await count('done')],
    )

    // --- performance: 20 000 tasks ---
    const big = JSON.stringify(syntheticTasks(20_000, 7))
    await page.route(BIG_URL, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/geo+json',
        body: big,
        headers: { 'Access-Control-Allow-Origin': '*' },
      }),
    )
    const url = new URL(page.url())
    url.searchParams.set('tasks', BIG_URL)
    const start = Date.now()
    await page.goto(url.toString())
    await page.waitForFunction(
      () =>
        Number(
          document
            .querySelector('[data-testid="tasks-count-open"]')
            ?.textContent?.replace(/\D/g, ''),
        ) > 19_000,
      undefined,
      { timeout: 60_000 },
    )
    timings.load20000Ms = Date.now() - start
    await ready()
    report(
      '20 000 tasks load',
      true,
      (await count('open')) +
        (await count('done')) +
        (await count('ignored')) +
        (await count('skipped')) ===
        20_000,
    )
    const row = page.locator('[data-testid^="tasks-row-"]').first()
    await row.click()
    await settle()
    // measured in the page: from the click event to the frame that shows the new count
    timings.statusClick20000Ms = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          const counter = document.querySelector('[data-testid="tasks-count-done"]')!
          const before = counter.textContent
          const button = document.querySelector<HTMLButtonElement>(
            '[data-testid="tasks-status-done"]:not([disabled])',
          )!
          const start = performance.now()
          const poll = () => {
            if (counter.textContent !== before) resolve(Math.round(performance.now() - start))
            else requestAnimationFrame(poll)
          }
          button.click()
          requestAnimationFrame(poll)
        }),
    )
  },
  `tasks=${encodeURIComponent(TASKS_URL)}`,
)

mkdirSync(join(import.meta.dir, '../../reports'), { recursive: true })
writeFileSync(REPORT, `${JSON.stringify({ at: new Date().toISOString(), ...timings }, null, 2)}\n`)
console.log(`timings: ${JSON.stringify(timings)} -> ${REPORT}`)
process.exit(code)
