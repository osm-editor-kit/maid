# Adopting iD's unit tests: how each area is worked

Goal (Tobias, 2026-10-13): Maid has the same test coverage as iD. Every test in iD's `test/spec` is accounted for: covered already, adopted now, a todo with a named missing feature, or not applicable with a reason. The inventory is [inventory.md](inventory.md).

One agent works one area and owns one report file, `docs/research/id-tests/<area>.md`, and the test files and folders its brief names. Nothing else.

## For every `it(...)` of every iD spec file of your area, decide one of four

1. **covered**: Maid already has a test that checks the same behaviour. Name the Maid test file. For the data model (`packages/model`), Maid has Rapid 3's tests in `packages/model/test/**`, which descend from iD's: compare by the `it` titles and by what is asserted (`grep -n "it('" <file>` on both sides), not by title alone.
2. **adopted**: Maid has the behaviour but no test for it. Write the test now. Keep iD's test title, its input data and its expected values; change only the API calls to Maid's. Do not weaken an expectation to make it pass. If it fails because Maid behaves differently, find out which side is right for OSM data: a real difference is a missing feature (case 3) or a bug to report, never something to hide.
3. **todo**: Maid lacks the feature the test needs. Add `it.todo('<iD's title>')` in the place where the test will live, with a comment `// needs F-<area>-<n>` above it, and add the feature to "Missing features" in your report. If the feature is small and inside the folder you may edit (the brief says which source folders, if any), build it and adopt the test instead; say so in the report.
4. **n/a**: the test is about something Maid does not have by design (D3 and SVG DOM, iD's `context`, a network service Maid does not call, iD's localisation loader). Give the reason in a few words. "Hard to port" is not a reason; "Maid draws with MapLibre layers, there is no SVG `<path>` to inspect" is.

## Rules

- Tests are `bun:test` (`import { describe, expect, it } from 'bun:test'`); in `packages/model/test` the existing files use `chai`'s `assert`, which is fine there. One Maid test file per iD spec file, named after it, starting with one line: `// Adopted from iD test/spec/<path> (ISC, © iD contributors), at commit <short hash from inventory.md>.`
- Never edit or delete an existing test to make room, never add `.skip`, never loosen an assertion. `it.todo` is the only way to park a test, and each one names its feature.
- No network in tests, ever. A test that needs a server response uses data written into the test.
- `.reference/` is read-only. Read with `grep -n` and `sed -n` in ranges; do not read whole large files.
- No `package.json`, no `bun install`, no commits, no dev server, no `bun run check`, no `check-*` scripts. Run only the tests of your own folder: `bun test <folder>`. Lint what you wrote: `node_modules/.bin/oxlint --deny-warnings -c oxlint.config.mjs <files>` and `node_modules/.bin/oxfmt -c oxfmt.config.mjs <files>` (not for `packages/model`, which is excluded from both).
- Work file by file and write the report as you go, so that a stop at any point leaves a correct report. If you get near 100k tokens of context, stop after the file you are on.

## The report file, fixed shape

```markdown
# iD tests: <area>

Compared at iD commit `<hash>`. Run: `bun test <folder>` → <n> pass, <n> fail, <n> todo.

| iD spec file | iD tests | covered | adopted | todo | n/a | Maid test file |
| --- | --- | --- | --- | --- | --- | --- |
| `actions/add_member.js` | 8 | 8 | 0 | 0 | 0 | `packages/model/test/actions/add_member.test.js` |
| ... one row per iD file; the four numbers add up to the iD count |
| **sum** | | | | | | |

## Missing features

| Id | Feature | iD tests that need it | State | Where it belongs |
| --- | --- | --- | --- | --- |
| F-<area>-1 | one line, what Maid cannot do | `file.js`: 3 tests | todo / built now | package and file |

## Differences found

Behaviour that differs between iD and Maid where the test was not simply adopted: what iD expects, what Maid does, which you think is right, what you did.

## Not applicable, by reason

Reason → the spec files and counts it covers.

## Not finished

Files of the area you did not get to, if any.
```

## Added while the work ran

- `it.todo` takes a second argument here: write `it.todo('title', () => {})`. Bun's types reject the one-argument form and the type-check fails.
- Where iD builds tests in a loop (`it.each`, `forEach`), the inventory counts the `it(` once. Keep the inventory's number in the table and say in the report how many cases really run.
