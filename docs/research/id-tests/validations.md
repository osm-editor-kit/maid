# iD tests: validations

Compared at iD commit `0194f3926`. Run: `bun test packages/validation/src/rules` → 86 pass, 0 fail, 9 todo (the three rules' tests; `validation.test.ts` is the Maid test file for the covered rows, and it is not part of this run).

Status: checkpoint. The three existing rules are done. The eight simple rules and the three todo-only files are not written yet, see "Not finished".

| iD spec file | iD tests | covered | adopted | todo | n/a | Maid test file |
| --- | --- | --- | --- | --- | --- | --- |
| `validations/almost_junction.js` | 10 | 0 | 2 | 8 | 0 | `packages/validation/src/rules/almost-junction.id.test.ts` (rule partly built, see F-validations-21) |
| `validations/crossing_ways.js` | 82 | 0 | 73 | 9 | 0 | `packages/validation/src/rules/crossing-ways.id.test.ts` |
| `validations/disconnected_way.js` | 10 | 2 | 8 | 0 | 0 | `packages/validation/src/rules/disconnected-way.id.test.ts`; covered in `packages/validation/src/validation.test.ts` |
| `validations/impossible_oneway.js` | 9 | 0 | 9 | 0 | 0 | `packages/validation/src/rules/impossible-oneway.id.test.ts` |
| `validations/incompatible_source.js` | 7 | 0 | 7 | 0 | 0 | `packages/validation/src/rules/incompatible-source.id.test.ts` |
| `validations/invalid_format.js` | 19 | 0 | 19 | 0 | 0 | `packages/validation/src/rules/invalid-format.id.test.ts` |
| `validations/mismatched_geometry.js` | 14 | 0 | 0 | 14 | 0 | `packages/validation/src/rules/mismatched-geometry.id.test.ts` (all todo, F-validations-23) |
| `validations/missing_role.js` | 7 | 0 | 7 | 0 | 0 | `packages/validation/src/rules/missing-role.id.test.ts` |
| `validations/missing_tag.js` | 9 | 4 | 5 | 0 | 0 | `packages/validation/src/rules/missing-tag.id.test.ts`; covered in `packages/validation/src/validation.test.ts` |
| `validations/mutually_exclusive_tags.js` | 5 | 0 | 5 | 0 | 0 | `packages/validation/src/rules/mutually-exclusive-tags.id.test.ts` |
| `validations/osm_api_limits.js` | 4 | 0 | 1 | 3 | 0 | `packages/validation/src/rules/osm-api-limits.id.test.ts` |
| `validations/outdated_tags.js` | 13 | 0 | 0 | 13 | 0 | `packages/validation/src/rules/outdated-tags.id.test.ts` (all todo, F-validations-24, 25) |
| `validations/private_data.js` | 6 | 0 | 6 | 0 | 0 | `packages/validation/src/rules/private-data.id.test.ts` |
| `validations/suspicious_name.js` | 14 | 0 | 0 | 14 | 0 | `packages/validation/src/rules/suspicious-name.id.test.ts` (all todo, F-validations-26) |
| **sum of the 3 finished rows** | 101 | 6 | 86 | 9 | 0 | |

Rows marked "not started" have zeros until they are done, so the full sum (209 iD tests) is not reached yet. The sum above covers the three finished rows only: 82 + 10 + 9 = 101 iD tests, of which 6 covered, 86 adopted, 9 todo.

## Missing features

| Id | Feature | iD tests that need it | State | Where it belongs |
| --- | --- | --- | --- | --- |
| F-validations-1 | `crossing_ways` checks multipolygon relations: the outer ways of a relation are features, and a way in a relation is checked as the relation (Rapid and iD `getFeatureWithFeatureTypeTagsForWay`) | `crossing_ways.js`: 8 (3 ignores, 5 flags) | todo | `packages/validation/src/rules/crossing-ways.ts` |
| F-validations-2 | `crossing_ways` fixes beyond "Connect the features": add bridge, add tunnel, change layer, and the dynamic fix list with `_connectionTags` | `crossing_ways.js`: 1 (flags sidewalk crossing service road) | todo | `packages/validation/src/rules/crossing-ways.ts`, `Fix` in `types.ts` |
| F-validations-3 | `missing_role` fixes: set the member's role to outer or inner, and remove the member from the multipolygon. These change the relation's members, not a tag, so the rule builds the detection only | none (iD's spec counts the issues and does not run the fixes) | todo | `packages/validation/src/rules/missing-role.ts`, membership actions in `packages/model` |
| F-validations-4 | `osm_api_limits` fix: split a way with too many nodes, at an intersection vertex if there is one near the middle, else at regular intervals (and at the start of a closed way). A split is an operation, not a tag change | `osm_api_limits.js`: 3 (the fix part of "flags way with more than the maximum", "can fix an extreme case", "fix a simple case at an intersection vertex") | todo | `packages/validation/src/rules/osm-api-limits.ts`, a split in `packages/operations` |
| F-validations-20 | `impossible_oneway` fix "Continue drawing from start" and "Continue drawing from end" (iD opens the draw mode on the way at its dangling end). `Fix` has only actions, and a draw mode is not a model action | none: no iD test checks the fix | todo | `packages/validation/src/types.ts` (`Fix`), `packages/validation/src/rules/impossible-oneway.ts` |
| F-validations-21 | `almost_junction` searches the ways that a road's end extension meets only among the ways whose box overlaps the road's own box (`RuleContext.waysNear`). The extension reaches up to 5 m past the end, so a crossing outside that box is missed. Needs a `RuleContext` query for the ways whose box overlaps a given box (e.g. `waysIn(box)`), answered by `runContext` in `validator.ts` | `almost_junction.js`: 8 (2 flags, 4 ignores, 2 joins between ways); the ignore tests pass trivially until the search exists | todo | `packages/validation/src/types.ts` (`RuleContext`), `packages/validation/src/validator.ts` (`runContext`), `packages/validation/src/rules/almost-junction.ts` |
| F-validations-23 | Rules can ask the presets: `mismatched_geometry` matches a tag set against the presets for one geometry (iD's `presetManager.matchTags(tags, 'line' | 'area' | 'point' | 'vertex')`) and reads whether a preset allows a geometry. `RuleContext` has no presets, and `packages/validation` depends only on `maid-model`. The fixes need preset-driven actions too | `mismatched_geometry.js`: 14 | todo | `packages/validation/src/types.ts` (`RuleContext`), a new dependency or a preset lookup passed in by the caller, `packages/validation/src/rules/mismatched-geometry.ts` |
| F-validations-24 | `outdated_tags` plain deprecated tags: the deprecated list of `@openstreetmap/id-tagging-schema` (`dist/deprecated.json`, present in `packages/presets/node_modules`) given to a rule factory as an option, with iD's `getDeprecatedTags` (replacement, transfer and multiple-transfer tags). No new dependency in `packages/validation` | `outdated_tags.js`: 10 (the four deprecated-tag tests, the two ignore tests, the context-tags test, the two no-error tests) | todo | `packages/validation/src/rules/outdated-tags.ts` (new), data passed in by the caller |
| F-validations-25 | `outdated_tags` NSI brand suggestions and preset upgrades (`preset.replacement`, the incomplete-tag issue): needs the name-suggestion-index and the preset matching by tags, neither available in `packages/validation` | `outdated_tags.js`: 3 (the NSI and incomplete-tag tests) | todo | `packages/validation/src/rules/outdated-tags.ts`; data from `packages/presets` and an NSI package, passed in |
| F-validations-26 | `suspicious_name`: generic-name patterns of the name-suggestion-index (`isGenericName`, excludeNamed, excludeGeneric, global exclude), and preset names and aliases in the user's language (the defining tag keys and values are in the schema) | `suspicious_name.js`: 14 | todo | `packages/validation/src/rules/suspicious-name.ts` (new); NSI and translated preset names passed in |
| F-validations-22 | "Ignore this issue": iD adds this fix to every warning (`validationIssue.fixes`, `validator.ignoreIssue`). Maid's validator keeps no ignore list and the rules give only their own fixes | `almost_junction.js`: 2 (the fix count of the two flags tests includes it) | todo | `packages/validation/src/validator.ts`, `packages/validation/src/types.ts` |

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
- **mutually_exclusive_tags, messages and fixes**: iD has a subtype per message (`default`, `same_value`); Maid has one sentence per case, without the feature's name. The rule is built with iD's list of pairs and both fixes of iD's "remove named tag" (one undo step each).
- **incompatible_source, no fix**: iD's only fix is "remove proprietary data" with no action behind it. Maid offers no fix, so the person changes the data by hand.
- **private_data, fix**: built as iD's "remove tag(s)": one fix removes the personal tags of the feature, in one undo step. The fix label names the tags (`Remove phone, email`), not iD's wording.
- **missing_role, both sides**: as in iD, a way asks its parent multipolygons and a multipolygon asks its members, and the two findings of one missing role are one issue (same id, from the member's index). Fixes are F-validations-3.
- **osm_api_limits, the limit**: iD reads the maximum from the server's capabilities. Maid never calls the API, so the rule uses the documented 2000 by default and `createOsmApiLimits(n)` takes another limit. The iD tests use 10, through the factory. The fix is F-validations-4.
- **invalid_format, messages and severity**: the message names the tag key ("has an invalid URL in website"), where iD names the field's label ("in Website"): Maid has no presets here. iD's "suggestion" severity for a Wikimedia Commons file name in `image` is a warning in Maid, which has no suggestion severity. iD's protocol fixes check the value with a placeholder; Maid checks the value itself, which offers the same two protocols.
- **invalid_format, Wikimedia Commons**: built as well as the website and email parts (the brief named those two), because the moves are plain tag changes and the rule stayed small. The image value that is a file or category moves to `wikimedia_commons`, and a Wikimedia Commons URL in `wikimedia_commons` is shortened to the file name.
- **impossible_oneway, one-way test**: iD's `isOneWay()` reads its tag dictionaries; Maid's `OsmWay.isOneWay()` reads the schema's rulesets, which a headless validation does not load. The rule copies iD's dictionaries, so the rule needs no schema.
- **impossible_oneway, loaded tiles**: iD skips a node whose OSM tile is not loaded. Maid's graph holds only what it has loaded, so the check is left out.
- **impossible_oneway, fixes**: the "Reverse this feature" fix is built (a model action, `actionReverse`). The two "Continue drawing" fixes are F-validations-20.
- **almost_junction, the search**: iD looks for ways in a query box around the end, which reaches 5 m past it. Maid's `RuleContext.waysNear(way)` only returns ways whose box overlaps the road's own box, so the rule finds a crossing beyond the end only when it lies inside that box. The tests that need a crossing beyond the end are todo (F-validations-21). This is a gap in the rule, not a difference of behaviour: where the rule reports, it reports what iD reports.
- **almost_junction, the loop**: the self-connection (a way that ends close to itself) searches the road's own segments, so it is complete, and "joins close endpoints of the same way" is adopted.
- **almost_junction, angles**: iD measures angles on its Mercator projection. Maid uses the same Mercator formula without the screen scale, which gives the same angles.
- **almost_junction, geometry in `geo.ts`**: added `metersToLat`, `metersToLon`, `sphericalDistance`, `interpolate`, `segmentIntersection` (iD's `geoLineIntersection`, end points included) and `selfIntersects` (iD's `geoHasSelfIntersections`). The existing functions are unchanged.
- **almost_junction, tag-as-disconnected**: iD checks `hasInterestingTags()`, which needs the schema; Maid checks the keys with `isInterestingKey` from `tags.ts`, which works without it.

## Not applicable, by reason

None so far.

## Not finished

The six rows of the second validations run (`almost_junction`, `impossible_oneway`, `invalid_format`, `mismatched_geometry`, `outdated_tags`, `suspicious_name`) are written; their features are F-validations-20 to 26. Finished in the run that wrote the rules for `incompatible_source.js`, `missing_role.js`, `mutually_exclusive_tags.js`, `osm_api_limits.js` and `private_data.js` (rows above; `osm_api_limits` has 3 todos for the split fix). Their rules are not in `defaultRules` yet, and `packages/validation/src/index.ts` is not changed for them.
