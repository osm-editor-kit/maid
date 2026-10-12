# iD tests: validations

Compared at iD commit `0194f3926`. Run: `bun test packages/validation/src/rules` → 86 pass, 0 fail, 9 todo (the three rules' tests; `validation.test.ts` is the Maid test file for the covered rows, and it is not part of this run).

Status: checkpoint. The three existing rules are done. The eight simple rules and the three todo-only files are not written yet, see "Not finished".

| iD spec file | iD tests | covered | adopted | todo | n/a | Maid test file |
| --- | --- | --- | --- | --- | --- | --- |
| `validations/almost_junction.js` | 10 | 0 | 0 | 0 | 0 | not started |
| `validations/crossing_ways.js` | 82 | 0 | 73 | 9 | 0 | `packages/validation/src/rules/crossing-ways.id.test.ts` |
| `validations/disconnected_way.js` | 10 | 2 | 8 | 0 | 0 | `packages/validation/src/rules/disconnected-way.id.test.ts`; covered in `packages/validation/src/validation.test.ts` |
| `validations/impossible_oneway.js` | 9 | 0 | 0 | 0 | 0 | not started |
| `validations/incompatible_source.js` | 7 | 0 | 7 | 0 | 0 | `packages/validation/src/rules/incompatible-source.id.test.ts` |
| `validations/invalid_format.js` | 19 | 0 | 19 | 0 | 0 | `packages/validation/src/rules/invalid-format.id.test.ts` |
| `validations/mismatched_geometry.js` | 14 | 0 | 0 | 0 | 0 | not started |
| `validations/missing_role.js` | 7 | 0 | 7 | 0 | 0 | `packages/validation/src/rules/missing-role.id.test.ts` |
| `validations/missing_tag.js` | 9 | 4 | 5 | 0 | 0 | `packages/validation/src/rules/missing-tag.id.test.ts`; covered in `packages/validation/src/validation.test.ts` |
| `validations/mutually_exclusive_tags.js` | 5 | 0 | 5 | 0 | 0 | `packages/validation/src/rules/mutually-exclusive-tags.id.test.ts` |
| `validations/osm_api_limits.js` | 4 | 0 | 0 | 0 | 0 | not started |
| `validations/outdated_tags.js` | 13 | 0 | 0 | 0 | 0 | not started |
| `validations/private_data.js` | 6 | 0 | 6 | 0 | 0 | `packages/validation/src/rules/private-data.id.test.ts` |
| `validations/suspicious_name.js` | 14 | 0 | 0 | 0 | 0 | not started |
| **sum of the 3 finished rows** | 101 | 6 | 86 | 9 | 0 | |

Rows marked "not started" have zeros until they are done, so the full sum (209 iD tests) is not reached yet. The sum above covers the three finished rows only: 82 + 10 + 9 = 101 iD tests, of which 6 covered, 86 adopted, 9 todo.

## Missing features

| Id | Feature | iD tests that need it | State | Where it belongs |
| --- | --- | --- | --- | --- |
| F-validations-1 | `crossing_ways` checks multipolygon relations: the outer ways of a relation are features, and a way in a relation is checked as the relation (Rapid and iD `getFeatureWithFeatureTypeTagsForWay`) | `crossing_ways.js`: 8 (3 ignores, 5 flags) | todo | `packages/validation/src/rules/crossing-ways.ts` |
| F-validations-2 | `crossing_ways` fixes beyond "Connect the features": add bridge, add tunnel, change layer, and the dynamic fix list with `_connectionTags` | `crossing_ways.js`: 1 (flags sidewalk crossing service road) | todo | `packages/validation/src/rules/crossing-ways.ts`, `Fix` in `types.ts` |

## Differences found

- **crossing_ways, pairs of features**: the rule checked only pairs with a highway ("buildings and waterways may cross each other"). iD flags building with building, railway with waterway, waterway with building and aeroway with building. The iD tests expect these, so the pairs check is gone. Two buildings that cross on the same level overlap, which is a real error.
- **crossing_ways, bridges and tunnels**: the rule accepted any bridge or tunnel as legitimate. iD first looks at a layer both ways share (same layer: a crossing), then at bridge and tunnel mismatches. Two bridges on the same layer are a crossing in iD and now in Maid too. Without this, `flags road bridge crossing road bridge on the same layer` and its siblings fail.
- **crossing_ways, connection tags**: the issue now carries `data.connectionTags` (iD's `tagsForConnectionNodeIfAllowed`, ported in `packages/validation/src/connection-tags.ts`) and `data.featureTypes`. The "Connect the features" fix still adds an untagged node; iD adds these tags. Left as it was, to keep the existing fix test unchanged.
- **crossing_ways, indoor and aeroway**: indoor features on different levels are legitimate; runways and taxiways are features (iD's `osmRoutableAerowayTags`).
- **crossing_ways, lifecycle values**: iD ignores four building values (demolished, dismantled, proposed, razed); Maid's `lifecyclePrefixes` ignores more (construction, planned, abandoned, ...). Not changed, and no iD test covers the difference.
- **crossing_ways, waterways**: iD lists `pressurised` as a flowing waterway; Maid does not. Not changed.
- **disconnected_way, multipolygons**: the rule treated the outer way of a routable multipolygon as routable and reported the way. iD reports the relation alone and treats the way as untagged. Now the same as iD: the multipolygon is the feature, its outer ways are walked for connections, and an unvalidated routable multipolygon counts as the network.
- **disconnected_way, golf and aerialways**: golf paths and cartpaths are not checked by themselves but connect other roads (iD #11863); aerialways are routable for connection and not checked by themselves (iD #9406).
- **Test helper, not the validator**: iD's `validate()` in its spec runs a rule on each changed entity and counts every issue, even when two entities give the same issue. Maid's validator merges issues with one id. The adopted tests call the rule per entity like iD (`packages/validation/src/id-test-helpers.ts`), so the iD counts stay as iD wrote them.
- **Test expectations, subtype to message**: iD asserts `issue.type` and `issue.subtype`. Maid's `Issue` has `rule` and `message` and no subtype. The adopted tests assert `rule`, and where iD asserts a subtype, the message that says the same thing.
- **Todo syntax**: bun's `it.todo` type wants a callback. The todos are `it.todo('title', () => {})`; bun does not run the body of a todo (checked).
- **Other agent's file**: `packages/validation/src/id-validator.test.ts` (core area, not mine) has the same `it.todo` type error at line 79 (`tsc --noEmit`). It is not touched here.

## Not applicable, by reason

None so far.

## Not finished

Not started: `almost_junction.js` (10), `impossible_oneway.js` (9), `incompatible_source.js` (7), `invalid_format.js` (19), `mismatched_geometry.js` (14), `missing_role.js` (7), `mutually_exclusive_tags.js` (5), `osm_api_limits.js` (4), `outdated_tags.js` (13), `private_data.js` (6), `suspicious_name.js` (14). Their rules are not in `defaultRules` yet, and `packages/validation/src/index.ts` is not changed for them.
