# iD tests: actions, second half

Compared at iD commit `0194f3926`. Run: `bun test packages/model/test/id/actions/{move,reflect,merge,merge_nodes,merge_polygon,upgrade_tags}.test.ts` → 7 pass, 0 fail, 9 todo. The other six files of this half are not written yet (see "Not finished").

| iD spec file | iD tests | covered | adopted | todo | n/a | Maid test file |
| --- | --- | --- | --- | --- | --- | --- |
| `actions/noop.js` | 1 | 1 | 0 | 0 | 0 | `packages/model/test/actions/noop.test.js` |
| `actions/unrestrict_turn.js` | 1 | 1 | 0 | 0 | 0 | `packages/model/test/actions/unrestrict_turn.test.js` |
| `actions/restrict_turn.js` | 2 | 2 | 0 | 0 | 0 | `packages/model/test/actions/restrict_turn.test.js` |
| `actions/move.js` | 5 | 4 | 1 | 0 | 0 | `packages/model/test/id/actions/move.test.ts` (covered: `packages/model/test/actions/move.test.js`) |
| `actions/move_node.js` | 5 | 5 | 0 | 0 | 0 | `packages/model/test/actions/move_node.test.js` |
| `actions/straighten_nodes.js` | 5 | 5 | 0 | 0 | 0 | `packages/model/test/actions/straighten_nodes.test.js` |
| `actions/reflect.js` | 10 | 7 | 3 | 0 | 0 | `packages/model/test/id/actions/reflect.test.ts` (covered: `packages/model/test/actions/reflect.test.js`) |
| `actions/merge.js` | 7 | 2 | 1 | 4 | 0 | `packages/model/test/id/actions/merge.test.ts` (covered: `packages/model/test/actions/merge.test.js`) |
| `actions/merge_nodes.js` | 11 | 7 | 1 | 3 | 0 | `packages/model/test/id/actions/merge_nodes.test.ts` (covered: `packages/model/test/actions/merge_nodes.test.js`) |
| `actions/merge_polygon.js` | 12 | 10 | 0 | 2 | 0 | `packages/model/test/id/actions/merge_polygon.test.ts` (covered: `packages/model/test/actions/merge_polygon.test.js`) |
| `actions/straighten_way.js` | 12 | 12 | 0 | 0 | 0 | `packages/model/test/actions/straighten_way.test.js` |
| `actions/upgrade_tags.js` | 13 | 12 | 1 | 0 | 0 | `packages/model/test/id/actions/upgrade_tags.test.ts` (covered: `packages/model/test/actions/upgrade_tags.test.js`) |
| `actions/revert.js` | 13 | 13 | 0 | 0 | 0 | `packages/model/test/actions/revert.test.js` |
| `actions/join.js` | 42 | 34 | 6 | 2 | 0 | `packages/model/test/id/actions/join.test.ts` (covered: `packages/model/test/actions/join.test.js`; the 6 adopted are the 3 "keeps the oldest id" tests and 3 "non-numeric summable tag" tests, which pass because the two values differ, not because of the summing rule; the 4 iD `it(` in the `restriction`/`connectivity` loops run 8 cases, all covered by Rapid's loops) |
| `actions/merge_remote_changes.js` | 27 | 20 | 7 | 0 | 0 | `packages/model/test/id/actions/merge_remote_changes.test.ts` (covered: `packages/model/test/actions/merge_remote_changes.test.js`; the 7 adopted tests are the ones whose Rapid ports dropped the `conflicts()` check) |
| `actions/reverse.js` | 64 | 50 | 5 | 9 | 0 | `packages/model/test/id/actions/reverse.test.ts` (covered: `packages/model/test/actions/reverse.test.js`; the 50 covered titles pair one-to-one, sampled "transforms *=up ⟺ *=down" and "ignores directions other than forward or backward on attached stop sign" match) |
| **sum (14 of 18 files, 124 of 349 tests)** | 124 | 108 | 7 | 9 | 0 | |

## Missing features

| Id | Feature | iD tests that need it | State | Where it belongs |
| --- | --- | --- | --- | --- |
| F-actions-b-1 | merge keeps an existing point's id the iD way: first a new child node, then an uninteresting child (taking its tags), then a newer interesting child; otherwise the point is dropped | `merge.js`: 4 tests | todo | `packages/model/src/actions/merge.ts` |
| F-actions-b-2 | connect picks the oldest existing, interesting node as survivor (`utilOldestID`), not the first existing or the last node | `merge_nodes.js`: 3 tests | todo | `packages/model/src/actions/connect.ts` (also used by merge_nodes) |
| F-actions-b-3 | merge_polygon keeps the oldest multipolygon relation as the survivor, not the first in the list | `merge_polygon.js`: 1 test | todo | `packages/model/src/actions/merge_polygon.ts` |
| F-actions-b-4 | merge_polygon keeps line-only tags (iD's `osmWayOnlyTags`, e.g. `natural=coastline`) on the outer ways; Maid moves every tag of the way to the relation | `merge_polygon.js`: 1 test | todo | `packages/model/src/actions/merge_polygon.ts`, with the way-only tag list from the tagging schema |
| F-actions-b-10 | join adds up summable tags (`step_count`, `parking:*:capacity`, iD's `osmSummableTags`) when both values are numbers; Maid treats any two different values as a conflict | `join.js`: 1 test | todo | `packages/model/src/actions/join.ts` (both the summing and `disabled`), with the summable tag list next to `isInterestingTag` in `packages/model/src/data/OsmEntity.ts` |
| F-actions-b-11 | join hands the parent relations of a collapsed single-member multipolygon to the resulting area before deleting it (iD#9064). Maid deletes the multipolygon, and the parent relation with it: a `type=site` relation that held the pier is removed | `join.js`: 1 test | todo | `packages/model/src/actions/join.ts`, `checkForSimpleMultipolygon`: replace the membership first, then delete |
| F-actions-b-20 | reverse adds a direction tag to a directionless node from its preset: the preset's direction key (`direction`, or a custom one such as `prefixed:direction`) gets `forward`; Maid's reverse has no preset lookup | `reverse.js`: 4 tests | todo | `packages/model/src/actions/reverse.ts`, preset match from `packages/presets` passed in as an option |
| F-actions-b-21 | reverse keeps the value of `side` on `highway=cyclist_waiting_aid` and of `railway:turnout_side` (Maid turns `right` into `left`) | `reverse.js`: 2 tests | todo | `packages/model/src/actions/reverse.ts`, key and value rules as iD's `keyValuesToKeepUnchanged` |
| F-actions-b-22 | reverse keeps the keys `red_turn:right` / `red_turn:left` and their `:bicycle` variants (Maid renames them) | `reverse.js`: 1 test | todo | `packages/model/src/actions/reverse.ts` |
| F-actions-b-23 | reverse splits a direction value on `;` and reverses each part (`N;90` becomes `S;270`), keeping the non-directional part (`0;error` becomes `180;error`) | `reverse.js`: 2 tests | todo | `packages/model/src/actions/reverse.ts` |

## Differences found

- `merge.js` and `merge_nodes.js`: the model's merge and connect follow Rapid 3's simpler id rules. Rapid's own tests do not cover iD's rules, so the gap was not visible. Which side is right: iD. Keeping the existing id keeps the OSM history of the point. The failing iD tests are `it.todo` (F-actions-b-1, F-actions-b-2), not hidden.
- `merge_polygon.js`: Rapid's test "creates a multipolygon from two multipolygon relations" keeps the first relation in the list; iD keeps the oldest id (F-actions-b-3). Rapid's two copies of "preserves original point if possible" are one scenario twice and do not count as covering `merge.js`.
- `merge_remote_changes.js`: Rapid's ports of 7 tests drop iD's `action.conflicts()` length check: "doesn't merge tags if conflict" (4 tests), "doesn't merge ways if nodelist changes overlap", "doesn't merge ways if childNode location is different", "doesn't merge relations if members have changed". The behaviour exists in Maid (`conflicts()` is in `src/actions/merge_remote_changes.ts`), so these are weaker tests, not missing features. The stronger versions are adopted with iD's titles and the `conflicts()` check in `packages/model/test/id/actions/merge_remote_changes.test.ts` (7 pass). The other 20 iD titles pair one-to-one with Rapid's tests in order; sampled "returns conflict details" matches.
- `join.js` "transfers memberships of collapsed single-member multipolygon onto resulting basic area" (iD#9064): Maid's join deletes the multipolygon, and its `type=site` parent with it, so a pier that was a member of a site relation takes the site relation out of the data. Which side is right: iD, and this is data loss in the model, not only a missing test. Kept as todo F-actions-b-11; the model should be fixed before join is used on such a case.
- `join.js` "returns conflicting_tags when the first / second / both ways have a non-numeric summable tag": adopted and passing, but only because the two values differ, which Maid already reports as a conflict. The summing rule itself (`step_count` 12 + 30 = 42) is the todo F-actions-b-10.
- `upgrade_tags.js` "upgrades a tag with no replacement tags": iD passes `undefined` as the new tags, Rapid passes `{}`. Adopted with iD's input; it passes.
- `reflect.js` "reflect long at t = 0.5" and the other long-axis transition tests: Rapid's checks use a tolerance of 1e-3 where iD uses 1e-6, because Rapid's inputs are lon/lat. Counted as covered (same behaviour), not re-adopted with the tighter tolerance.
- `straighten_nodes.js` "straightens points": Rapid's "straighten at t = 1" checks the same straightening with other coordinates. Counted as covered.

- `reverse.js` "side" tags: Maid turns `side=right` into `side=left` on a `highway=cyclist_waiting_aid`, and `railway:turnout_side=right` into `left`. iD keeps both (its `keyValuesToKeepUnchanged`, iD#10128). iD expects the value kept. Which is right: iD, as far as I can judge (the side is about the aid or turnout itself, not the way's direction); not checked against the wiki. The 2 tests are `it.todo` (F-actions-b-21).
- `reverse.js` "red_turn" keys: Maid renames `red_turn:right` to `red_turn:left` (and `red_turn:right:bicycle` to `red_turn:left:bicycle`) on nodes. iD keeps the keys (iD#10736) and iD's test expects them kept. Which is right: iD, as far as I can judge (the turn belongs to the traffic the signal faces, which reversing the way does not change); not checked against the wiki. The test is `it.todo` (F-actions-b-22).
- `reverse.js` semicolon values: this one loses data. Maid turns `direction=0;error` into `direction=180`, dropping `;error`; for `direction=N;90` it leaves the value unchanged. iD gives `180;error` and `S;270`. Which is right: iD. This is a bug in `reverse.ts`, not only a missing feature; the 2 tests are `it.todo` (F-actions-b-23).
- `reverse.js` directionless nodes: Maid never adds a direction tag, so the four preset tests cannot pass as written. They are `it.todo` (F-actions-b-20), including "does not add ... if the preset has no direction field", which Maid passes only trivially without a preset.
- `reverse.js` adopted: the five turn-lane tests (`turn:lanes`, `turn:lanes:forward|backward`, `turn:lanes:both_ways`) pass as written: the key is reversed, the value is kept.

## Adopted tests: how the coordinates are mapped

iD's planar test coordinates are placed at the same offset from the world centre (`Rapid.sdk.projWorldToWgs84`), so the expected values in the iD test stay as written. Rapid's geometry works in world space, so the tests check the same numbers. Each file has its own helper; nothing is shared with other agents' files.

## Not applicable, by reason

None so far.

## Not finished

- `actions/join.js` (42), `actions/orthogonalize.js` (40), `actions/split.js` (79). Not started. A title comparison (script in the scratchpad, not in the repo) shows the first pass: join has 12 iD titles with no Rapid counterpart; orthogonalize 1 (`preserves a way's duplicate vertices`); split about 32 (relations, roundabouts, restrictions, the `out-and-back` and `forking` route cases, coastline tags). The four "split out-and-back" tests have fewer assertions in Rapid. None of these has a row yet.
- `merge_remote_changes.js`: adopting the 7 `conflicts()` checks listed in Differences, under the same titles (needs the iD setup block, lines 1-69).
