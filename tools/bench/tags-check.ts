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
    __sheetSeveral: {
      features: { id: string; tags: Record<string, string> }[]
      each: unknown[]
    }
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

/** The Tags sheet itself (the sides view adds a table per group, labelled "…: cycleway") */
const TOP = '[role="grid"][aria-label="Tags of the feature"]'

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
          ([selector, n]) => document.querySelectorAll(selector).length === n,
          [`${TOP} [role="row"][data-row]`, count] as const,
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
      page.$$eval(`${TOP} [data-row] [data-col="key"] textarea`, (inputs) =>
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

    // A click selects (also a second click on the active cell), with no caret; Cmd/Ctrl+A is always the cell's text:
    // on a selected cell it opens the edit with all of it selected; Escape leaves the edit and keeps the cell selected
    const caret = () =>
      page.evaluate(() =>
        document.activeElement instanceof HTMLTextAreaElement
          ? getComputedStyle(document.activeElement).caretColor
          : null,
      )
    await fresh()
    await click('Value of lit')
    await click('Value of lit')
    report(
      'a second click on the selected cell keeps it selected, not edited, and shows no caret',
      { editing: false, caret: 'rgba(0, 0, 0, 0)' },
      { editing: await editing(), caret: await caret() },
    )
    await press('ControlOrMeta+A')
    report(
      'Cmd/Ctrl+A on a selected cell edits it with all of its text selected, not the table',
      { editing: true, cells: 0, text: 'yes' },
      {
        editing: await editing(),
        cells: await selectedCells(),
        text: await page.evaluate(() => String(getSelection())),
      },
    )
    await press('Escape')
    await press('ArrowUp')
    await press('ControlOrMeta+A')
    report(
      'after arrow keys too: Cmd/Ctrl+A is the text of the cell reached',
      { focus: 'Value of highway', editing: true, text: 'residential' },
      {
        focus: await focused(),
        editing: await editing(),
        text: await page.evaluate(() => String(getSelection())),
      },
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

    // --- The sides view (?harness=tags&sides=1): one sheet; the tags with no side on top (their value cell spans
    // both side columns), then each group under a headline, a row per key with {side}, a left and a right value ---
    await page.goto(page.url().replace('harness=tags', 'harness=tags&sides=1'))
    await page.waitForFunction(() => window.__sheet !== undefined)
    await frame(page)
    const grids = () =>
      page.$$eval('[role="grid"]', (items) => items.map((item) => item.getAttribute('aria-label')))
    const headings = () =>
      page.$$eval('[data-heading]', (items) =>
        items.map((item) => item.getAttribute('data-heading')),
      )
    const sideRows = () =>
      page.$$eval(`${TOP} [role="row"][data-row^="side:"]`, (rows) =>
        rows.map((row) =>
          ['key', 'value', 'right'].map(
            (col) =>
              row.querySelector<HTMLTextAreaElement>(`[data-col="${col}"] textarea`)?.value ?? '',
          ),
        ),
      )
    const stored = async () => sorted(await tags())
    const exactKeys = [
      'cycleway:both',
      'cycleway:both:lane',
      'cycleway:both:width',
      'cycleway:left:oneway',
      'cycleway:right:oneway',
      'highway',
      'name',
      'parking:both',
      'sidewalk:both',
      'source:cycleway:both:width',
      'surface',
      '',
    ]
    report(
      'Raw: the tags as stored, sorted as iD, no headlines',
      { keys: exactKeys, headings: [] },
      { keys: await keys(), headings: await headings() },
    )
    const storedBefore = await stored()
    await page.getByRole('radio', { name: 'Sides' }).click()
    await rowsSettle(12)
    // the switch's tooltip would cover the cells below it
    await page.mouse.move(4, 4)
    report(
      'Sides: one sheet, the tags with no side and the empty row on top, then sidewalk, cycleway and parking',
      {
        grids: ['Tags of the feature'],
        keys: [
          'highway',
          'name',
          'surface',
          '',
          'sidewalk:{side}',
          'cycleway:{side}',
          'cycleway:{side}:lane',
          'cycleway:{side}:oneway',
          'cycleway:{side}:width',
          'source:cycleway:{side}:width',
          'parking:{side}',
        ],
        headings: ['side:sidewalk:{side}', 'side:cycleway:{side}', 'side:parking:{side}'],
        checked: 'true',
        stored: true,
        calls: 0,
      },
      {
        grids: await grids(),
        keys: await keys(),
        headings: await headings(),
        checked: await page.getByRole('radio', { name: 'Sides' }).getAttribute('aria-checked'),
        stored: storedBefore === (await stored()),
        calls: await calls(),
      },
    )
    report(
      'a group row: the key with {side}, the left value under the value column, the right one beside it',
      [
        ['cycleway:{side}', 'lane', 'lane'],
        ['cycleway:{side}:lane', 'advisory', 'advisory'],
        ['cycleway:{side}:oneway', '-1', 'yes'],
      ],
      (await sideRows()).slice(1, 4),
    )
    report(
      'a row with no side has one value cell over both columns; the key shows the side as an italic word',
      { span: 'span 2', italic: 'side' },
      {
        span: await page.evaluate(
          () =>
            document
              .querySelector<HTMLElement>('textarea[aria-label="Value of highway"]')
              ?.closest<HTMLElement>('[data-col]')?.style.gridColumn ?? null,
        ),
        italic: await page.locator(`${TOP} [data-col="key"] i`).first().textContent(),
      },
    )
    await click('Value of surface')
    const walk: (string | null)[] = []
    for (const key of ['ArrowDown', 'ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowUp']) {
      await press(key)
      walk.push(await focused())
    }
    report(
      'one selection through the whole sheet: the arrows go from the merged cells into the sides and back',
      [
        'Value of new row',
        'left of sidewalk:side',
        'right of sidewalk:side',
        'Value of new row',
        'Value of surface',
      ],
      walk,
    )
    await edit('left of cycleway:side')
    // the list comes after the suggestion delay
    await page
      .waitForSelector('[role="listbox"] [role="option"]', { timeout: 3000 })
      .catch(() => undefined)
    const offered = await page.$$eval('[role="listbox"] [role="option"]', (items) =>
      items.map((item) => item.textContent ?? ''),
    )
    report(
      'an edit opened with nothing typed lists the presets values of the side key, not only the value it has',
      { many: true, track: true },
      {
        many: offered.length > 3,
        track: offered.some((text) => text.startsWith('track')),
      },
    )
    await press('Escape')
    await press('Escape')
    await edit('left of cycleway:side:width')
    await press('ControlOrMeta+A')
    await type('2')
    await press('Enter')
    const split = await tags()
    report(
      'a side changed is saved as left and right, the both key goes, the source stays both',
      { left: '2', right: '1.5', both: undefined, source: 'Luftbild 2025', calls: 1 },
      {
        left: split['cycleway:left:width'],
        right: split['cycleway:right:width'],
        both: split['cycleway:both:width'],
        source: split['source:cycleway:both:width'],
        calls: await calls(),
      },
    )
    await edit('right of cycleway:side:width')
    await press('ControlOrMeta+A')
    await type('2')
    await press('Enter')
    const merged = await tags()
    report(
      'the other side set to the same value: saved as both again, still one row',
      { both: '2', left: undefined, right: undefined, row: ['cycleway:{side}:width', '2', '2'] },
      {
        both: merged['cycleway:both:width'],
        left: merged['cycleway:left:width'],
        right: merged['cycleway:right:width'],
        row: (await sideRows())[4],
      },
    )
    await page.getByRole('radio', { name: 'Raw' }).click()
    await rowsSettle(12)
    // the switch's tooltip would cover the cells below it
    await page.mouse.move(4, 4)
    report(
      'back to Raw: the tags as stored, no headlines',
      { keys: exactKeys, headings: [] },
      { keys: await keys(), headings: await headings() },
    )

    // --- The sides view of several features (?harness=tags&sides=1&several=1): two roads, each with its own :both ---
    await page.goto(page.url().replace('sides=1', 'sides=1&several=1'))
    await page.waitForFunction(() => window.__sheetSeveral !== undefined)
    await frame(page)
    const MANY = '[role="grid"][aria-label="Tags of several"]'
    const manyRows = () =>
      page.$$eval(`${MANY} [role="row"][data-row^="side:"]`, (rows) =>
        rows.map((row) =>
          ['key', 'value', 'right'].map((col) => {
            const input = row.querySelector<HTMLTextAreaElement>(`[data-col="${col}"] textarea`)
            return input === null ? '' : input.value || input.placeholder
          }),
        ),
      )
    const roads = () =>
      page.evaluate(() =>
        Object.fromEntries(
          window.__sheetSeveral.features.map((road) => [
            road.id,
            Object.fromEntries(Object.entries(road.tags).sort(([a], [b]) => (a < b ? -1 : 1))),
          ]),
        ),
      )
    const writes = () => page.evaluate(() => window.__sheetSeveral.each.length)
    report(
      'several features by sides: a side all features agree on has its value, one where they differ "Multiple values"',
      [
        ['cycleway:{side}', 'lane', 'Multiple values'],
        ['cycleway:{side}:width', 'Multiple values', 'Multiple values'],
      ],
      await manyRows(),
    )
    await edit('right of cycleway:side')
    await press('ControlOrMeta+A')
    await type('track')
    await press('Enter')
    report(
      'a side set for all: the feature that had :both is written with its two sides, the other is not changed',
      {
        writes: 1,
        w1: {
          'cycleway:both:width': '1.5',
          'cycleway:left': 'lane',
          'cycleway:right': 'track',
          highway: 'residential',
        },
        w2: {
          'cycleway:both:width': '2',
          'cycleway:left': 'lane',
          'cycleway:right': 'track',
          highway: 'residential',
        },
      },
      { writes: await writes(), ...(await roads()) },
    )
    await edit('left of cycleway:side:width')
    await press('ControlOrMeta+A')
    await type('2')
    await press('Enter')
    const after = await roads()
    report(
      'each feature merges its own sides: one splits its width, the other keeps :both, one step',
      {
        writes: 2,
        w1: { left: '2', right: '1.5', both: undefined },
        w2: { left: undefined, right: undefined, both: '2' },
      },
      {
        writes: await writes(),
        w1: {
          left: after.w1?.['cycleway:left:width'],
          right: after.w1?.['cycleway:right:width'],
          both: after.w1?.['cycleway:both:width'],
        },
        w2: {
          left: after.w2?.['cycleway:left:width'],
          right: after.w2?.['cycleway:right:width'],
          both: after.w2?.['cycleway:both:width'],
        },
      },
    )

    // --- A side set to "no": its other cells become errors; Cmd/Ctrl+Backspace removes the selected row ---
    await page.goto(page.url().replace('&several=1', ''))
    await page.waitForFunction(() => window.__sheet !== undefined)
    await frame(page)
    await page.getByRole('radio', { name: 'Sides' }).click()
    await rowsSettle(12)
    await page.mouse.move(4, 4)
    await writeClipboard('cycleway:both=track')
    await click('Key of new row')
    await press('ControlOrMeta+V')
    const pasted = await tags()
    report(
      'a :both key pasted on top replaces the sides, never stands beside them',
      { both: 'track', left: undefined, right: undefined },
      {
        both: pasted['cycleway:both'],
        left: pasted['cycleway:left'],
        right: pasted['cycleway:right'],
      },
    )
    await edit('left of cycleway:side')
    await press('ControlOrMeta+A')
    await type('no')
    await press('Enter')
    const invalidLeft = () =>
      page.$$eval(`${TOP} [role="row"][data-row^="side:"]`, (rows) =>
        rows
          .filter(
            (row) =>
              row.querySelector('[data-col="value"] textarea')?.getAttribute('aria-invalid') ===
              'true',
          )
          .map((row) => row.querySelector<HTMLTextAreaElement>('[data-col="key"] textarea')?.value),
      )
    report(
      'a side set to "no": the values left on that side are errors, the side key and the other side are not',
      [
        'cycleway:{side}:lane',
        'cycleway:{side}:oneway',
        'cycleway:{side}:width',
        'source:cycleway:{side}:width',
      ],
      await invalidLeft(),
    )
    await click('left of cycleway:side:lane')
    report(
      'the selected cell says why under the sheet',
      true,
      (await status())?.includes('cycleway:left is "no"') ?? false,
    )
    await press('ControlOrMeta+Backspace')
    await rowsSettle(14)
    const removed = await tags()
    report(
      'Cmd/Ctrl+Backspace on a group row removes the attribute on both sides, as one change',
      { left: undefined, right: undefined, both: undefined, gone: false },
      {
        left: removed['cycleway:left:lane'],
        right: removed['cycleway:right:lane'],
        both: removed['cycleway:both:lane'],
        gone: (await keys()).includes('cycleway:{side}:lane'),
      },
    )
    await click('Value of name')
    await press('ControlOrMeta+Backspace')
    await rowsSettle(12)
    report(
      'Cmd/Ctrl+Backspace on a row with no side removes its tag, and the focus stays in the sheet',
      { name: undefined, focusInSheet: true },
      {
        name: (await tags()).name,
        focusInSheet: await page.evaluate(
          () => document.activeElement?.closest('[role="grid"]') !== null,
        ),
      },
    )
  },
  'harness=tags',
  false,
  ['clipboard-read', 'clipboard-write'],
)

process.exit(code)
