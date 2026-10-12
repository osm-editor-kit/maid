# iD tests: actions-a

Compared at iD commit `0194f3926`. Run: `bun test packages/model/test/id/actions/circularize.test.ts packages/model/test/id/actions/delete_node.test.ts packages/model/test/id/actions/discard_tags.test.ts packages/model/test/id/actions/change_preset.test.ts packages/model/test/id/actions/connect.test.ts packages/model/test/id/actions/disconnect.test.ts packages/model/test/id/actions/extract.test.ts` → 44 pass, 0 fail, 17 todo. (`delete_way` and `delete_relation` have no Maid file of their own: all their tests are covered by Rapid's files.)

| iD spec file | iD tests | covered | adopted | todo | n/a | Maid test file |
| --- | --- | --- | --- | --- | --- | --- |
| `actions/add_entity.js` | 1 | 1 | 0 | 0 | 0 | `packages/model/test/actions/add_entity.test.js` |
| `actions/add_member.js` | 8 | 8 | 0 | 0 | 0 | `packages/model/test/actions/add_member.test.js` |
| `actions/add_midpoint.js` | 4 | 4 | 0 | 0 | 0 | `packages/model/test/actions/add_midpoint.test.js` |
| `actions/change_member.js` | 1 | 1 | 0 | 0 | 0 | `packages/model/test/actions/change_member.test.js` |
| `actions/change_preset.js` | 13 | 0 | 13 | 0 | 0 | `packages/presets/src/id-change-preset.test.ts` (all 13 adopted there; the model's file has todos only) |
| `actions/change_tags.js` | 1 | 1 | 0 | 0 | 0 | `packages/model/test/actions/change_tags.test.js` |
| `actions/circularize.js` | 16 | 13 | 1 | 2 | 0 | `packages/model/test/actions/circularize.test.js`, `packages/model/test/id/actions/circularize.test.ts` |
| `actions/connect.js` | 23 | 20 | 3 | 0 | 0 | `packages/model/test/actions/connect.test.js`, `packages/model/test/id/actions/connect.test.ts` (the 3 survivor tests, with numeric ids) |
| `actions/copy_entities.js` | 5 | 5 | 0 | 0 | 0 | `packages/model/test/actions/copy_entities.test.js` |
| `actions/delete_member.js` | 2 | 2 | 0 | 0 | 0 | `packages/model/test/actions/delete_member.test.js` |
| `actions/delete_multiple.js` | 2 | 2 | 0 | 0 | 0 | `packages/model/test/actions/delete_multiple.test.js` |
| `actions/delete_node.js` | 7 | 6 | 1 | 0 | 0 | `packages/model/test/actions/delete_node.test.js`, `packages/model/test/id/actions/delete_node.test.ts` |
| `actions/delete_relation.js` | 10 | 10 | 0 | 0 | 0 | `packages/model/test/actions/delete_relation.test.js` |
| `actions/delete_way.js` | 8 | 8 | 0 | 0 | 0 | `packages/model/test/actions/delete_way.test.js` |
| `actions/discard_tags.js` | 6 | 4 | 1 | 1 | 0 | `packages/model/test/actions/discard_tags.test.js`, `packages/model/test/id/actions/discard_tags.test.ts` |
| `actions/disconnect.js` | 17 | 14 | 3 | 0 | 0 | `packages/model/test/actions/disconnect.test.js`, `packages/model/test/id/actions/disconnect.test.ts` |
| `actions/extract.js` | 36 | 0 | 35 | 1 | 0 | `packages/model/test/id/actions/extract.test.ts` (Rapid's extract tests check other things: the new node's location, not the five properties iD checks) |
| **sum** | 160 | 99 | 57 | 4 | 0 | |

Counts: iD `it(` calls in each file, commented-out `it`s not counted. `it.each` counts as one (change_preset). The `it.each` blocks in change_preset hold several rows; they are counted once, as in `inventory.md`.

## Missing features

| Id | Feature | iD tests that need it | State | Where it belongs |
| --- | --- | --- | --- | --- |
| F-actions-a-1 | discardTags by key and value: iD's `{key: {value: true}}` form drops a tag only for listed values. Maid drops the key for any truthy entry | `discard_tags.js`: 1 todo (the value-mismatch test) | todo | `packages/model/src/actions/discard_tags.ts` |
| F-actions-a-2 | circularize: vertex count by size (iD's MIN_VERTICES for small features, MAX_VERTICES for large). Maid uses a max angle per segment only | `circularize.js`: 1 | blocked, not changed: Rapid's `creates nodes if necessary` asserts 21 nodes for a 2-degree square (iD's rule gives 33 with the closing node). Measured before: 16 new nodes at 10, 20 and 100 m. With iD's maximum angle alone: 8, 20 and 28 new (iD by hand, not run: 8, 18, 28 new, so 20 m differs: Maid's 20 new against iD's 18, because iD divides each key-node segment, not each arc) | `packages/model/src/actions/circularize.ts` |
| F-actions-a-3 | circularize at t = 0 inserts the new vertices with the way still in place (iD). Rapid leaves the way unchanged at t = 0 | `circularize.js`: 1 | todo | `packages/model/src/actions/circularize.ts` |
| F-actions-a-4 | change_preset needs presets (`packages/presets`, not in the model) | `change_preset.js`: 13 | built: adopted in `packages/presets/src/id-change-preset.test.ts` (13 of 13, 2026-10-13) | `packages/presets` plus a model action |
| F-actions-a-5 | connect picks the survivor by OSM id, as iD does: the oldest existing node (lowest positive id), or the oldest node with interesting tags. Maid picks the first node with a `version` (Rapid 3) and falls back to the last node | `connect.js`: 3 (`chooses the oldest node as the survivor`, `chooses the oldest interesting node as the survivor`, `chooses an existing node as the survivor`) | built now, with numeric ids in the adopted tests (3 of 3 pass). Rapid's `chooses the first non-new node as the survivor` (`test/actions/connect.test.js`) uses the test ids `a`, `b`, `c` without a version, which cannot be ordered, so it keeps Rapid's version rule and passes unchanged; see Differences | `packages/model/src/actions/connect.ts` |
| F-actions-a-6 | extract with the relations option off: iD keeps a node's relation membership on the original (tagged) node and moves it only when asked. Maid always moves the membership to the new vertex (iD's option on) and has no option | `extract.js`: 1 (`does not extract relations by default`) | todo | `packages/model/src/actions/extract.ts` |

## Differences found

- **discard_tags, object form.** iD expects `attribution: {'https://example.com': true}` to discard only that value. Maid's `checkTags` treats any truthy entry as "discard the key", so with iD's shape it also drops `attribution=other`. Test 6 is parked as F-actions-a-1. Test 5 passes only because the object is truthy; the value check is missing. Which side is right: iD. Maid's behaviour is a bug for iD-shaped data.
- **circularize at t = 0.** iD inserts the vertices at t = 0 (21 nodes, area still -4). Rapid's test says "nothing done yet" and expects the original five nodes. These two expectations contradict each other. Maid keeps Rapid's, which is deliberate in Rapid 3. Tobias to decide; parked as F-actions-a-3.
- **circularize, numbers.** iD's t = 0.5 and t = 1 tests check exact areas (-4.74, -6.24) in iD's projection. Rapid's tests check the same circularity and node count and that the area lies between the t = 0 and t = 1 areas. Covered; the exact numbers are not ported.
- **extract, relation membership.** iD's `actionExtract(id, projection, extractRelations)` moves the relation membership only when the third argument is true. Maid's `actionExtract` always moves it to the new node, which is iD's behaviour with the argument on. The three membership tests that iD runs with the argument on pass on Maid, as adopted. The default (keep the membership on the tagged node) is parked as F-actions-a-6. Which side is right: iD's default keeps the membership with the feature that has the tags, so Maid's default is the less useful one; Tobias to decide.
- **extract, scope.** All 36 iD tests use a node as the target, so they are not covered by Rapid's `extract.test.js` (its tests check the new node's location and the tag rules). They are adopted in full in `packages/model/test/id/actions/extract.test.ts`.
- **connect, survivor choice.** iD picks the survivor by id: the oldest existing node, or the oldest node with interesting tags. Built now (F-actions-a-5): the oldest existing entity survives, decided by the orchestrator, and the three adopted tests use numeric ids, because "older" needs real ids (iD's data here already has them). Rapid's version rule is kept only for ids that cannot be ordered, so Rapid's `chooses the first non-new node as the survivor` (test ids `a`, `b`, `c` without a version) passes unchanged. The `merges tags` test (iD) is covered by Rapid's `merges tags to the surviving node`, which has the same survivor (the last node).
- **circularize, clockwise tests.** iD checks the sign of the area; Rapid checks the node order. Both say the way keeps its winding. Covered.

## Not applicable, by reason

None.

## Not finished

None. Every file of the area is decided. The per-tag cases in Rapid's `extract.test.js` (indoor, building, source, ...) have no counterpart in iD's `extract.js` spec, so they are not counted here.

Note on the shared folder: `packages/model/test/id/actions/` also holds `move.test.ts` and `reflect.test.ts` from the other half of the actions area. `move.test.ts` has a failing test ("prevents intersections") at the time of writing. That is not one of mine and I did not touch it.
