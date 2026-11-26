# Lane Studio and Maid Lanes: a side-by-side

Written 2026-11-26 by the Maid project, for Maid's own planning and for Marcel Marzec, Lane Studio's developer. It
compares how the two editors handle road lanes in OpenStreetMap (OSM). It describes; it does not rate. Where we read
something in the code, the line says so with a link; where we only inferred it, it says "inferred".

- **Lane Studio**: <https://github.com/MarcelMarzec/LaneStudio>, read at commit
  [`2bcdd49`](https://github.com/MarcelMarzec/LaneStudio/tree/2bcdd49b7911896d69649dccd118049e166128b3) (2026-11-25,
  v26.11.25r2); the [announcement](https://community.openstreetmap.org/t/introducing-lane-studio-a-visual-lane-editor-for-openstreetmap-built-on-id/150572)
  and its replies up to 2026-11-25; the [website](https://lanestudio.marcelmarzec.com) and the
  [wiki page](https://wiki.openstreetmap.org/wiki/Lane_Studio). We did not edit in the live editor.
- **Maid Lanes**: <https://github.com/osm-editor-kit/maid>, `main` on 2026-11-26. Maid is a set of OSM editors that
  port iD's behaviour to React and MapLibre; Maid Lanes is the one of them about lanes.

Links to Lane Studio below point to that commit; links to Maid point to `main`.

## 1. In one paragraph each

**Lane Studio** is a fork of iD. It keeps iD's map, history, imagery, validator and upload, and adds a lane layer, a
lanes section in the sidebar, road fields, and tools for routing, speed limits and connectivity relations. It draws
every lane at its tagged width over the imagery, together with markings, junctions, crossings, parking, pavements,
railways, water and more, and you edit lanes where they are drawn. It is built around UK roads (widths, signs,
markings, mph) and is in early access. Its code, tests and docs were written with Claude Code, directed and reviewed
by its maintainer ([README][ls-readme]).

**Maid Lanes** is one app of Maid, an editor written anew in React with MapLibre (WebGL), not a fork of iD. Its lanes
work is three packages: a tag model, a cross-section layout, and the editor module. A selected road gets a "Lanes"
section with a cross-section diagram (the road and the roads before and after it), a table with a column per lane,
and its lanes as bands on the map. A map style colours roads by how complete their lane tags are. It has been built
around Berlin streets and the German cycle lane pattern, and is in development
([module README][maid-module-readme]).

[ls-readme]: https://github.com/MarcelMarzec/LaneStudio/blob/2bcdd49b7911896d69649dccd118049e166128b3/README.md
[maid-module-readme]: https://github.com/osm-editor-kit/maid/blob/main/packages/module-lanes/README.md

## 2. Architecture

| | Lane Studio | Maid Lanes |
| --- | --- | --- |
| Base | A fork of iD; the lane code is one folder, [`modules/lanes`][ls-lanes] (108 TypeScript files, about 25,700 lines) | Its own editor; lanes in [`packages/osm-lanes`][maid-osm-lanes] (tag model, about 1,400 lines), [`packages/osm-lane-diagram`][maid-diagram] (layout, about 8,300) and [`packages/module-lanes`][maid-module] (editor, about 2,500) |
| How it joins the editor | 16 small hooks in iD files, each a no-op in plain iD, listed in [`docs/develop/Code-Map.md`][ls-codemap]; nothing in iD imports from `modules/lanes` | A module in the app's config (`lanes()`, `laneRules`, `lanesLens` in [`apps/maid-lanes/src/maid.config.ts`][maid-config]); the editor offers extension points for inspector sections, map content, rules and map styles |
| Build and language | esbuild, a second entry for `dist/lanes.js`; TypeScript strict; ESLint; d3 for UI and state | Bun and Vite; TypeScript strict; React 19; oxlint; Zustand-style stores |
| State | Per-context singletons with d3-dispatch ([`core/lane_state.ts`][ls-state]); the tags are the only stored data | A small store for the chosen and hovered lane ([`hover-store.ts`][maid-hover]); the tags are the only stored data |
| Undo | iD's history: each lane edit is one `actionChangeTags` ([`actions/change_lanes.ts`][ls-change]) | Maid's history, ported from iD: each edit is one `actionChangeTags` ([`edit.ts`][maid-edit]) |

Both write only the keys an edit is about. Lane Studio parses the way into its model, changes it, and serialises only
the keys it marked as touched ([`model/serialise.ts`][ls-serialise]). Maid edits the pipe of one key directly and
leaves the model out of the write path, because the model's serialiser would write parsed defaults back
([`edit.ts`][maid-edit]).

[ls-lanes]: https://github.com/MarcelMarzec/LaneStudio/tree/2bcdd49b7911896d69649dccd118049e166128b3/modules/lanes
[ls-codemap]: https://github.com/MarcelMarzec/LaneStudio/blob/2bcdd49b7911896d69649dccd118049e166128b3/docs/develop/Code-Map.md
[ls-state]: https://github.com/MarcelMarzec/LaneStudio/blob/2bcdd49b7911896d69649dccd118049e166128b3/modules/lanes/core/lane_state.ts
[ls-change]: https://github.com/MarcelMarzec/LaneStudio/blob/2bcdd49b7911896d69649dccd118049e166128b3/modules/lanes/actions/change_lanes.ts
[ls-serialise]: https://github.com/MarcelMarzec/LaneStudio/blob/2bcdd49b7911896d69649dccd118049e166128b3/modules/lanes/model/serialise.ts
[maid-osm-lanes]: https://github.com/osm-editor-kit/maid/tree/main/packages/osm-lanes
[maid-diagram]: https://github.com/osm-editor-kit/maid/tree/main/packages/osm-lane-diagram
[maid-module]: https://github.com/osm-editor-kit/maid/tree/main/packages/module-lanes
[maid-config]: https://github.com/osm-editor-kit/maid/blob/main/apps/maid-lanes/src/maid.config.ts
[maid-hover]: https://github.com/osm-editor-kit/maid/blob/main/packages/module-lanes/src/hover-store.ts
[maid-edit]: https://github.com/osm-editor-kit/maid/blob/main/packages/module-lanes/src/edit.ts

## 3. The lane model and the tags

| | Lane Studio | Maid Lanes |
| --- | --- | --- |
| A lane | `{ values }`: one raw value per lane key; its index in its direction is its identity, 0 the driver's leftmost ([`model/types.ts`][ls-types]) | `LaneSlot`: index, direction and typed fields (turn, width, access per mode, change, surface, …) ([`types.ts`][maid-types]) |
| Lane keys | Any `<key>:lanes[:forward\|:backward\|:both_ways][:conditional]`, so new keys work without code; `:conditional` keys are read-only in the lane list and edited in their own field ([`model/keys.ts`][ls-keys], [`model/conditional_lanes.ts`][ls-cond]) | A fixed list of keys the model knows ([`tags.ts`][maid-tags]); the table edits turn, width, bus, bicycle, vehicle and change |
| Lane count when `lanes` is missing | From the directional counts, then from the longest pipe ("inferred"), then from wiki defaults per road type ("assumed") ([`model/parse.ts`][ls-parse]) | From the directional counts and the pipes ([`slots.ts`][maid-slots]) |
| Odd count on a two-way road | Split ceil/floor with a warning `ambiguous_direction_counts` | Split ceil/floor, no warning ([`slots.ts`][maid-slots]) |
| Driving side | From the location with `@rapideditor/country-coder` ([`core/drive_side.ts`][ls-drive]); it orders the cross-section | From a `driving_side` tag, else right ([`driving-side.ts`][maid-drive]); the cross-section is drawn in travel direction, upwards |
| `oneway=-1` | Lanes go to `backward`; nothing is reversed ([`model/parse.ts`][ls-parse]) | The tags are read in travel order with `reverseWayTags` ([`reverse.ts`][maid-reverse]) |
| Cycle lanes | `bicycle:lanes`, `cycleway:lanes` as lane kinds; `cycleway:*` sides as roadside strips | The same, plus the German pattern: a cycle lane in the pipes but not in `lanes` is valid and not flagged ([`lane-rules.ts`][maid-rules]) |
| Street parking | The whole `parking:<side>:*` scheme with an upgrade from `parking:lane:*` ([`model/parking.ts`][ls-parking]) | In another Maid module ([`module-parking`][maid-parking]); the lanes module reads parking only for width checks |
| Other road keys | Centre line and overtaking, shoulders, active traffic management, speed limits (mph), `destination:*:lanes`, tolls, `type=connectivity` relations | `placement`, `placement:forward\|backward` for where the way line sits; turn restrictions in another module |

[ls-types]: https://github.com/MarcelMarzec/LaneStudio/blob/2bcdd49b7911896d69649dccd118049e166128b3/modules/lanes/model/types.ts
[ls-keys]: https://github.com/MarcelMarzec/LaneStudio/blob/2bcdd49b7911896d69649dccd118049e166128b3/modules/lanes/model/keys.ts
[ls-cond]: https://github.com/MarcelMarzec/LaneStudio/blob/2bcdd49b7911896d69649dccd118049e166128b3/modules/lanes/model/conditional_lanes.ts
[ls-parse]: https://github.com/MarcelMarzec/LaneStudio/blob/2bcdd49b7911896d69649dccd118049e166128b3/modules/lanes/model/parse.ts
[ls-drive]: https://github.com/MarcelMarzec/LaneStudio/blob/2bcdd49b7911896d69649dccd118049e166128b3/modules/lanes/core/drive_side.ts
[ls-parking]: https://github.com/MarcelMarzec/LaneStudio/blob/2bcdd49b7911896d69649dccd118049e166128b3/modules/lanes/model/parking.ts
[maid-types]: https://github.com/osm-editor-kit/maid/blob/main/packages/osm-lanes/src/types.ts
[maid-tags]: https://github.com/osm-editor-kit/maid/blob/main/packages/osm-lanes/src/tags.ts
[maid-slots]: https://github.com/osm-editor-kit/maid/blob/main/packages/osm-lanes/src/slots.ts
[maid-drive]: https://github.com/osm-editor-kit/maid/blob/main/packages/osm-lanes/src/driving-side.ts
[maid-reverse]: https://github.com/osm-editor-kit/maid/blob/main/packages/osm-lanes/src/reverse.ts
[maid-rules]: https://github.com/osm-editor-kit/maid/blob/main/packages/module-lanes/src/rules/lane-rules.ts
[maid-parking]: https://github.com/osm-editor-kit/maid/tree/main/packages/module-parking

Both parsers are written by hand; neither uses an npm library for lane tags.

## 4. Drawing

| | Lane Studio | Maid Lanes |
| --- | --- | --- |
| On the map | SVG with d3, a layer inside iD's OSM layer ([`svg/lanes.ts`][ls-svg]); every road in view | MapLibre line layers ([`overlay/layers.ts`][maid-layers]); the selected road only |
| Geometry | Its own: a metric frame per view, boundaries offset from the way line with mitre joins, lanes as polygons between them ([`geometry/frame.ts`][ls-frame], [`geometry/road_geometry.ts`][ls-road]) | Each lane is the way's line moved with `line-offset` and as wide as the lane with `line-width`, both in metres turned into pixels by zoom and latitude; MapLibre does the joins |
| Junctions | Junction boxes, lanes that carry on line up, tapers for added and dropped lanes (25 m, smoothstep), guide lines from turn arrows or connectivity relations, roundabout flares | On the map, none. In the diagram, the roads before and after with tapers and forks ([`osm-lane-diagram`][maid-diagram]) |
| Zoom | Lanes from 17, markings and arrows from 18, labels from 19 ([`svg/lanes.ts`][ls-svg]) | Bands from 17, arrows from 18 |
| Default widths | Per road type from UK practice (motorway 3.65 m … living street 2.4 m), lanes share a tagged `width` ([`geometry/layout.ts`][ls-layout]) | Per lane kind from Berlin guidance (car and bus 3.0 m, cycle 1.5 m) ([`defaults.ts`][maid-defaults]) |
| Symbols | SVG `<symbol>`s with `<use>`: turn arrows, cycle symbols, BUS LANE text ([`svg/defs.ts`][ls-defs]) | One canvas-drawn icon per turn added to MapLibre ([`overlay/arrows.ts`][maid-arrows]); the diagram is an inline SVG in React |
| In the sidebar | A lane strip in way order with an inspector for the chosen lanes, a tool bar and a paint palette ([`ui/section_lanes.ts`][ls-section]) | A cross-section with the neighbouring roads and a table with a column per lane ([`LanesSection.tsx`][maid-section]) |
| Performance | One draw per frame, redraw skipped when the view is unchanged, caches per way and junction, culling to the view | Only the selected road is drawn; the map style ("lens") for all roads is plain colour by tag completeness |

[ls-svg]: https://github.com/MarcelMarzec/LaneStudio/blob/2bcdd49b7911896d69649dccd118049e166128b3/modules/lanes/svg/lanes.ts
[ls-frame]: https://github.com/MarcelMarzec/LaneStudio/blob/2bcdd49b7911896d69649dccd118049e166128b3/modules/lanes/geometry/frame.ts
[ls-road]: https://github.com/MarcelMarzec/LaneStudio/blob/2bcdd49b7911896d69649dccd118049e166128b3/modules/lanes/geometry/road_geometry.ts
[ls-layout]: https://github.com/MarcelMarzec/LaneStudio/blob/2bcdd49b7911896d69649dccd118049e166128b3/modules/lanes/geometry/layout.ts
[ls-defs]: https://github.com/MarcelMarzec/LaneStudio/blob/2bcdd49b7911896d69649dccd118049e166128b3/modules/lanes/svg/defs.ts
[ls-section]: https://github.com/MarcelMarzec/LaneStudio/blob/2bcdd49b7911896d69649dccd118049e166128b3/modules/lanes/ui/section_lanes.ts
[maid-layers]: https://github.com/osm-editor-kit/maid/blob/main/packages/module-lanes/src/overlay/layers.ts
[maid-defaults]: https://github.com/osm-editor-kit/maid/blob/main/packages/osm-lane-diagram/src/defaults.ts
[maid-arrows]: https://github.com/osm-editor-kit/maid/blob/main/packages/module-lanes/src/overlay/arrows.ts
[maid-section]: https://github.com/osm-editor-kit/maid/blob/main/packages/module-lanes/src/LanesSection.tsx

## 5. Editing

| | Lane Studio | Maid Lanes |
| --- | --- | --- |
| Choose a lane | Click it on the map; Shift adds more lanes | Click or Enter in the diagram; the table column and the map band follow |
| Add, remove, move | Count stepper, buttons, Delete key, the roadside `+` at each kerb; move lanes | `+` per direction, `×` per lane column; no moving |
| Values | Turn grid, per-lane fields for some 20 keys, a paint tool that puts one value on lane after lane | A table cell per key and lane with a list of suggested values |
| Width | Drag a lane line or the kerb on the map (one undo step), or type it | Type it in the table |
| Beyond lanes | Centre line, roadside menu (pavement, cycleway, parking, no-waiting lines), connectivity relations by clicking lanes, speed-limit painting, routing preview per vehicle | Turn restrictions, traffic signs and the way table from other Maid modules in the same app |

## 6. Checks (validation)

Lane Studio has one validator, [`validations/lane_tags.ts`][ls-valid], for lane roads and connectivity relations
anywhere on the map. One-click fixes only "where the right answer is certain". Maid has lane rules in the Issues dock,
[`rules/`][maid-rules-dir].

| Check | Lane Studio | Maid Lanes |
| --- | --- | --- |
| Value count differs from the lane count | `count_mismatch` | `lanes_pipe_count_mismatch` (cycle lanes in the pipes aside) |
| Directional counts do not add up to `lanes` | `direction_counts_mismatch` | `lanes_sum_mismatch`, fix: `lanes` takes the sum |
| Two lane keys of different length | via the model | `lanes_pipe_length_mismatch` |
| `placement` on a lane the road lacks | – | `lanes_placement_out_of_range` |
| Odd two-way count without directions, mixed key styles, bad count | `ambiguous_direction_counts`, `mixed_key_styles`, `invalid_lane_count` | – |
| `lanes=0` | `zero_lanes`, fix: `lane_markings=no` | – |
| Unknown `turn` value | `unknown_turn`, fix for clear misspellings | `lanes_unknown_turn`, the same list and fixes (adopted, section 8) |
| Deprecated `change` value | `deprecated_change`, fix | `lanes_deprecated_change` (adopted) |
| `width` narrower than the lanes | `width_too_narrow` (sum of `width:lanes`) | `lanes_width_too_narrow` (sum of `width:lanes`, on-street parking and buffers; adopted) |
| `lanes:bus` more than the bus lanes marked | `lanes_bus_unmarked`, fix marks kerb-side lanes | – |
| `hov=lane`, `destination` on a two-way road | `hov_lane`, `destination_twoway` | – |
| Old `opposite_*` cycleway and `busway=lane` | `old_cycleway`, `old_busway`, fixes | – (Maid's bicycle modules cover cycleways) |
| Turn arrows at a dead end, merges that never end | `turn_dead_end`, `merge_never_ends` (needs the roads around, only when loaded) | – |
| Connectivity relations | members, joined, syntax (fix), lane numbers | – |

[ls-valid]: https://github.com/MarcelMarzec/LaneStudio/blob/2bcdd49b7911896d69649dccd118049e166128b3/modules/lanes/validations/lane_tags.ts
[maid-rules-dir]: https://github.com/osm-editor-kit/maid/tree/main/packages/module-lanes/src/rules

Maid's model package also has a width reconciliation (`reconcileWidths` in
[`width-reconciliation.ts`][maid-width]) that adds parking and cycle lane buffers to the lanes and estimates paint;
until now no rule used it.

[maid-width]: https://github.com/osm-editor-kit/maid/blob/main/packages/osm-lanes/src/width-reconciliation.ts

## 7. Tests and tooling

| | Lane Studio | Maid Lanes |
| --- | --- | --- |
| Unit tests | Vitest with jsdom: 61 files, about 510 `it` blocks under [`test/spec/lanes`][ls-tests] (geometry 32 files, model 7, core 7, ui 7) | `bun test`: osm-lanes 46 tests, osm-lane-diagram 85 (54 SVG snapshots), module-lanes 66 |
| Geometry tests | Assertions on shapes (no gaps, no self-intersection, mitre cases) on 8 JSON extracts of UK junctions ([`fixtures`][ls-fixtures]) | Layout invariants and snapshots on made-up tag scenarios ([`fixtures/scenarios.ts`][maid-scenarios]) |
| Round-trip tests | 12 named tag sets, parsed and serialised under both driving sides ([`model/parse_serialise.ts`][ls-roundtrip]) | Write paths and widths ([`write-paths-and-width.test.ts`][maid-writepaths]) |
| Browser tests | – | `bun run check-lanes`: 27 steps in a real browser against a local mock of the OSM API (no request leaves the machine) ([`tools/checks`][maid-checks]) |
| CI | Lint, build, `tsc`, Vitest on Node 22 and 24; PR previews; codespell | `bun run check-ci`: type-check, lint, format, missing texts, unit tests |
| Docs from code | A tag coverage report against the OSM wiki ([`scripts/build_tag_coverage.js`][ls-coverage] → `docs/TAGS.md`, about 10,000 keys and tags, 659 drawn); the docs folder published as the GitHub wiki | A feature index from the apps' configs (`bun run features-doc`) |
| Texts | English, from `data/lanes.yaml` | English, German, French and Spanish ([`messages/`][maid-messages]) |

[ls-tests]: https://github.com/MarcelMarzec/LaneStudio/tree/2bcdd49b7911896d69649dccd118049e166128b3/test/spec/lanes
[ls-fixtures]: https://github.com/MarcelMarzec/LaneStudio/tree/2bcdd49b7911896d69649dccd118049e166128b3/test/spec/lanes/fixtures
[ls-roundtrip]: https://github.com/MarcelMarzec/LaneStudio/blob/2bcdd49b7911896d69649dccd118049e166128b3/test/spec/lanes/model/parse_serialise.ts
[ls-coverage]: https://github.com/MarcelMarzec/LaneStudio/blob/2bcdd49b7911896d69649dccd118049e166128b3/scripts/build_tag_coverage.js
[maid-scenarios]: https://github.com/osm-editor-kit/maid/blob/main/packages/osm-lane-diagram/src/fixtures/scenarios.ts
[maid-writepaths]: https://github.com/osm-editor-kit/maid/blob/main/packages/osm-lanes/src/test/write-paths-and-width.test.ts
[maid-checks]: https://github.com/osm-editor-kit/maid/tree/main/tools/checks
[maid-messages]: https://github.com/osm-editor-kit/maid/tree/main/packages/module-lanes/messages

## 8. Where each one goes further

Lane Studio:

- Draws the whole street, all roads in view, at real widths, with junctions, tapers, roundabouts and markings, so a
  mapper can compare the tags with the aerial image road by road.
- Edits on the map: dragging widths, painting values, the roadside `+` menu, connectivity relations by clicking lanes.
- Reads any `*:lanes` key, conditional ones too, and keeps unknown values.
- Checks that need the roads around (turn arrows into nothing, merges that never end, connectivity relations).
- Speed limits, routing per vehicle, street parking, UK markings and signs in the same editor.

Maid Lanes:

- A cross-section that shows the road before and after the selected one, and a table with every lane value side by
  side.
- The German cycle lane pattern (cycle lane in the pipes, not counted in `lanes`) read and edited as valid tagging.
- `placement` read for where the lanes sit on the map, and a check for placements on lanes that do not exist.
- A map style that colours every road by how complete its lane tags are, with the next step to complete it in the
  sidebar.
- Width checks that count parking and buffers; texts in four languages; browser tests against a local mock API.

Questions the two answer differently, which may be useful to both: whether a missing lane count is assumed from the
road type or left open; whether driving side comes from the location or from a tag; whether lanes are drawn for every
road in view or only the selected one; whether the edit goes through a model (Lane Studio) or straight to one key
(Maid).

## 9. What Maid adopted, and what it left out

**Adopted (2026-11-26)**, in [`rules/value-rules.ts`][maid-value-rules] with tests in
[`value-rules.test.ts`][maid-value-tests], credited to Lane Studio (ISC licence):

- The wiki's list of `turn` values, the misspellings with one clear meaning (`straight`, `u_turn`, `slightleft`, …)
  and the deprecated `change` values (`only_left`, `only_right`), from [`model/values.ts`][ls-values] and
  [`validations/lane_tags.ts`][ls-valid].
- Three rules on that: `lanes_unknown_turn` (fix where the meaning is certain), `lanes_deprecated_change` (fix),
  `lanes_width_too_narrow` (no fix, as in Lane Studio, since either value can be wrong). The width rule uses Maid's
  own `reconcileWidths`, so parking and buffers count; it compares with `width` only, not `est_width`, and allows
  0.05 m as Lane Studio does.
- Lane Studio's test cases for these checks, in Maid's rule form.

**Left out, with the reason:**

- **The lane model and the geometry code.** Maid's model and diagram are shared with another project (the street space
  editor) and drawn with MapLibre; Lane Studio's are written for iD's SVG layer. Swapping would be a rewrite, not an
  adoption. Lane Studio's offset with mitre joins is a reference if Maid ever draws all roads at width.
- **UK default widths.** They are UK practice; Maid's defaults are Berlin's. A per-country table is an option later.
- **Lane count from wiki defaults ("assumed").** Maid shows a missing count as missing, which its map style relies on.
- **Checks that need the surrounding roads** (`turn_dead_end`, `merge_never_ends`) and **connectivity relations.**
  Maid's lane rules look at one way; these need a rule that reads the junction and loaded-data state. A candidate for
  a later step.
- **`lanes_bus_unmarked`, `zero_lanes`, `hov_lane`, `destination_twoway`.** Small and clear; left for a later step to
  keep this one about values. `old_cycleway` overlaps Maid's bicycle modules.
- **The UK junction fixtures.** Maid's fixtures are cut from a bulk extract by a person and committed, and Maid's
  automated runs never contact OSM servers; UK junctions are not in its scenes.
- **The tag coverage script.** It reads the OSM wiki over the network, which Maid's automation does not do; worth a
  look as a manual report.

[maid-value-rules]: https://github.com/osm-editor-kit/maid/blob/main/packages/module-lanes/src/rules/value-rules.ts
[maid-value-tests]: https://github.com/osm-editor-kit/maid/blob/main/packages/module-lanes/src/rules/value-rules.test.ts
[ls-values]: https://github.com/MarcelMarzec/LaneStudio/blob/2bcdd49b7911896d69649dccd118049e166128b3/modules/lanes/model/values.ts

## 10. Afterwards: the whole street in Maid (2026-11-26, a branch)

After this comparison Maid tried Lane Studio's central idea, drawing every road at its lane widths and joining the
roads at junctions, which Maid had left out as too complicated. The geometry follows Lane Studio's
`road_geometry.ts` and `frame.ts` in a reduced form: arms at a node, ends cut on the bisector, a road with fewer lanes
running on out of the other's with tapers, side roads pulled back to the main road's kerb, junction surfaces with
kerb curves, roundabout joins. It is a separate, pure module (`osm-lane-diagram/street`) that takes each way's
cross-section as input, and Maid draws its output as MapLibre polygons, redrawing only the ways around an edit.
Lane Studio's test examples (Boston roundabout, Holdingham, Luton, the M5 diverge) were drawn with it to compare;
the details and what is still missing are in the package's README.

## 11. Sources and method

The Lane Studio code was cloned read-only into a scratch folder and read by three agents (model and tags, architecture
and editing, drawing and tooling) and checked by hand where this doc relies on a detail (the validator, the offset
function, the zoom levels, the default widths, the hooks table). Line counts and test counts were measured with `wc`
and `grep`. Nothing was run in Lane Studio. The forum points (routing and connectivity still being tuned, tested so
far on UK left-hand roads) are from the announcement thread.
