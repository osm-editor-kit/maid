# iD tests: operations, modes, behavior

Compared at iD commit `0194f3926`. Run: `bun test packages/operations apps/maid/src/url` → 81 pass, 0 fail, 11 todo.

Browser checks named below are in `tools/bench/` and were only read, not run or edited.

| iD spec file | iD tests | covered | adopted | todo | n/a | Maid test file |
| --- | --- | --- | --- | --- | --- | --- |
| `operations/circularize.js` | 11 | 0 | 9 | 2 | 0 | `packages/operations/src/id-circularize.test.ts` |
| `operations/delete.js` | 4 | 0 | 0 | 4 | 0 | `packages/operations/src/id-delete.test.ts` (todo only) |
| `operations/extract.js` | 14 | 0 | 14 | 0 | 0 | `packages/operations/src/id-extract.test.ts` |
| `operations/straighten.js` | 15 | 0 | 15 | 0 | 0 | `packages/operations/src/id-straighten.test.ts` |
| `modes/add_note.js` | 0 | 0 | 0 | 0 | 0 | none (the file has no `it`) |
| `modes/add_point.js` | 2 | 0 | 0 | 2 | 0 | none: browser check needed, F-mode-2 |
| `modes/select.js` | 8 | 0 | 0 | 8 | 0 | none: browser check needed, F-mode-1 |
| `behavior/hash.js` | 9 | 0 | 4 | 5 | 0 | `apps/maid/src/url/id-hash.test.ts` |
| `behavior/hover.js` | 8 | 0 | 0 | 5 | 3 | none: browser, F-beh-1 and F-beh-2 |
| `behavior/lasso.js` | 1 | 0 | 0 | 1 | 0 | none: F-beh-3 |
| `behavior/select.js` | 8 | 4 | 0 | 4 | 0 | none: covered by `interactions-check` |
| **sum** | **80** | **4** | **42** | **31** | **3** | |

The sum is 80, the iD count for these 11 files in `inventory.md` (operations 44, modes 10, behavior 26).

Covered, by check and label (`tools/bench/interactions-check.ts`):

- click on an entity selects it: `a click on a corner selects the node`, `Shift-click adds a second feature` (the first click selects)
- click on empty space clears: `a click on open ground deselects`
- shift-click on an unselected feature adds it: `Shift-click adds a second feature`
- shift-click on a selected feature takes it out: `Shift-click on a selected feature takes it out`

## Adopted tests: how the API differs

- `available()` is `applies(context)`; `disabled()` returns a sentence or `undefined`. iD's `false` ("not disabled") is `toBeUndefined()`. iD's reason code is compared with the same sentence Maid gives (singular or plural, as in `operations.ts`).
- Operations take `{ graph, selected }`. The graph is `new Graph(context, entities)`, as in `operations.test.ts`.
- Straighten: iD's nodes have no position; Maid needs one, so each node gets a distinct one. Applicability is topological, so the positions do not change any result.
- Hash: iD's `hadLocation` is the fact that the `map` parameter was read. The map moving and the URL being written are browser behaviour, not adopted.

## Missing features

| Id | Feature | iD tests that need it | State | Where it belongs |
| --- | --- | --- | --- | --- |
| F-ops-1 | Make round joins unclosed ways into a loop first, as iD does with `osmJoinWays` and a temporary way. Maid marks an open ring "not a loop". The model already has `osmJoinWays` (`packages/model/src/lib/multipolygon.ts`). Not built: it needs a temporary way with a new id, and that is more than a small fix. | `circularize.js`: 2 | todo | `packages/operations/src/operations.ts` (`circularizeOperation`) |
| F-ops-2 | Delete operation with iD's rules and next-node selection. Maid has no delete operation. The engine (`packages/renderer/src/engine.ts`, `deleteEntities`, line 845) checks that the ids exist and are not read-only (`isReadOnly`), deletes as one undo step, and drops deleted ids from the selection. It selects no neighbour, so a deleted vertex leaves nothing selected. iD's disabled reasons are not ported: `part_of_relation`, `incomplete_relation`, `has_wikidata_tag`, `connected_to_hidden`; `not_downloaded` and `too_large` are about loading tiles and are not decided for Maid. | `delete.js`: 4 | todo | `packages/operations` (new operation) and the engine's delete |
| F-mode-1 | Ctrl+↓ selects the child nodes of a selected way, and the shared child node of two selected ways. Maid's ArrowDown pans the map (`apps/maid/src/components/useShortcuts.ts:98`). | `modes/select.js`: 8 | todo | `apps/maid/src/components/useShortcuts.ts`, engine selection |
| F-mode-2 | Missing check: in add-point mode, a click adds a point, and a click on an existing point selects it instead. The engine can add a point (`addPoint`), and `edit-check` calls it directly, not by a click. Whether a click on a point selects it is not verified. | `modes/add_point.js`: 2 | todo (check missing) | `tools/bench` (a new check) |
| F-beh-1 | Holding Alt suppresses hover, so the feature under the pointer can be picked. Maid has no Alt handling. | `hover.js`: 4 (Alt keydown ×2, Alt keyup ×2) | todo | `packages/renderer` (`setHover`), `apps/maid` shortcuts |
| F-beh-2 | Hover highlights every member of a relation. `engine.setHover` highlights one id. | `hover.js`: 1 | todo | `packages/renderer/src/engine.ts` |
| F-beh-3 | Lasso selection. Maid has none. | `lasso.js`: 1 | todo | `packages/renderer` and `apps/maid` |
| F-beh-4 | Missing check: a change of `map=` in the address bar moves the map. | `hash.js`: 1 | todo (check missing) | `tools/bench` (a new check) |
| F-beh-5 | Missing check: the URL follows the map on move, throttled to 300 ms (`useCameraParam`). The serialiser is adopted; the browser write is not checked. | `hash.js`: 1 (throttled event) | todo (check missing) | `tools/bench` (a new check) |
| F-beh-6 | Missing check: an empty `id=` or an unknown id leaves nothing selected. The engine drops unknown ids (`engine.ts` lines 629 and 650). No check runs this. | `select.js`: 2 | todo (check missing) | `tools/bench` (a new check) |
| F-beh-7 | Missing check: shift-click on the last selected feature clears the selection, and shift-click on empty ground keeps it. `interactions-check` does not test either. | `select.js`: 2 | todo (check missing) | `tools/bench/interactions-check.ts` |
| F-beh-8 | Restore the last map position on the next visit, as iD does with `map-location` in local storage. The code searched (`apps/maid/src`, `packages/ui`, `packages/core`) stores only auth and settings in localStorage. No decision in the docs. | `hash.js`: 3 | open decision: ask Tobias | `apps/maid` |

## Differences found

- **Circularize, disabled shape.** iD returns a reason code or `false`; Maid returns a sentence or `undefined`. Same information, not a bug.
- **Circularize with a closed way and open ways.** iD joins the open ways into a loop and rounds that too. Maid rounds only the closed way, and skips open ways in `run`. The two iD tests with this selection pass in Maid because the closed way is enabled, so Maid's `run` result differs but the tests cannot show it. This is F-ops-1.
- **Extract.** iD disables extract only for the visible map. Maid never disables it; the four iD `disabled` tests are adopted with the same falsy expectation. Maid offers extract for every tagged area; iD only where the preset allows points (the comment in `operations.ts` says so).
- **Hash, number format.** At zoom 2 iD writes `38.9/-77.0`; Maid writes `38.90/-77.00`. The same numbers, so the test compares the parsed values.
- **Hash, changeset comment.** Maid carries `comment=` in the URL and never uses it as a changeset comment, because Maid never uploads.
- **Hash, several ids.** `id-url.ts` says Maid selects the first id of `id=w1,n2` for now; iD selects all of them. No iD test in this area checks it, but the select tests depend on it.
- **Delete.** iD selects a neighbour after a vertex is deleted; Maid selects nothing. F-ops-2.
- **Arrow keys.** iD's Ctrl+↓ selects child nodes; Maid's arrow keys pan. F-mode-1.

## Not applicable, by reason

- Hover is drawn with class names on SVG elements. "Removes the `.hover` class", "adds the `.hover` class to all elements bound to the same datum" → `behavior/hover.js`: 3. Maid draws highlights with MapLibre layers and keeps one hover id in the engine, so there are no classes to check. The Alt behaviour is not n/a; it is F-beh-1.
- `modes/add_note.js` has no `it`; 0 tests.

## Not finished

Nothing in the area. No source file was changed: no fix in `packages/operations/src` was small enough to adopt a test that now fails, so nothing was fixed.

Other checks run: `bun run type-check` exits 1, all 10 errors in `packages/filters/src/id-features.test.ts` (another agent's file). The five files I wrote have none. oxfmt `--check` and oxlint `--deny-warnings` are clean on the five files.
