# iD tests: osm

Compared at iD commit `0194f3926`. Run: `bun test packages/model/test/id/osm` → 12 pass, 0 fail, 36 todo.

| iD spec file | iD tests | covered | adopted | todo | n/a | Maid test file |
| --- | --- | --- | --- | --- | --- | --- |
| `osm/changeset.js` | 10 | 8 | 0 | 2 | 0 | `packages/model/test/data/OsmChangeset.test.js`; parked: `packages/model/test/id/osm/changeset.test.ts` |
| `osm/deprecated.ts` | 9 | 0 | 0 | 9 | 0 | parked: `packages/model/test/id/osm/deprecated.test.ts` |
| `osm/entity.js` | 41 | 30 | 5 | 4 | 2 | `packages/model/test/data/OsmEntity.test.js`, `OsmWay.test.js` (intersects); adopted and parked: `packages/model/test/id/osm/entity.test.ts` |
| `osm/intersection.js` | 51 | 49 | 2 | 0 | 0 | `packages/model/test/lib/intersection.test.js`; adopted: `packages/model/test/id/osm/intersection.test.ts` |
| `osm/multipolygon.js` | 13 | 13 | 0 | 0 | 0 | `packages/model/test/lib/multipolygon.test.js` |
| `osm/node.js` | 56 | 49 | 0 | 7 | 0 | `packages/model/test/data/OsmNode.test.js`; parked: `packages/model/test/id/osm/node.test.ts` |
| `osm/note.js` | 5 | 0 | 0 | 5 | 0 | parked: `packages/model/test/id/osm/note.test.ts` |
| `osm/relation.js` | 80 | 75 | 2 | 3 | 0 | `packages/model/test/data/OsmRelation.test.js`, `OsmEntity.test.js` (creationOrder); adopted and parked: `packages/model/test/id/osm/relation.test.ts` |
| `osm/tags.js` | 3 | 0 | 3 | 0 | 0 | `packages/model/test/id/osm/tags.test.ts` (overlaps `packages/model/test/data/OsmWay.test.js`, "handles lifecycle prefixes") |
| `osm/way.js` | 138 | 132 | 0 | 6 | 0 | `packages/model/test/data/OsmWay.test.js`; parked: `packages/model/test/id/osm/way.test.ts` |
| **sum** | **406** | **356** | **12** | **36** | **2** | |

Covered means the same `it` title (or the same behaviour under a renamed title, see the notes below) and the same assertions in the Maid file named in the row. Titles were compared first, then bodies for the ones with a changed title or input.

Notes on covered rows:
- `way.js` `#segments` is "returns segments for the given way" in Maid; `#asGeoJSON` tests return a Feature in Maid and a geometry in iD (the same coordinates).
- `way.js` `#isOneWay` (8 tests) is grouped differently in Maid (one test per tag list), with the same tags and expectations.
- `node.js` `#directions` titles match. Maid has one typo in a title ("interstction"), not a behaviour difference.
- `relation.js` `#asGeoJSON` "MultiPolygon geometry" is "MultiPolygon feature" in Maid.

## Missing features

| Id | Feature | iD tests that need it | State | Where it belongs |
| --- | --- | --- | --- | --- |
| F-osm-1 | Matching the id-tagging-schema `deprecated.json` rules to an entity's tags (`getDeprecatedTags`) and grouping them by key (`deprecatedTagValuesByKey`). Maid's `upgrade_tags` action applies a rule, but nothing finds the rules that match | `deprecated.ts`: 9 tests | todo | `packages/model`, next to `src/actions/upgrade_tags.ts`, or `packages/presets`, which loads the tagging-schema data |
| F-osm-2 | Changeset generator name. Maid writes `generator="Rapid"` (`src/data/OsmChangeset.ts`, two places); iD writes `iD`. A decision is needed for Maid's own name, which is a choice for Tobias | `changeset.js`: 2 tests | todo | `packages/model/src/data/OsmChangeset.ts` |
| F-osm-3 | OSM notes as model objects: `type`, point `extent`, `isNew` (negative id), `move`. Maid's notes are plain data (`Note` in `packages/module-notes/src/model.ts`) and are read-only | `note.js`: 5 tests | todo | `packages/module-notes`, or `packages/model` if notes join the model |
| F-osm-4 | Frozen entities in development builds (iD runs the freeze tests only when `iD.debug` is set). Listed in the model README under "Still to do" | `entity.js`: 3; `relation.js`: 1; `way.js`: 1 (5 tests) | todo | `packages/model/src/data/OsmEntity.ts` and its subclasses |
| F-osm-5 | `mergeTags(tags, override)`: a third argument whose tags win over the others | `entity.js`: 1 test ("accepts override tags") | todo | `packages/model/src/data/OsmEntity.ts`, `mergeTags` |
| F-osm-6 | `side=*` and `railway:turnout_side` in `OsmNode.directions` (sides left, right and both; invalid values such as `side=forward` ignored) | `node.js`: 7 tests (the loop of invalid pairs is one `it` in the source and runs six tests) | todo | `packages/model/src/data/OsmNode.ts`, `directions` |
| F-osm-7 | `hasFromViaTo` with the `intersection` role in destination-sign relations (counts as the via, and is not used on other relation types) | `relation.js`: 2 tests | todo | `packages/model/src/data/OsmRelation.ts`, `hasFromViaTo` |
| F-osm-8 | `sidednessIdentifier`: the tag that gives a way its sidedness, or `null`. `isSided` answers yes or no but does not return the tag | `way.js`: 2 tests | todo | `packages/model/src/data/OsmWay.ts`, next to `isSided` |
| F-osm-9 | `area()` of a way: the relative planar area of a closed way (0 for degenerate ways, unclosed ways treated as closed). Maid has no area measure | `way.js`: 3 tests | todo | `packages/model/src/data/OsmWay.ts` or `src/geo/geom.ts` |

## Differences found

- **Generator name** (`changeset.js`, F-osm-2). iD's upload says `generator="iD"`; the model says `generator="Rapid"` in both `asJXON` of the changeset and `osmChangeJXON`. Maid's own tests (`OsmChangeset.test.js`) assert `'Rapid'`. Neither is a value Maid should keep: the generator should name the editor. Parked, not edited.
- **Winding order wording** (`relation.js`). iD's title says "clockwise" for outer rings and "counterclockwise" for inner rings. Maid's test titles say the reverse. The output is the same: for the same input both produce the same ring order. The difference is the convention behind the word (planar axes in iD, spherical in Maid's `geoArea` check). Both tests are adopted with iD's wording and inputs and pass.
- **`v` (entity change stamp)** (`entity.js`). iD's `update` sets `v` to 1 when unset and adds 1 to it. Maid keeps Rapid's `touch()`: `v` is a session-wide, always-growing stamp, so `update({})` gives 5 or 6 after other edits. Only "grows when the entity changes" is a Maid property. Not adopted: see n/a.
- **`toOSM` does not check the type letter** (`entity.js`). iD's `osmIdManager.toOSM` returns `''` for a string without an `n`, `w` or `r` prefix. Maid's `OsmEntity.toOSM` drops the first character whatever it is, so `toOSM('x5')` gives `'5'`. The adopted test ("returns the empty string for other strings") passes only because its input is one character. Entity IDs come from `fromOSM` and the OSM data, so malformed ones are unlikely; the risk is low. A fix belongs in `src/data/OsmEntity.ts` (not edited here).
- **Notes** (`note.js`). Not a behaviour difference: Maid has no note model object, see F-osm-3.
- **Runtime count.** The inventory counts the `it(` call in `node.js` once. Its loop over invalid `direction`/`side` pairs runs six tests, so the iD folder runs more tests than the inventory's 406 (node.js runs 61). The table keeps the inventory's count. The loop is parked as one `it.todo` with the six pairs in its comment.
- **iD's own todo** in `note.js` ("returns an updated note") is not counted, as the inventory does not count it.

## Not applicable, by reason

- Maid's `v` is a session-wide change stamp (Rapid's design: `touch()` takes a new value from a global counter). iD's per-entity count is not a Maid behaviour, and the stamp only has to change when an entity changes → `entity.js`: 2 tests ("sets v to 1 if previously undefined", "increments v").

## Not finished

Nothing. All ten `osm` spec files are counted in the table, and every row adds up to its iD count.
