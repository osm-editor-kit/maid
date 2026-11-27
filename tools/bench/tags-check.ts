/**
 * Browser check of the Tags sheet (packages/ui/src/sheet, docs/research/sheet-design.md section 9), with real keys,
 * mouse and clipboard. It runs on the dev server's harness page (packages/shell/src/sheet-harness.tsx, `?harness=tags`):
 * the sheet on its own, the editor's keys mounted, no map. Data is read from `window.__sheet`, the editor from
 * `window.__maid`, focus from the focused input's aria-label.
 *
 *   bun tools/bench/tags-check.ts
 */
import type { Page } from '@playwright/test'
import { runCheck } from './check-page'

declare global {
  interface Window {
    __sheet: {
      tags: Record<string, string>
      calls: { tags: Record<string, string>; label: string }[]
      undo: number
      redo: number
    }
  }
}

/** Waits for two frames: React has rendered the change and the focus effect has run. */
const frame = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  )

const code = await runCheck(
  'small',
  async ({ page, report }) => {
    const press = async (key: string) => {
      await page.keyboard.press(key)
      await frame(page)
    }
    const type = async (text: string) => {
      await page.keyboard.type(text)
      await frame(page)
    }
    const click = async (label: string) => {
      await page.locator(`textarea[aria-label="${label}"]`).click()
      await frame(page)
    }
    // a click selects a cell, a double click edits it (as in Google Sheets)
    const edit = async (label: string) => {
      await page.locator(`textarea[aria-label="${label}"]`).dblclick()
      await frame(page)
    }
    const editing = () =>
      page.evaluate(() => {
        const active = document.activeElement
        return active instanceof HTMLTextAreaElement ? !active.readOnly : false
      })
    // a removed row plays its exit animation first (AnimatePresence keeps it until then)
    const rowsSettle = (count: number) =>
      page
        .waitForFunction(
          (n) => document.querySelectorAll('[role="grid"] [data-row]').length === n,
          count,
          { timeout: 3000 },
        )
        .catch(() => undefined)
    const selectedCells = () =>
      page.locator('[role="grid"] [role="gridcell"][aria-selected="true"]').count()
    const outside = async () => {
      await page.mouse.click(4, 4)
      await frame(page)
    }
    const focused = () =>
      page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? null)
    const keys = () =>
      page.$$eval('[role="grid"] [data-row] [data-col="key"] textarea', (inputs) =>
        inputs.map((input) => (input instanceof HTMLTextAreaElement ? input.value : '')),
      )
    const tags = () => page.evaluate(() => window.__sheet.tags)
    const calls = () => page.evaluate(() => window.__sheet.calls.length)
    const lastLabel = () => page.evaluate(() => window.__sheet.calls.at(-1)?.label ?? null)
    const status = () => page.locator('[role="status"]').textContent()
    const writeClipboard = (text: string) =>
      page.evaluate((value) => navigator.clipboard.writeText(value), text)
    const readClipboard = () => page.evaluate(() => navigator.clipboard.readText())
    const fresh = async () => {
      await page.reload()
      await page.waitForFunction(() => window.__sheet !== undefined)
      await frame(page)
    }
    const sorted = (value: Record<string, string>) =>
      Object.keys(value)
        .sort()
        .map((key) => `${key}=${value[key] ?? ''}`)
        .join('\n')

    // Rows and order at the start: a row per tag, sorted, and an empty row last
    await fresh()
    report(
      'tags: a row per tag, sorted, and an empty row last',
      ['highway', 'lit', 'maxspeed', 'name', 'surface', ''],
      await keys(),
    )

    // Escape puts the value back and changes nothing
    await edit('Value of lit')
    await type('XYZ')
    await press('Escape')
    report(
      'Escape cancels an edit: the value stays, no change is made',
      { lit: 'yes', calls: 0 },
      { lit: (await tags()).lit, calls: await calls() },
    )

    // A click selects (also a second click on the active cell); Cmd/Ctrl+A there selects the whole table, while in an
    // edit it selects the cell's text only; Escape leaves the edit and keeps the cell selected
    await fresh()
    await click('Value of lit')
    await click('Value of lit')
    report(
      'a second click on the selected cell keeps it selected, not edited',
      false,
      await editing(),
    )
    await press('ControlOrMeta+A')
    report(
      'Cmd/Ctrl+A on a selected cell selects every row of the table (5 tags, 10 cells), not the text',
      { cells: 10, editing: false },
      { cells: await selectedCells(), editing: await editing() },
    )
    await press('Escape')
    await edit('Value of lit')
    await press('ControlOrMeta+A')
    report(
      'in an edit Cmd/Ctrl+A selects only the text of that cell',
      { editing: true, cells: 0, text: 'yes' },
      {
        editing: await editing(),
        cells: await selectedCells(),
        text: await page.evaluate(() => String(getSelection())),
      },
    )
    await press('Escape')
    report(
      'Escape leaves the edit, and the cell stays selected',
      { editing: false, focus: 'Value of lit' },
      { editing: await editing(), focus: await focused() },
    )

    // Tab and Shift+Tab move along the row, and Enter edits the cell in focus
    await click('Key of highway')
    const moved: (string | null)[] = []
    await press('Tab')
    moved.push(await focused())
    await press('Tab')
    moved.push(await focused())
    await press('Shift+Tab')
    moved.push(await focused())
    report(
      'tab: the value of the row, the next key, back to the value',
      ['Value of highway', 'Key of lit', 'Value of highway'],
      moved,
    )
    await press('Enter')
    report(
      'Enter on a cell starts an edit',
      false,
      await page.evaluate(() => {
        const active = document.activeElement
        return active instanceof HTMLTextAreaElement ? active.readOnly : true
      }),
    )
    await press('Escape')

    // A new key in the empty row adds a tag in one step; a key that exists moves the focus to its value
    await fresh()
    await click('Key of new row')
    await type('access')
    await press('Tab')
    report(
      'a key typed in the empty row is kept, and Tab goes to its value',
      'Value of access',
      await focused(),
    )
    await type('no')
    await press('Enter')
    report(
      'typing in the empty row adds one tag, as one change',
      { access: 'no', calls: 1, label: 'Added a tag' },
      { access: (await tags()).access, calls: await calls(), label: await lastLabel() },
    )
    report(
      'after the tag a new empty row appears at the end',
      ['highway', 'lit', 'maxspeed', 'name', 'surface', 'access', ''],
      await keys(),
    )
    await type('name')
    await press('Tab')
    report(
      'a key that exists moves the focus to its value, and adds nothing',
      { focus: 'Value of name', calls: 1 },
      { focus: await focused(), calls: await calls() },
    )

    // A copied tag pasted into the empty row while its key exists: the row is kept and its key cell is edited
    await fresh()
    await writeClipboard('highway=residential')
    await click('Key of new row')
    await press('ControlOrMeta+V')
    report(
      'a tag pasted into the empty row whose key exists is kept as a row, its key cell in an edit, no change made',
      { focus: 'Key of highway', editing: true, value: 'residential', calls: 0, warning: 0 },
      {
        focus: await focused(),
        editing: await editing(),
        value: await page.locator('textarea[aria-label="Value of highway"]').last().inputValue(),
        calls: await calls(),
        warning: await page.locator('[data-row-warning]').count(),
      },
    )
    await press('Escape')
    report(
      'after the edit the row is checked: amber, with an exclamation mark that says it will be ignored',
      { warning: 1, says: true, editing: false },
      {
        warning: await page.locator('[data-row-warning]').count(),
        says:
          (
            await page
              .locator('textarea[aria-label="Key of highway"]')
              .last()
              .getAttribute('aria-description')
          )?.includes('will be ignored') ?? false,
        editing: await editing(),
      },
    )
    await press('ArrowDown')
    await rowsSettle(6)
    report(
      'leaving the row with the problem still there drops it, and the line under the sheet says so',
      {
        keys: ['highway', 'lit', 'maxspeed', 'name', 'surface', ''],
        calls: 0,
        said: true,
      },
      {
        keys: await keys(),
        calls: await calls(),
        said: (await status())?.includes('Row ignored') ?? false,
      },
    )
    await click('Key of new row')
    await press('ControlOrMeta+V')
    await type(':note')
    await press('Enter')
    report(
      'a pasted row whose key is changed becomes a tag when the edit ends, as one change',
      { tag: 'residential', highway: 'residential', calls: 1, label: 'Added a tag', warning: 0 },
      {
        tag: (await tags())['highway:note'],
        highway: (await tags()).highway,
        calls: await calls(),
        label: await lastLabel(),
        warning: await page.locator('[data-row-warning]').count(),
      },
    )
    await click('Key of new row')
    await press('ControlOrMeta+V')
    await press('Enter')
    report(
      'Enter on a row with a problem keeps the focus on it',
      { focus: 'Key of highway', warning: 1 },
      { focus: await focused(), warning: await page.locator('[data-row-warning]').count() },
    )
    await outside()
    await rowsSettle(7)
    report(
      'leaving the sheet with the problem still there drops the row',
      { rows: 7, calls: 1 },
      { rows: (await keys()).length, calls: await calls() },
    )

    // Renaming a key keeps the row in place while the focus is in the sheet, and sorts it after
    await fresh()
    await edit('Key of highway')
    await press('ControlOrMeta+A')
    await type('zhighway')
    await press('Enter')
    report(
      'renaming a key keeps the row in place while the focus is in the sheet',
      { first: 'zhighway', tag: 'residential', calls: 1, label: 'Changed tags' },
      {
        first: (await keys())[0],
        tag: (await tags()).zhighway,
        calls: await calls(),
        label: await lastLabel(),
      },
    )
    await outside()
    report(
      'and after the focus leaves the sheet the row is sorted',
      ['lit', 'maxspeed', 'name', 'surface', 'zhighway', ''],
      await keys(),
    )

    // Clearing a value removes the tag and keeps the row until the focus leaves
    await edit('Value of name')
    await press('ControlOrMeta+A')
    await press('Backspace')
    await press('Enter')
    report(
      'clearing a value removes the tag but keeps its row',
      { name: undefined, row: true, label: 'Removed a tag' },
      { name: (await tags()).name, row: (await keys()).includes('name'), label: await lastLabel() },
    )
    await outside()
    // A removed row plays its exit animation first (AnimatePresence keeps it until then): wait for it
    await page.waitForFunction(
      () => !document.querySelector('textarea[aria-label="Key of name"]'),
      undefined,
      {
        timeout: 3000,
      },
    )
    report('the row goes when the focus leaves the sheet', false, (await keys()).includes('name'))

    // Paste: three lines, one change call, and the status line says what happened
    await fresh()
    await writeClipboard('lit=no\nfoo=bar\nsmoothness=good')
    await click('Key of surface')
    await press('ControlOrMeta+V')
    report(
      'paste of 3 key=value lines: 2 added and 1 replaced, in one change',
      { calls: 1, status: '3 tags pasted, 1 replaced', lit: 'no', foo: 'bar', smoothness: 'good' },
      {
        calls: await calls(),
        status: (await status())?.includes('3 tags pasted, 1 replaced')
          ? '3 tags pasted, 1 replaced'
          : await status(),
        lit: (await tags()).lit,
        foo: (await tags()).foo,
        smoothness: (await tags()).smoothness,
      },
    )

    // A line with no value is refused and named; nothing is removed
    const before = await tags()
    await writeClipboard('foo=\nlit=no')
    await click('Key of surface')
    await press('ControlOrMeta+V')
    report(
      'a line "foo=" is refused and named; nothing is removed',
      { same: true, named: true },
      {
        same: JSON.stringify(before) === JSON.stringify(await tags()),
        named: (await status())?.includes('Line 1: foo=') ?? false,
      },
    )

    // Two rows dragged, then copied: two key=value lines
    const from = page.locator('textarea[aria-label="Key of foo"]')
    const to = page.locator('textarea[aria-label="Value of highway"]')
    const a = await from.boundingBox()
    const b = await to.boundingBox()
    if (a && b) {
      await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
      await page.mouse.down()
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 6 })
      await page.mouse.up()
      await frame(page)
    }
    await press('ControlOrMeta+C')
    await page.waitForTimeout(100)
    const current = await tags()
    report(
      'dragging two rows and copying gives their key=value lines',
      `foo=${current.foo ?? ''}\nhighway=${current.highway ?? ''}`,
      await readClipboard(),
    )

    // Copy all: every tag, sorted
    await page.getByRole('button', { name: 'Copy all' }).click()
    await frame(page)
    await page.waitForTimeout(100)
    report(
      'Copy all gives every tag as key=value, and says Copied',
      sorted(await tags()),
      await readClipboard(),
    )
    report(
      'Copy all says Copied',
      'Copied',
      (await status())?.includes('Copied') ? 'Copied' : await status(),
    )

    // Delete on a selected value clears it
    await fresh()
    await click('Value of surface')
    await press('Delete')
    report(
      'Delete on a selected value clears it',
      { surface: undefined, label: 'Removed a tag' },
      { surface: (await tags()).surface, label: await lastLabel() },
    )

    // A value of 300 characters is kept and marked invalid
    await edit('Value of maxspeed')
    await press('ControlOrMeta+A')
    await type('x'.repeat(300))
    report(
      'a long value shows how far over the limit it is while it is typed',
      true,
      (await status())?.includes('45 characters too long') ?? false,
    )
    await press('Enter')
    report(
      'a value of 300 characters is kept, and its cell is invalid',
      { length: 300, invalid: 'true' },
      {
        length: (await tags()).maxspeed?.length,
        invalid: await page
          .locator('textarea[aria-label="Value of maxspeed"]')
          .getAttribute('aria-invalid'),
      },
    )

    // Cmd/Ctrl+Z in a cell is the editor's undo
    await click('Value of lit')
    await press('ControlOrMeta+Z')
    report('Cmd+Z in a cell calls the host undo', 1, await page.evaluate(() => window.__sheet.undo))

    // The editor's keys do not reach the editor while a cell has the focus
    await click('Value of lit')
    const modeBefore = await page.evaluate(() => window.__maid.engine.mode)
    const selectionBefore = await page.evaluate(() => [...window.__maid.engine.selection])
    await press('1')
    await press('m')
    await press('Escape')
    await press('ArrowDown')
    await press('ArrowLeft')
    await press('Delete')
    report(
      '1, m, Escape, arrows and Delete in a cell do not reach the editor (mode and selection unchanged)',
      { mode: modeBefore, selection: selectionBefore },
      {
        mode: await page.evaluate(() => window.__maid.engine.mode),
        selection: await page.evaluate(() => [...window.__maid.engine.selection]),
      },
    )
  },
  'harness=tags',
  false,
  ['clipboard-read', 'clipboard-write'],
)

process.exit(code)
