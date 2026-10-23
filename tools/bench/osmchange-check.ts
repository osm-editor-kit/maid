/**
 * osmChange check for the module-osmchange (on in the bicycle app): "Load changes from a file…" in the account menu
 * with packages/module-osmchange/test-files/outdated.osc against the mock API on the small scene. The file is "made"
 * from older versions that tools/mock-osm-api/history/small.json holds, so the merge has a base without a server:
 *
 * - the base versions are asked from the mock (`node/<id>/<version>`);
 * - what needs no decision is written on loading, as one undo step; the map flies to the elements to decide;
 * - the review: groups as disclosures (only "To decide" open), 2 to decide (a tag both changed, a delete of an
 *   element changed since, which starts on "keep"), 2 merged (a key the server changed kept; both moved a node), the
 *   new elements, the unchanged ones; what the file changed in words, versions only where they differ;
 * - a new element that equals one on the server (around the new nodes, `map?bbox`) is not created again;
 * - a decision is written as its own undo step, a changed decision replaces it;
 * - the changeset gets `osmchange:created_by` and a comment to start with, while the file's changes are in the editor;
 * - the dock tab appears only once a file is picked; "Highlight differences" switches the colours off and on; undo takes it all back; a file over an element changed here
 *   and not saved is refused.
 *
 * No upload: the mock rejects writes, and the module never uploads (the person saves as usual).
 *
 *   bun tools/bench/osmchange-check.ts [scene] --app bicycle
 *
 * Prints one line per check: `ok <check>`, or `FAIL <check>`. Exits 1 on any failure.
 */
import { join } from 'node:path'
import { PORTS } from '../ports'
import { runCheck } from './check-page'

const sceneName = process.argv[2] ?? 'small'
const FILE = join(import.meta.dir, '../../packages/module-osmchange/test-files/outdated.osc')

process.exit(
  await runCheck(sceneName, async ({ page, report, settle }) => {
    const entity = (id: string) =>
      page.evaluate((id) => {
        const found = window.__maid.editor.history.staging.graph.hasEntity(id)
        if (!found) return null
        const loc = (found as unknown as { loc?: [number, number] }).loc
        return { tags: { ...found.tags }, version: found.version ?? null, lat: loc?.[1] ?? null }
      }, id)
    const changes = () =>
      page.evaluate(() => {
        const { created, modified, deleted } = window.__maid.editor.history.changes()
        return { created: created.length, modified: modified.length, deleted: deleted.length }
      })
    const undoLabel = () => page.evaluate(() => window.__maid.engine.undoState().undoLabel ?? null)
    // what the module adds to the changeset (`changeset.tags`): the save form itself needs a login, which checks never do
    const changeset = () =>
      page.evaluate(() => {
        const item = window.__maid.editor.registry('changeset.tags').get('osmchange') as
          | { tags?: () => Record<string, string>; comment?: () => string | undefined }
          | undefined
        return { tags: item?.tags?.() ?? {}, comment: item?.comment?.() ?? null }
      })
    const panel = page.locator('[role="tabpanel"]')
    const group = (id: string) => page.locator(`[data-osmchange-group="${id}"]`)
    const expanded = (id: string) =>
      group(id).locator('button[aria-expanded]').first().getAttribute('aria-expanded')
    const openGroup = async (id: string) => {
      if ((await expanded(id)) === 'false')
        await group(id).locator('button[aria-expanded]').first().click()
    }
    const row = (key: string) => page.locator(`[data-osmchange-item="${key}"]`)
    const load = async () => {
      await page.getByRole('button', { name: 'Log in' }).first().click()
      await page.getByRole('button', { name: /Load changes from a file/ }).waitFor()
      await page.locator('input[data-osmchange-file]').setInputFiles(FILE)
    }

    // --- no tab before a file is picked; the menu entry, and loading the file ---
    report(
      'no "Changes from file" tab before a file is loaded',
      0,
      await page.getByRole('tab', { name: 'Changes from file' }).count(),
    )
    await fetch(`http://localhost:${PORTS.mockApi}/requests/reset`)
    await page.getByRole('button', { name: 'Log in' }).first().click()
    report(
      'the account menu has "Load changes from a file…"',
      1,
      await page.getByRole('button', { name: /Load changes from a file/ }).count(),
    )
    await page.keyboard.press('Escape')
    await load()
    await page.locator('[data-osmchange-review]').waitFor({ timeout: 15000 })
    await settle()
    report(
      'the dock opens on "Changes from file"',
      'true',
      await page.getByRole('tab', { name: 'Changes from file' }).getAttribute('aria-selected'),
    )
    const log = (await (await fetch(`http://localhost:${PORTS.mockApi}/requests`)).json()) as {
      path: string
    }[]
    const asked = log.map((entry) => entry.path)
    report(
      'the base versions were asked from the mock (history), the current ones too',
      [true, true, true],
      [
        asked.some((path) => path.endsWith('/node/364123000/21.json')),
        asked.some((path) => path.endsWith('/node/420517141/14.json')),
        asked.some((path) => path.endsWith('/way/4394952/full.json')),
      ],
    )
    report(
      'no base version asked for an element at the server version',
      false,
      asked.some((path) => path.includes('/node/585143211/10')),
    )

    // --- written on loading: everything that needs no decision, one undo step ---
    report(
      'written on loading, one undo step named after the file',
      'Changes from outdated.osc',
      await undoLabel(),
    )
    report(
      'on loading: 4 new, 4 changed, 1 deleted (the decisions not yet)',
      { created: 4, modified: 4, deleted: 1 },
      await changes(),
    )
    report(
      'the changeset names where the changes came from, and the form starts with a comment',
      {
        tags: { 'osmchange:created_by': 'Go Map!! (test)' },
        comment: 'Changes from Go Map!! (test), merged with the current map in Maid',
      },
      await changeset(),
    )
    const toiletsAfter = await entity('n364123000')
    report(
      'both changes merged on the toilets, on the server version',
      ['no', 'no', 22],
      [toiletsAfter?.tags.fee, toiletsAfter?.tags.changing_table, toiletsAfter?.version],
    )
    report("the library at the file's position", 52.3879338, (await entity('n444731308'))?.lat)
    report(
      'deleted: the exchange; kept, as its decision starts on "keep": the bank; not yet: the doctor',
      [null, 'Deutsche Bank', 'no'],
      [
        await entity('n307178734'),
        (await entity('n421299912'))?.tags.name ?? null,
        (await entity('n420517141'))?.tags.wheelchair,
      ],
    )

    // the map flies to the two elements to decide (the doctor and the bank, 200 m apart), not to the whole file
    await page.waitForFunction(() => !window.__maid.map.isMoving(), undefined, { timeout: 5000 })
    report(
      'after loading, the map shows the elements to decide',
      [true, true],
      await page.evaluate(() => {
        const bounds = window.__maid.map.getBounds()
        return [
          [13.4036823, 52.3864845],
          [13.4016296, 52.3865106],
        ].map(([lon, lat]) => bounds.contains([lon!, lat!]))
      }),
    )

    // --- the review ---
    report(
      'groups: to decide (open), merged, new, unchanged (folded); no "Apply" button',
      [['decide', 'auto', 'new', 'clean', 'skip'], 'true', 'false', 'false', 0],
      [
        await page
          .locator('[data-osmchange-group]')
          .evaluateAll((sections) =>
            sections.map((section) => section.getAttribute('data-osmchange-group')),
          ),
        await expanded('decide'),
        await expanded('auto'),
        await expanded('new'),
        await panel.getByRole('button', { name: 'Apply' }).count(),
      ],
    )
    const statusOf = (key: string) => row(key).getAttribute('data-status')
    report(
      'statuses: doctor and bank to decide, toilets and library merged, shop clean, new parking clean',
      ['decide', 'decide', 'auto', 'auto', 'clean', 'clean'],
      await Promise.all(
        ['n420517141', 'n421299912', 'n364123000', 'n444731308', 'n585143211', 'n-1'].map(statusOf),
      ),
    )
    await openGroup('auto')
    await openGroup('clean')
    await openGroup('skip')
    report(
      'a new element that is on the server already is not created again',
      ['skip', true],
      [
        await row('n-5').getAttribute('data-status'),
        ((await row('n-5').textContent()) ?? '').includes('Already on the server as n420517414'),
      ],
    )
    await row('n364123000').locator('summary').click()
    const toilets = (await row('n364123000').textContent()) ?? ''
    report(
      "merged row: what the file changed, the versions, the server's change kept",
      [true, true, true],
      [
        toilets.includes('tags: fee'),
        toilets.includes('file v21, server v22'),
        toilets.includes("Kept the server's change of changing_table"),
      ],
    )
    await row('n444731308').locator('summary').click()
    const library = (await row('n444731308').textContent()) ?? ''
    report(
      'merged row: a move alone says "only moved"; both moved it 1.1 m apart',
      [true, true],
      [
        library.includes('only moved, 3.3 m'),
        library.includes("Both moved it, 1.1 m apart: took the file's position"),
      ],
    )
    report(
      'no versions on a row whose file version is the server version',
      false,
      ((await row('n585143211').textContent()) ?? '').includes('server v'),
    )
    report(
      'the show button is the map icon, with the name in its label',
      1,
      await row('n585143211')
        .getByRole('button', { name: 'Show Fahrradladen Lichtenrade on the map' })
        .count(),
    )
    report(
      'a delete of an element changed since starts on "Keep it"',
      'true',
      await row('n421299912').getByRole('radio', { name: 'Keep it' }).getAttribute('aria-checked'),
    )

    // --- a decision is written as its own step; a changed decision replaces it ---
    const doctor = row('n420517141')
    report(
      'the tag conflict offers both values',
      [1, 1],
      [
        await doctor.getByRole('radio', { name: 'File: limited' }).count(),
        await doctor.getByRole('radio', { name: 'Server: no' }).count(),
      ],
    )
    await doctor.getByRole('radio', { name: 'File: limited' }).click()
    await settle()
    report('a decision is its own undo step', 'Decision on n420517141', await undoLabel())
    const decided = await entity('n420517141')
    report(
      'the chosen value, on the server version',
      ['limited', 15],
      [decided?.tags.wheelchair, decided?.version],
    )
    await doctor.getByRole('radio', { name: 'Server: no' }).click()
    await settle()
    report(
      'a changed decision replaces the first',
      ['no', { created: 4, modified: 4, deleted: 1 }],
      [(await entity('n420517141'))?.tags.wheelchair, await changes()],
    )

    // --- the colours on the map, off and on ---
    const sourceCount = () =>
      page.evaluate(() => (window.__maid.map.getSource('osmchange') ? 1 : 0))
    report('the changes are on the map', 1, await sourceCount())
    await panel.getByRole('button', { name: 'Highlight differences' }).click()
    await settle()
    report('"Highlight differences" switches them off', 0, await sourceCount())
    await panel.getByRole('button', { name: 'Highlight differences' }).click()
    await settle()

    // --- undo takes it all back: the two decisions, then the load ---
    for (let i = 0; i < 3; i++) await page.evaluate(() => window.__maid.engine.undo())
    await settle()
    report('undo: no change left', { created: 0, modified: 0, deleted: 0 }, await changes())
    report(
      'undo: the changeset no longer names the file',
      { tags: {}, comment: null },
      await changeset(),
    )
    report(
      'undo: the server state is back',
      ['no', 'Deutsche Telekom'],
      [(await entity('n420517141'))?.tags.wheelchair, (await entity('n307178734'))?.tags.operator],
    )

    // --- an element changed here and not saved: the file is refused ---
    await page.evaluate(() =>
      window.__maid.engine.setTags('n585143211', { shop: 'bicycle' }, 'check'),
    )
    await settle()
    await load()
    await panel.getByRole('alert').waitFor({ timeout: 15000 })
    report(
      'refused while an element of the file has unsaved changes here',
      true,
      ((await panel.getByRole('alert').textContent()) ?? '').startsWith(
        'You changed n585143211 here',
      ),
    )
    await page.evaluate(() => window.__maid.engine.undo())
  }),
)
