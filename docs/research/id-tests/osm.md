# iD tests: osm

Compared at iD commit `0194f3926`. Run: `bun test packages/model/test/id/osm` → (in progress).

| iD spec file | iD tests | covered | adopted | todo | n/a | Maid test file |
| --- | --- | --- | --- | --- | --- | --- |
| `osm/tags.js` | 3 | 0 | 3 | 0 | 0 | `packages/model/test/id/osm/tags.test.ts` (overlaps `packages/model/test/data/OsmWay.test.js`: "handles lifecycle prefixes") |
| `osm/changeset.js` | 10 | 8 | 0 | 2 | 0 | `packages/model/test/data/OsmChangeset.test.js`; parked: `packages/model/test/id/osm/changeset.test.ts` |
| `osm/deprecated.ts` | 9 | 0 | 0 | 9 | 0 | `packages/model/test/id/osm/deprecated.test.ts` |
| `osm/note.js` | 5 | 0 | 0 | 5 | 0 | `packages/model/test/id/osm/note.test.ts` |
| `osm/multipolygon.js` | 13 | 13 | 0 | 0 | 0 | `packages/model/test/lib/multipolygon.test.js` |
| **sum** | | | | | | (in progress) |

## Missing features

| Id | Feature | iD tests that need it | State | Where it belongs |
| --- | --- | --- | --- | --- |
| F-osm-1 | Matching the id-tagging-schema `deprecated.json` rules to an entity's tags (`getDeprecatedTags`), and grouping them by key (`deprecatedTagValuesByKey`). Maid's `upgrade_tags` action applies a rule, but nothing finds the rules that match | `deprecated.ts`: 9 tests | todo | `packages/model`, next to `actions/upgrade_tags.ts`, or `packages/presets`, which loads the tagging-schema data |
| F-osm-2 | Changeset generator name: the upload's `generator` is `Rapid` in Maid (`src/data/OsmChangeset.ts`), iD writes `iD`. A decision is needed for Maid's own name | `changeset.js`: 2 tests | todo | `packages/model/src/data/OsmChangeset.ts` |
| F-osm-3 | OSM notes as model objects: `type`, point `extent`, `isNew` (negative id), `move`. Maid's notes are plain data (`Note` in `packages/module-notes/src/model.ts`) and notes are read-only | `note.js`: 5 tests | todo | `packages/module-notes`, or `packages/model` if notes join the model |

## Differences found

- **Generator name** (`changeset.js`). iD's upload says `generator="iD"`; the model says `generator="Rapid"` in both the changeset and the change JXON. Maid's own tests (`OsmChangeset.test.js`) assert `'Rapid'`. Neither is the right value for Maid. Parked as F-osm-2 and not edited here.
- **iD's own todo** in `note.js` (`returns an updated note`) is not counted, as the inventory does not count it.

## Not applicable, by reason

(none so far)

## Not finished

- `osm/entity.js`, `osm/node.js`, `osm/intersection.js`, `osm/relation.js`, `osm/way.js`.
