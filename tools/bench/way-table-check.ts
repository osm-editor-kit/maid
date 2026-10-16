/**
 * Way table check for Maid: the dock tab "Way table" on a selected way (way 61231309 on Müggelheimer Straße, the
 * relations scene). It checks the columns and their "Selected" mark, the state words and the ≠ mark of a differing
 * cell, "Show 3 more", a cell edit of a neighbour (one undo step), and "Set on N" for a row with its confirm bar (one
 * undo step). A read-only case is skipped: the table's read-only columns need a filter, which the check does not set.
 *
 *   bun tools/bench/way-table-check.ts [scene] --app bicycle
 *
 * Prints one line per check: `ok <check>`, or `FAIL <check>`. Exits 1 on any failure.
 */
import { runCheck } from './check-page'

const sceneName = process.argv[2] ?? 'relations'
const WAY = 'w61231309'
const TEST_VALUE = 'maidcheck'

type Column = { id: string; reversed: boolean }
type CellRead = {
  key: string
  col: string
  words: string
  mark: boolean
  dependent: boolean
}
type TableRead = { columns: Column[]; referenceMarked: boolean; states: CellRead[] }

process.exit(
  await runCheck(
    sceneName,
    async ({ page, report, settle }) => {
      await page.evaluate((id) => window.__bench.select(id), WAY)
      await settle()
      await page.getByRole('tab', { name: 'Way table' }).click()
      await settle()
      const panel = page.getByRole('tabpanel')

      /** Rows exist only in open groups: open every folded group (the toggles say aria-expanded="false") */
      const openGroups = async () => {
        for (let i = 0; i < 12; i++) {
          const folded = panel.locator('button[aria-expanded="false"][aria-label^="Show or hide"]')
          if ((await folded.count()) === 0) break
          await folded.first().click()
        }
        await settle()
      }
      await openGroups()

      /** The table as the DOM shows it: columns from the header buttons (title = way id), cells from the data attributes */
      const table = () =>
        page.evaluate((ref) => {
          const dock = document.querySelector('[role="tabpanel"]')!
          const headers = Array.from(dock.querySelectorAll('thead th[scope="col"]'))
          const columns = headers.flatMap((th) => {
            const id = th.querySelector('button[title]')?.getAttribute('title') ?? ''
            if (!/^[wnr]\d+$/.test(id)) return []
            return [{ id, reversed: (th.textContent ?? '').includes('⇄') }]
          })
          const referenceHeader = headers.find((th) => th.querySelector(`button[title="${ref}"]`))
          const referenceMarked = (referenceHeader?.textContent ?? '').includes('Selected')
          const states = Array.from(dock.querySelectorAll('td[data-cell]')).map((td) => ({
            key: td.getAttribute('data-row-key') ?? '',
            col: td.getAttribute('data-col-id') ?? '',
            words: td.querySelector('.sr-only')?.textContent ?? '',
            // the mark is an aria-hidden span with the text of the tone: ≠ for a different value
            mark: Array.from(td.querySelectorAll('span[aria-hidden]')).some(
              (span) => span.textContent === '≠',
            ),
            dependent: (td.textContent ?? '').includes('⇄'),
          }))
          return { columns, referenceMarked, states }
        }, WAY) as Promise<TableRead>

      /** Tags of an entity in the staging graph (what the history holds, after the edits) */
      const tagsOf = (id: string) =>
        page.evaluate(
          (id) => ({ ...window.__maid.editor.history.staging.graph.hasEntity(id)!.tags }),
          id,
        ) as Promise<Record<string, string>>
      const snapshot = (ids: string[]) =>
        page.evaluate(
          (ids) =>
            Object.fromEntries(
              ids.map((id) => [
                id,
                { ...window.__maid.editor.history.staging.graph.hasEntity(id)!.tags },
              ]),
            ),
          ids,
        ) as Promise<Record<string, Record<string, string>>>
      const undoLabel = () =>
        page.evaluate(() => window.__maid.engine.undoState().undoLabel ?? null)

      // --- the columns, and the selected way marked ---
      const first = await table()
      const neighbours = first.columns.filter((column) => column.id !== WAY)
      report('the selected way is a column marked "Selected"', true, first.referenceMarked)
      report('at least one neighbour column', true, neighbours.length >= 1)

      // --- the state of a cell: its words and its mark ---
      const differing = first.states.filter((state) => state.words.startsWith('Different'))
      report(
        'a differing cell says so and shows the ≠ mark',
        true,
        differing.length > 0 && differing.every((s) => s.mark),
      )
      report(
        'only a differing cell carries the ≠ mark',
        true,
        first.states
          .filter((state) => state.mark)
          .every((state) => state.words.startsWith('Different')),
      )

      // --- "Show 3 more" adds columns, when the chain stops at the limit ---
      const more = panel.getByRole('button', { name: /^Show \d+ more$/ })
      if ((await more.count()) > 0) {
        const before = (await table()).columns.length
        await more.first().click()
        await settle()
        await openGroups()
        const after = (await table()).columns.length
        // the actual is the counts, so a failure says what the table showed
        // the limit is shared by both sides: one click adds up to three to each side that stops at it
        const sides = (await panel.getByRole('button', { name: /^Show \d+ more$/ }).count()) || 1
        const grew = after > before && after - before <= 3 * sides
        if (grew) console.log('ok "Show more" adds up to three columns')
        else
          report(
            '"Show more" adds up to three columns per side',
            'more than before, at most three per side',
            `${before} -> ${after}`,
          )
      } else {
        console.log('skip show more: the chain does not stop at the limit here')
      }

      // --- a cell edit of a neighbour: the tag changes, and one undo takes it back ---
      const current = await table()
      const target = current.states.find(
        (state) =>
          state.col !== WAY &&
          !state.dependent &&
          !current.columns.find((column) => column.id === state.col)?.reversed &&
          !state.words.startsWith('Missing'),
      )
      if (!target) {
        report('a plain neighbour cell to edit', 'found', null)
      } else {
        const { key, col } = target
        const tagsBefore = await tagsOf(col)
        const cell = page.locator(`td[data-cell][data-row-key="${key}"][data-col-id="${col}"]`)
        await cell.click()
        const input = cell.locator('input')
        await input.waitFor()
        await input.fill(TEST_VALUE)
        await input.press('Enter')
        await settle()
        report('the edit writes the tag on the neighbour', TEST_VALUE, (await tagsOf(col))[key])
        const label = (await undoLabel()) ?? ''
        report(
          'the edit is one named undo step',
          true,
          label.startsWith('Changed ') && label.includes(key),
        )
        await page.evaluate(() => window.__maid.engine.undo())
        await settle()
        report('one undo restores the neighbour exactly', tagsBefore, await tagsOf(col))
      }

      // --- "Set on N" for a row: the confirm bar, Apply writes every neighbour, one undo step ---
      const setAll = panel.getByRole('button', { name: /^Set on \d+$/ })
      if ((await setAll.count()) === 0) {
        report('a row with "Set on N"', 'found', null)
      } else {
        const row = setAll.first().locator('xpath=ancestor::tr[1]')
        const rowKey = (await row.getAttribute('data-row-key')) ?? ''
        const count = Number((await setAll.first().textContent())?.replace(/\D+/g, '') ?? '0')
        // the columns as they are now: "Show more" may have added some since the start
        const ids = (await table()).columns.map((column) => column.id)
        const before = await snapshot(ids)
        const reference = before[WAY]?.[rowKey]
        await setAll.first().click()
        await settle()
        const bar = panel.getByRole('group', { name: /^Set on \d+$/ })
        report('the confirm bar opens for the row', 1, await bar.count())
        await bar.getByRole('button', { name: 'Apply', exact: true }).click()
        await settle()
        report(
          'the batch is one named undo step',
          true,
          ((await undoLabel()) ?? '').startsWith('Set '),
        )
        // the bar closes when the batch is applied; the table is read after React has drawn the new state
        await bar.waitFor({ state: 'detached', timeout: 5000 }).catch(() => undefined)
        await settle()
        const after = await table()
        const plain = after.states
          .filter((state) => state.key === rowKey && state.col !== WAY && !state.dependent)
          .map((state) => state.col)
        // the data is the ground truth: every plain neighbour holds the reference value for the key
        const now = await snapshot(ids)
        const left = plain
          .filter((id) => now[id]?.[rowKey] !== reference)
          .map(
            (id) =>
              `${id}: ${before[id]?.[rowKey] ?? '(no key)'} -> ${now[id]?.[rowKey] ?? '(no key)'}`,
          )
        report(
          `"Set on ${count}": every plain neighbour holds the reference value for ${rowKey} in the data`,
          { left: [] },
          { left },
        )
        await page.evaluate(() => window.__maid.engine.undo())
        await settle()
        report('one undo restores every neighbour of the batch', before, await snapshot(ids))
      }
    },
    '',
    false,
  ),
)
