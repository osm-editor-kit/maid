/**
 * Tooltip check for Maid's top bar. The buttons of a group share one tooltip: the first button
 * opens it after a delay, another button of the group switches it at once, a button with a key
 * shows the key in a kbd, keyboard focus shows it at once, and leaving the group closes it.
 *
 *   bun tools/bench/tooltips-check.ts [scene] [--app maid]
 *
 * Expected: 11 `ok` lines and exit 0 (9 checks here, and the two that every browser check prints).
 */
import type { Locator, Page } from '@playwright/test'
import { runCheck } from './check-page'

const sceneName = process.argv[2] ?? 'small'

/** The shortcut of Search as the platform shows it: useShortcuts takes Cmd+F on Apple, Ctrl+F elsewhere */
const SEARCH_KEY = process.platform === 'darwin' ? '⌘F' : 'Ctrl+F'

/** Moves the pointer to the middle of the element (a disabled button takes the pointer on its wrapper) */
async function pointAt(page: Page, locator: Locator) {
  const box = await locator.boundingBox()
  if (!box) throw new Error('the element has no box to point at')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 })
}

/** The label of the Point button: its hint, which the tooltip shows as its label */
const POINT_LABEL = 'Add a point: click the map to place it'

/** The labels of every tooltip box on the page: a box of a group the pointer just left may still be fading out */
async function shownLabels(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('[role="tooltip"]')].map(
      (box) => box.querySelector('span.font-medium')?.textContent ?? '',
    ),
  )
}

/** What the tooltip box on the page says, and whether it is the same element as before */
type Shown = { count: number; label: string | null; kbd: string | null; kbdTag: string | null }

async function readTooltip(page: Page): Promise<Shown> {
  return page.evaluate(() => {
    const boxes = document.querySelectorAll('[role="tooltip"]')
    const box = boxes[0] as HTMLElement | undefined
    const kbd = box?.querySelector('kbd')
    return {
      count: boxes.length,
      label: box?.querySelector('span.font-medium')?.textContent ?? null,
      kbd: kbd?.textContent ?? null,
      kbdTag: kbd?.tagName ?? null,
    }
  })
}

let failed = await runCheck(sceneName, async ({ page, report }) => {
  const button = (name: string | RegExp) =>
    page.getByRole('button', typeof name === 'string' ? { name, exact: true } : { name }).first()
  const search = button('Search')
  const selection = button('Show only the selection')
  const filters = button('Filters')
  const save = button('Save')
  const point = button(/^Add a point/)

  // the first button of the top bar's group: nothing before the delay, the tooltip after it
  await pointAt(page, search)
  await page.waitForTimeout(150)
  report('hover: no tooltip before the delay', 0, (await readTooltip(page)).count)
  await page.waitForTimeout(500)
  const first = await readTooltip(page)
  await page.evaluate(() => {
    ;(window as unknown as { __tip: Element | null }).__tip =
      document.querySelector('[role="tooltip"]')
  })
  report(
    'hover: after the delay the tooltip has the label and the key in a kbd',
    { count: 1, label: 'Search', kbd: SEARCH_KEY, kbdTag: 'KBD' },
    first,
  )

  // another button of the group: the same box, the new label, at once (the delay is not run again)
  await pointAt(page, selection)
  await page.waitForTimeout(40)
  const moved = await readTooltip(page)
  const sameBox = await page.evaluate(() => {
    const box = document.querySelector('[role="tooltip"]')
    return box !== null && box === (window as unknown as { __tip: Element | null }).__tip
  })
  report(
    'move to another button: the same tooltip shows its label at once',
    { count: 1, label: 'Show only the selection', kbd: null, kbdTag: null, same: true },
    { ...moved, same: sameBox },
  )

  // the last button of the group, after another: its label at once. Save is not there while logged out (automation
  // never logs in), as "Log in" takes its place
  await pointAt(page, filters)
  await page.waitForTimeout(40)
  report(
    'move to the Filters button: its label at once, and no Save button while logged out',
    { count: 1, label: 'Filters', save: 0 },
    {
      count: (await readTooltip(page)).count,
      label: (await readTooltip(page)).label,
      save: await save.count(),
    },
  )

  // the tool row is a group of its own: the first tool waits for the delay, and shows its key
  await pointAt(page, point)
  await page.waitForTimeout(150)
  report(
    'hover Point (another group): no Point tooltip before the delay',
    0,
    (await shownLabels(page)).includes(POINT_LABEL) ? 1 : 0,
  )
  await page.waitForTimeout(500)
  report(
    'hover Point (another group): then the label and key 1',
    { count: 1, label: POINT_LABEL, kbd: '1', kbdTag: 'KBD' },
    await readTooltip(page),
  )

  // leaving the group closes it after the grace period
  await page.mouse.move(800, 620, { steps: 4 })
  await page.waitForTimeout(400)
  report('leave the group: the tooltip is gone', 0, (await readTooltip(page)).count)

  // keyboard focus shows it at once, with no delay
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  let reached = false
  for (let step = 0; step < 80 && !reached; step++) {
    await page.keyboard.press('Tab')
    reached = await page.evaluate(() => {
      const active = document.activeElement
      return active instanceof HTMLButtonElement && active.getAttribute('aria-label') === 'Filters'
    })
  }
  await page.waitForTimeout(60)
  // the box of the group that the focus left may still be fading out: the Filters box must be there
  report(
    'keyboard focus on Filters: the tooltip shows at once',
    true,
    (await shownLabels(page)).includes('Filters'),
  )

  // the top bar's buttons: no native title, and every button has a name
  const titles = await page.evaluate(() =>
    [...document.querySelectorAll('header button[title]')]
      .filter((element) => !element.closest('[role="group"]'))
      .map((element) => element.getAttribute('aria-label') ?? element.textContent?.trim() ?? ''),
  )
  report('the top bar buttons have no native title', [], titles)
  const unnamed = await page.evaluate(
    () =>
      [...document.querySelectorAll('header button')].filter(
        (element) => !(element.getAttribute('aria-label') || element.textContent?.trim()),
      ).length,
  )
  report('every header button has an accessible name', 0, unnamed)
})

process.exit(failed ? 1 : 0)
