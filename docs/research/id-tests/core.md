# iD tests: core and lib

Compared at iD commit `0194f3926`. Run: `bun test packages/model/test/id/core packages/validation packages/core packages/journal` → 166 pass, 0 fail, 31 todo. That total includes files this area does not own (other todos in `packages/validation/src/rules/crossing-ways.id.test.ts`, which I did not touch). This area's own files: `packages/model/test/id/core` → 3 pass, 20 todo; `packages/validation/src/id-validator.test.ts` → 4 pass, 1 todo; `packages/core/src/id-context.test.ts` → 1 todo.

| iD spec file | iD tests | covered | adopted | todo | n/a | Maid test file |
| --- | --- | --- | --- | --- | --- | --- |
| `core/context.js` | 8 | 0 | 0 | 1 | 7 | `packages/core/src/id-context.test.ts` (todo) |
| `core/difference.js` | 44 | 38 | 1 | 5 | 0 | `packages/model/test/data/Difference.test.js`; todos in `packages/model/test/id/core/difference.test.ts` |
| `core/file_fetcher.js` | 5 | 0 | 0 | 0 | 5 | none |
| `core/graph.js` | 62 | 52 | 0 | 1 | 9 | `packages/model/test/lib/Graph.test.js`; todo in `packages/model/test/id/core/graph.test.ts` |
| `core/history.js` | 55 | 31 | 1 | 1 | 22 | `packages/model/test/edit/EditHistory.test.js`; `packages/model/test/id/core/history.test.ts` |
| `core/localizer.ts` | 10 | 0 | 0 | 10 | 0 | none (todo, F-core-1 and F-core-2) |
| `core/tree.js` | 17 | 3 | 2 | 12 | 0 | `packages/model/test/spatial/SpatialIndex.test.js`; `packages/model/test/id/core/tree.test.ts` |
| `core/validator.js` | 6 | 0 | 5 | 0 | 1 | `packages/validation/src/id-validator.test.ts` |
| `lib/locale.js` | 3 | 0 | 0 | 3 | 0 | none (todo, F-core-1) |
| **sum** | **210** | **124** | **7** | **35** | **44** | |

Check: 124 + 7 + 35 + 44 = 210, the iD count in `inventory.md` (core 207 + lib 3). Every row adds up.

"Covered" was judged by test titles and by reading the bodies of a sample (graph constructor, replace, revert, perform, prepareTestHistory). The bodies of the undo, redo, reset, checkpoint, changes and hasChanges rows were not read, so those are unchecked.

## Missing features

| Id | Feature | iD tests that need it | State | Where it belongs |
| --- | --- | --- | --- | --- |
| F-core-1 | Localisation: `t()` lookup with fallback to English, the list of locales to use, localised text in the DOM | `lib/locale.js`: 3; `core/localizer.ts`: `localized-text` 1, `localesToUseFrom` 1 | todo | a localisation package, none yet |
| F-core-2 | Number formatting and parsing per locale (decimal and group separators, fraction digits, decimal place counter) | `core/localizer.ts`: `floatFormatter` 2, `floatParser` 5, `decimalPlaceCounter` 1 | todo | same as F-core-1 |
| F-core-3 | Graph-aware spatial index: answers for one graph version, follows parent ways and relations when a member node moves or is removed, picks up members that load later, and does not insert an entity that has a modified version | `core/tree.js`: 12 (rebase 2, intersects 10) | todo | `packages/model/src/spatial`, with `EditHistory._syncCacheFromDiff` |
| F-core-4 | `Difference.extantIDs()`: ids of entities that still exist, members of modified relations left out unless asked for | `core/difference.js`: `#extantIDs` 5 | todo | `packages/model/src/lib/Difference.ts` |
| F-core-5 | Transient cache on a graph: a value computed once per graph, dropped when the graph is rebased | `core/graph.js`: `invalidates transients` 1 | todo | `packages/model/src/lib/Graph.ts` |
| F-core-6 | Animated edits: actions that run in a transition | `core/history.js`: `performs transitionable actions in a transition` 1 | todo (cut from Rapid's EditHistory, see the model README) | `packages/model/src/edit/EditHistory.ts` |
| F-core-7 | Editor debug flags, get and set (for example tile and collision debugging) | `core/context.js`: `#debug` 1 | todo | `packages/core/src/editor.ts` |
| F-core-8 | Summary of a point that becomes a vertex of a way: reported as modified (iD), Maid reports it as deleted | `core/difference.js`: `reports a vertex as modified when it was previously a point` 1 | built now | `Difference.summary()` in `packages/model/src/lib/Difference.ts` |
| F-core-9 | Validation after a deletion: the ways that a deletion leaves disconnected are checked, not only the changed entities | `core/validator.js`: `add validation issue when highway becomes disconnected` 1 | built now | `apps/maid/src/modules/validation.tsx` passes only changed entities that have a head; the rule set itself is fine |

## Differences found

- **F-core-8, a bug.** iD's test expects the way and the point (now a vertex with a changed tag) to be reported as modified. Maid's summary checks the base geometry first: the point was a `point` in the base, so it is reported as `deleted`. The node still exists in OSM, so "deleted" is wrong. This is a bug in `Difference.summary()`; I did not change `src`.
- **F-core-9.** The app calls `validator.validate(staging, changed, ways)` where `changed` is the ids of the difference with a head. Deleting a way leaves its neighbour unchanged in the difference, so the neighbour is never checked. iD re-checks it and reports it. The validator follows what it is told, so the fix is in the app's call (or in what the validator is told), not in the rule.
- **Untagged vertices of a way.** iD reports the way as modified and not the vertex. Maid's summary does the same (tests "ignores uninteresting child node ..."), so these were covered, not a difference.
- **Graph frozen flag.** iD's `coreGraph` is frozen by default and `update()` copies it. Maid's Graph is Rapid's: a base graph refuses changes and a head graph changes in place. Both are covered as base refusing changes and head changing in place (see the n/a row).
- **Undo annotation.** iD's `perform(action, annotation)` puts the annotation on the undo stack. Maid's `perform` has no annotation; `commit({ annotation })` does. The iD test "pushes an undo annotation" is covered by the commit tests.
- **Promise.** iD's validator runs asynchronously and tests await it. Maid's `validate()` is synchronous.
- **Saved history.** iD keeps localStorage formats v1 to v3 and migrates them. Maid's journal has one schema (`packages/journal/README.md`). The behaviour (edits, redo stack, id counters survive a reload) is asserted by `packages/journal/src/journal.test.ts`.

## Not applicable, by reason

- **Copy-on-write Graph API** (`returns a new graph`, `doesn't modify the receiver`, `update()`): Maid's Graph is a base and head (Rapid's design): 9 tests in `core/graph.js`.
- **Undo stack operations replaced by staging and commit** (`#pop` 7, `#replace` "replaces the undo annotation" 1, `#redo` "does not redo into a non-annotated state" 1): the model README says `replace` and `pop` became staging and commit: 9 tests in `core/history.js`. Maid's commits always carry an annotation, so there is no non-annotated state to redo into.
- **iD's saved-history formats** (`#toJSON` 2, `#fromJSON` 9): iD's v1 to v3 JSON in localStorage; Maid's journal has one schema and no legacy reader. The behaviour is covered by `packages/journal`: 11 tests in `core/history.js`.
- **localStorage migration** (`#replaceLocalStorageWithIndexedDB` 2): Maid never stored history in localStorage, and iD's `asyncPrefs` is iD's preference store. 2 tests in `core/history.js`.
- **Asset paths** (`assetPath`, `assetMap`, `asset`, `imagePath`): Maid bundles icons and images with Vite and reads them by import, so there is no runtime path to set. 7 tests in `core/context.js`.
- **File fetcher** (`core/file_fetcher.js`, 5 tests): Maid has no generic file fetcher. Static data is bundled at build time and OSM data comes from the mock API per tile. Judgement, not a checked equivalence.
- **Validator promise** (`validate returns a promise`): Maid's `validate()` is synchronous. 1 test in `core/validator.js`.

## Not finished

- **Tree, parent-way tests** (`core/tree.js`, F-core-3, 10 todos under `intersects`). Maid does update parents when the stable and staging caches sync (`EditHistory._syncCacheFromDiff` with `Difference.complete()`), so these may be adoptable with an `EditHistory` set up in the test. Not written in this pass; they are todos, not adopted.
- **Tree, `does not insert if entity has a modified version`** (F-core-3). Unsure whether EditHistory's stable and staging caches already give this behaviour.
- **Covered rows not read in full**: the bodies of the undo, redo, reset, checkpoint, changes and hasChanges tests were judged by title only.
- **No journal test file.** `packages/journal/src/id-history.test.ts` was not created: its tests would be the n/a format tests, and the behaviour is covered by `journal.test.ts`.
- **Localizer and locale** have no test files, as the brief says: they are todos in the table only.
