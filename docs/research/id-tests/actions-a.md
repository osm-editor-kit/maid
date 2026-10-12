# iD tests: actions-a

Compared at iD commit `0194f3926`. Run: `bun test packages/model/test/id/actions/circularize.test.ts packages/model/test/id/actions/delete_node.test.ts packages/model/test/id/actions/discard_tags.test.ts packages/model/test/id/actions/change_preset.test.ts` → 3 pass, 0 fail, 16 todo. Not yet run for the other files of this area (not written).

| iD spec file | iD tests | covered | adopted | todo | n/a | Maid test file |
| --- | --- | --- | --- | --- | --- | --- |
| `actions/add_entity.js` | 1 | 1 | 0 | 0 | 0 | `packages/model/test/actions/add_entity.test.js` |
| `actions/add_member.js` | 8 | 8 | 0 | 0 | 0 | `packages/model/test/actions/add_member.test.js` |
| `actions/add_midpoint.js` | 4 | 4 | 0 | 0 | 0 | `packages/model/test/actions/add_midpoint.test.js` |
| `actions/change_member.js` | 1 | 1 | 0 | 0 | 0 | `packages/model/test/actions/change_member.test.js` |
| `actions/change_preset.js` | 13 | 0 | 0 | 13 | 0 | `packages/model/test/id/actions/change_preset.test.ts` (todos only) |
| `actions/change_tags.js` | 1 | 1 | 0 | 0 | 0 | `packages/model/test/actions/change_tags.test.js` |
| `actions/circularize.js` | 16 | 13 | 1 | 2 | 0 | `packages/model/test/actions/circularize.test.js`, `packages/model/test/id/actions/circularize.test.ts` |
| `actions/connect.js` | 23 | pending | pending | pending | pending | pending |
| `actions/copy_entities.js` | 5 | 5 | 0 | 0 | 0 | `packages/model/test/actions/copy_entities.test.js` |
| `actions/delete_member.js` | 2 | 2 | 0 | 0 | 0 | `packages/model/test/actions/delete_member.test.js` |
| `actions/delete_multiple.js` | 2 | 2 | 0 | 0 | 0 | `packages/model/test/actions/delete_multiple.test.js` |
| `actions/delete_node.js` | 7 | 6 | 1 | 0 | 0 | `packages/model/test/actions/delete_node.test.js`, `packages/model/test/id/actions/delete_node.test.ts` |
| `actions/delete_relation.js` | 10 | pending | pending | pending | pending | pending |
| `actions/delete_way.js` | 8 | pending | pending | pending | pending | pending |
| `actions/discard_tags.js` | 6 | 4 | 1 | 1 | 0 | `packages/model/test/actions/discard_tags.test.js`, `packages/model/test/id/actions/discard_tags.test.ts` |
| `actions/disconnect.js` | 17 | pending | pending | pending | pending | pending |
| `actions/extract.js` | 36 | pending | pending | pending | pending | pending |
| **sum** | 160 | | | | | |

Counts: iD `it(` calls in each file, commented-out `it`s not counted. `it.each` counts as one (change_preset). The `it.each` blocks in change_preset hold several rows; they are counted once, as in `inventory.md`.

## Missing features

| Id | Feature | iD tests that need it | State | Where it belongs |
| --- | --- | --- | --- | --- |
| F-actions-a-1 | discardTags by key and value: iD's `{key: {value: true}}` form drops a tag only for listed values. Maid drops the key for any truthy entry | `discard_tags.js`: 1 todo (the value-mismatch test) | todo | `packages/model/src/actions/discard_tags.ts` |
| F-actions-a-2 | circularize: vertex count by size (iD's MIN_VERTICES for small features, MAX_VERTICES for large). Maid uses a max angle per segment only | `circularize.js`: 1 | todo | `packages/model/src/actions/circularize.ts` |
| F-actions-a-3 | circularize at t = 0 inserts the new vertices with the way still in place (iD). Rapid leaves the way unchanged at t = 0 | `circularize.js`: 1 | todo | `packages/model/src/actions/circularize.ts` |
| F-actions-a-4 | change_preset needs presets (`packages/presets`, not in the model) | `change_preset.js`: 13 | todo | `packages/presets` plus a model action |

## Differences found

- **discard_tags, object form.** iD expects `attribution: {'https://example.com': true}` to discard only that value. Maid's `checkTags` treats any truthy entry as "discard the key", so with iD's shape it also drops `attribution=other`. Test 6 is parked as F-actions-a-1. Test 5 passes only because the object is truthy; the value check is missing. Which side is right: iD. Maid's behaviour is a bug for iD-shaped data.
- **circularize at t = 0.** iD inserts the vertices at t = 0 (21 nodes, area still -4). Rapid's test says "nothing done yet" and expects the original five nodes. These two expectations contradict each other. Maid keeps Rapid's, which is deliberate in Rapid 3. Tobias to decide; parked as F-actions-a-3.
- **circularize, numbers.** iD's t = 0.5 and t = 1 tests check exact areas (-4.74, -6.24) in iD's projection. Rapid's tests check the same circularity and node count and that the area lies between the t = 0 and t = 1 areas. Covered; the exact numbers are not ported.
- **circularize, clockwise tests.** iD checks the sign of the area; Rapid checks the node order. Both say the way keeps its winding. Covered.

## Not applicable, by reason

None so far.

## Not finished

The run stopped at the context limit of the brief (about 100k), after `change_preset` and before the next file. Not yet decided or written:

- `actions/delete_way.js` (8 tests). Compare with `packages/model/test/actions/delete_way.test.js`.
- `actions/delete_relation.js` (10 tests). Compare with `packages/model/test/actions/delete_relation.test.js`.
- `actions/connect.js` (23 tests). Compare with `packages/model/test/actions/connect.test.js`. The `#disabled` restriction tests need the restriction code, check Rapid's `connect.test.js` lines 209 to 540 first.
- `actions/disconnect.js` (17 tests). Compare with `packages/model/test/actions/disconnect.test.js`.
- `actions/extract.js` (36 tests). Compare with `packages/model/test/actions/extract.test.js` (iD's per-tag cases are probably covered by Rapid's `extract` tests, check by name).

The table rows for these files are `pending`. The sum row is empty until they are done.

Note on the shared folder: `packages/model/test/id/actions/` also holds `move.test.ts` and `reflect.test.ts` from the other half of the actions area. `move.test.ts` has a failing test ("prevents intersections") at the time of writing. That is not one of mine and I did not touch it.
