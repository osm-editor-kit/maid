# Grid and rows: many shapes in one go

Research for Maid's parking editor (`apps/maid-parking`). Scope: one tool that divides a quadrilateral into rows and columns, so that one drawn outline becomes many parking spaces (`amenity=parking_space`) or many terraced houses. Date of research: 2026-10-16.

How far the sources can be trusted: the JOSM wiki pages and the Gridify repository README were read through a summarising fetch, not checked against the plugins' code. The Terracer GitHub repository returned 404; only its wiki page was read. The Gridify wiki page was last edited in 2021.

## 1. What exists

### 1.1 JOSM Gridify

Source: [JOSM/Plugins/Gridify](https://wiki.openstreetmap.org/wiki/JOSM/Plugins/Gridify) and the plugin's repository README (github.com/JOSM/josm-gridify).

Step by step:

1. Select one way with four nodes (closed or open, need not be rectangular; a parallelogram works), or select four separate nodes.
2. Start it from "More tools > Gridify" or Alt+Shift+Y.
3. Enter the number of rows and columns in the dialog. With the mouse wheel over the preview: plain wheel changes both, Shift changes rows only, Ctrl changes columns only.
4. Choose the output: "blocks" (filled cells, the default) or "lines" (only the cell borders).
5. Choose whether to copy all tags from the source way to the new ways.
6. Choose whether to delete the source way. The docs suggest deleting it when it was drawn only to be split.

Not documented: whether neighbouring cells share nodes, which tags are set beyond the copy, limits on rows and columns.

### 1.2 JOSM Terracer

Source: [JOSM/Plugins/Terracer](https://wiki.openstreetmap.org/wiki/JOSM/Plugins/Terracer). Repository page not available.

Step by step:

1. Draw the terrace as a simple quadrilateral over the imagery. The wiki asks for "one straight line segment for each end"; orthogonalising a rectangle first is recommended.
2. Optional: select address nodes (JOSM 24713 or later). With them, the tool takes the house numbers from the nodes and deletes the nodes afterwards.
3. Optional: select the street too. This sets `addr:street` and can add the houses to an `associatedStreet` relation. The street needs `highway` and `name`.
4. Select the outline and run Terrace (Shift+T). The dialog asks for the house-number range, the interpolation (every number, odd, even) and the road name (auto-complete from loaded highways).
5. Result: the original outline is not modified; smaller quadrilaterals are created and selected; they can be grouped in a relation; the outline can be deleted afterwards.
6. Numbering direction follows the outline's start node. Reverse Terrace (Shift+R) flips it; choosing the lower or upper left node first fixes it in advance.

Tags: `addr:housenumber` on each house; `addr:street` only the first time the relation is created (the wiki calls the behaviour inconsistent afterwards). `building` and `levels` are not discussed.

Not documented: shared nodes between neighbours, multipolygons, non-rectangular shapes beyond the advice above.

Known bugs (wiki, version 32158): more than one house with "keep outline way" deselected crashes; "create an associatedStreet relation" without the street creates a broken relation.

### 1.3 Other tools and discussions

- **iD issue #6728 "specific tool for parking_space (create a table?)"** (closed). Read the body and first comments. The maintainers' answer: a table tool is "outside the scope of iD right now", suggested a JOSM plugin instead, and tied it to another issue (#6717, not read). This is a precedent for building the tool in Maid rather than waiting for iD.
- **iD #7616 "Don't add capacity=1 to amenity=parking_space"** (closed, title only read). Relevant to the capacity rule in section 4.
- **iD #6988 "Split building into 2 identical connected buildings"** (open, title only read). The same wish as the terrace use case; not read in full.
- **iD #6822 "Suggest tagging semi-detached house for 2 adjacent houses"** (closed, title only read). Relevant to terraces (shared walls).
- A combined search of iD issues for "gridify", "divide building" and "split into parts" returned nothing usable; the single search for "terrace" returned the list above.
- **iD PR #9020 "create a 'divide' operation"** (k-yle, open since 2022, last update 2026-08-03, branch `divide` in `k-yle/iD`; found by the research for [4-cut-areas.md](4-cut-areas.md)): divides one way with four corners into a grid, like Gridify. Key K, two prompts (short and long length) in a modal with a preview (`modules/ui/divide_preview.ts`). Review: a concave input gives self-intersecting parts, and a neighbour sharing an edge does not get the new nodes; reviewers want it in the menu without a key. Its code was not read for this note; read it before building.
- **Rapid** and **Maid**: no grid or row tool found.
- **Sibling repositories** (read-only): `parking-studio` has no markdown that mentions `parking_space` or grid. `parking-lanes/app/src/modes/parking/fixtures/dev-map-bbox.json` contains `parking_space` in a fixture, so the lane app has data with spaces. Not read further; a lead only.

### 1.4 OSM tagging

Source: [Tag:amenity=parking_space](https://wiki.openstreetmap.org/wiki/Tag:amenity%3Dparking_space), [Key:capacity](https://wiki.openstreetmap.org/wiki/Key:capacity).

- A parking space is an addition inside an existing `amenity=parking` area, not a replacement. Mapping the whole lot as `amenity=parking` stays acceptable.
- Geometry: preferably an area, one per space. A node is allowed. Exceptions: many identical spaces with no differing attributes, spaces too small to map (bicycle parking), imagery too poor to separate them.
- Tags: `amenity=parking_space` (required); `capacity` (number of spaces one object represents, default 1); `name`, `ref` / `ref:<vendor>`; `parking_space=*` (disabled, normal, charging, parent, ...). Shared attributes (surface, fee, covered, access) go on a site relation `type=site` + `site=parking`, with only differing values on single spaces. Spaces can be grouped in that site relation.
- Capacity: per area, counting the spaces that area represents. The parking area's `capacity` means all lots, including disabled ones, and has sub-keys (`capacity:disabled`, `capacity:charging`, ...).
- **Open point**: the wiki does not say whether the parent's `capacity` should be derived from its spaces, nor how to avoid counting twice when both are mapped. Maid must choose a rule (section 4).

## 2. Use cases in maid-parking

Maid's parking editor is the street-side parking editor (`packages/module-parking`). It writes `parking:left` / `parking:right` / `parking:both` on roads and `amenity=parking` areas with `parking=*` values (presets in `packages/module-parking/src/presets/presets.ts`: "Parkplatz" per `parking` value, disabled bay, underground entrance). It has no preset for `amenity=parking_space` of its own. The preset test (`parking-presets.test.ts`, line 227) lists `amenity=parking_space` with geometry `area`; where that preset comes from was not traced further.

### 2.1 Rows inside a lot (main case)

A lot is an `amenity=parking` area. The user draws its outline, then draws a strip or rectangle for a row of bays, then divides it: N bays along the strip, one row. Variants:

- **Perpendicular**: bays are rectangles, the row is a rectangle. Simple division.
- **Angled (e.g. 45 or 60 degrees)**: bays are parallelograms; the outline of the row is a parallelogram. Division along both long edges works exactly.
- **Parallel** (along the aisle): bays are long thin rectangles; the row is a thin strip; many columns of length 1 and rows of length N. Same division.
- Several rows: rows of the lot are drawn separately, or the whole lot is divided into rows x columns.

The parent lot stays. The bays are children, not replacements.

### 2.2 Rows along a street

Parallel bays along a street are normally not mapped as objects. The street carries `parking:left=parallel` (or right / both) and the editor's side lines show it. A division tool could create spaces next to the kerb, but then the street's `parking:*` tags and the spaces describe the same parking twice. Recommendation: MVP does not create spaces along streets; street rows stay on the road's `parking:*` tags. Decision for Tobias (section 6).

### 2.3 Terraced houses (secondary)

A row of terraced houses (Reihenhäuser) from one building outline: N houses in one row. Shared walls: houses touch, so neighbours should share the wall nodes. Address interpolation (Terracer) is a separate feature; the MVP only divides. Each house keeps the building tags of the source.

## 3. Interaction proposal

Keep Maid's pattern: one Point / Line / Area button set at the top. The division is an action on a selected area, offered in the right-click menu, not a new top-bar mode.

1. Make the outline. Draw an area with the Area tool (4 clicks, then the first node), or with a 3-click rectangle if that tool is added (open question 7). Select it.
2. Right-click the area. The context menu (`packages/shell/src/components/MapContextMenu.tsx`) has "Divide into..." (only offered for an area with 4 corners).
3. The sidebar shows a small panel, not a modal: "Rows" and "Columns" fields (default 1 and 1, the user changes them), a live preview of the parts as dashed outlines, the count "N parts", and the rule for shared nodes (default on).
4. Keys, as Gridify: plus and minus change columns; Shift plus and minus change rows; mouse wheel as Gridify. Enter applies, Escape cancels. Nothing is changed before Enter, and the preview stays off the data.
5. Apply: one undo step ("Divided an area into 12 parts"). The new parts are selected together, so the sidebar shows the multi-selection view (`docs/research/multi-selection.md`).
6. Preset step: "Set preset on 12 parts" offers `amenity=parking_space` (or the terrace case: `building=*`) on all parts in one edit, one undo step. This reuses the multi-selection path that already exists.

Drawing a strip: a second, optional entry is a 2-node line selected and "Divide strip into..." with the number of bays and the width. Not in the MVP; keep it as a follow-up.

## 4. Geometry and topology rules

### 4.1 Division math

Let the outline be four corners A, B, C, D in order, with the two long edges A-D and B-C being the ones the division runs along (for a row, the columns cut across the strip; the user picks which pair of edges is "long" by the start corner, or the tool picks the longer pair). Column i of N divides both long edges at t = i/N. Row j of M divides the other pair. Point (u, v) inside the quadrilateral is the bilinear interpolation of the four corners:

    P(u, v) = (1-u)(1-v)A + u(1-v)B + uv C + (1-u)v D

Cut lines go through P(i/N, v) and P(u, j/M). A part is the quadrilateral of four neighbouring grid points. For a parallelogram the parts are exact copies; for a trapezoid they are trapezoids and the areas still sum to the source area (check in tests).

### 4.2 Shared nodes

- Each cut position gives one node on each long edge, created once and used by both neighbours. Default: **shared**. Reason (reasoned, not tested against Maid's validator): neighbours touch without overlapping, and a shared wall is one node, not two nodes at the same place.
- Not shared: each part gets its own nodes on the same positions. Only if a use case needs separate ways that do not touch; none found so far.
- The outer edge nodes of the source are reused for the first and last parts (so the outline's corners stay the same objects).
- A node on the source outline that is also used by another way is not moved (the division only adds nodes; the source is not changed when it is kept).

### 4.3 Source kept or replaced

- **Parking lot (`amenity=parking` drawn as the strip's parent)**: keep the parent. The strip, if it was drawn only for the division, is deleted by default (Gridify's "delete source"). Option in the panel.
- **Building into terraces**: replace (proposed). The source building is deleted and its tags are copied to the parts. Terracer does the opposite (the outline is not modified and can be deleted afterwards), so the choice is a difference from the plugin, not a rule of the wiki. Option to keep the outline, as Terracer does.
- Relations of the source: a source that is a member of a relation is refused (4.5), so no member has to move.

### 4.4 Tags

- Copy from the source to each part: all tags, except the ones below (Gridify copies all or none; Maid copies all or a chosen list).
- Never copied: `name`, `ref`, `addr:*` (house numbers are a later step, as Terracer does), `capacity` on a parking area (a copied `capacity=20` on 20 spaces would double count), `source`, `note`, `fixme` values that refer to the whole.
- A parking lot's `capacity`: not changed by the division. Decision for Tobias (open question 4).
- Parking spaces: no `capacity=1` written (iD #7616), so the preset is `amenity=parking_space` only.

### 4.5 Refusals

Refuse with a message (sidebar text, no change to the data):

- Not four corners (three or five or more nodes, or a closed way with a repeated node).
- Concave or self-intersecting quadrilateral.
- A multipolygon, or an area with inner rings.
- The source is a member of a relation (except as a parent of an existing `type=site` for parking spaces: later).
- Rows x columns above a limit (proposal: 200 parts in total; Tobias to set).
- A part below the minimum size (proposal: a bay below 2.0 m x 4.0 m is too small; the numbers need checking against the parking standard the project uses; Tobias to set).
- No change in parts (1 x 1): the button is disabled, not an error.

## 5. Test plan

### 5.1 Unit tests (Vitest, next to the operation)

Put the pure division in `packages/operations/src/` (an operation like `point-to-area.ts`, with `operations.test.ts`) or in `packages/module-parking/src/operations/` for the parking-only part. Tests:

- Count: N x M gives N x M parts; 1 x 1 gives none.
- Area: the sum of part areas equals the source area (tolerance 1e-9 relative) for a rectangle, a parallelogram and a trapezoid.
- Exact shape: parallelogram parts are equal; rectangle parts are rectangles.
- Shared nodes on: each cut node id appears in exactly two parts (or one, on the outline); no duplicate positions. Shared off: no node id appears twice.
- No overlap: pairwise intersection area of parts is zero.
- Corners of the outside parts lie on the source outline.
- Ids: all new ids are negative and distinct; row-major order is deterministic (first part at corner A).
- Tags: copied set (building, levels) and excluded set (name, ref, addr:*, capacity).
- Refusals: each case in 4.5 returns the refusal, not a partial result.
- Undo: applying and undoing restores the graph exactly (same ids and tags).

Run: `bun test packages/operations` and `bun test packages/module-parking` (read-only commands, allowed for agents). Final: `bun run check`.

### 5.2 Browser check

New script `tools/checks/check-divide.ts`, run with `bun run check-divide --app parking` (the checks take `--app`; add the script to `check-all`'s table in `tools/checks/check-all.ts`). Steps, with real input and a data-and-map comparison after each step, as the other checks:

1. Draw a 4-corner area on the small scene (keys and clicks, as `check-draw`).
2. Right-click it; the "Divide into..." item is present; the panel shows "1 x 1" and no preview.
3. Set 3 columns and 2 rows with the keys; the count shows 6; the preview is drawn; the data is unchanged.
4. Enter: six new areas; the shared node count matches the formula; the map sources show the six parts; the source is deleted when the option is on.
5. Set preset on all six: six `amenity=parking_space`, one undo step.
6. Undo twice and redo: the data equals the state after step 4.
7. Escape during the preview: no change.

Expected output: exit code 0 and the expected number of `ok` lines, as the other checks. Maid only, no network: the check runs on the mock API like every check (core rule 1).

## 6. Open questions for Tobias

1. **Shared nodes by default** for parking bays and terraces: yes (proposed) or no?
2. **Source handling**: keep the parking lot and delete the drawn strip (proposed); for buildings, replace the building (proposed) or keep it?
3. **Street rows**: create spaces along streets at all, or keep street parking on the road's `parking:*` tags only (proposed for MVP)?
4. **Capacity**: leave the parent lot's `capacity` untouched and warn on a mismatch with the number of spaces (proposed), or derive it?
5. **Limits**: maximum parts (proposed 200) and minimum bay size (proposed 2.0 x 4.0 m). Which numbers does the project use?
6. **Terrace house numbers**: in scope for this tool (Terracer does it), or a later step?
7. **Rectangle tool**: add a 3-click rectangle for the outline, or only the Area tool?
8. **Concave or self-intersecting input**: refuse (proposed) or clip?
9. **Lines output**: do we need "lines" (cell borders only, as Gridify) for strip divisions, or only filled parts?
10. **Where it lives**: the pure division in `packages/operations` (shared with iD-style operations) or in `packages/module-parking` (parking-only)?

## Sources

- JOSM Gridify wiki: https://wiki.openstreetmap.org/wiki/JOSM/Plugins/Gridify
- JOSM Gridify repository: https://github.com/JOSM/josm-gridify
- JOSM Terracer wiki: https://wiki.openstreetmap.org/wiki/JOSM/Plugins/Terracer
- OSM wiki amenity=parking_space: https://wiki.openstreetmap.org/wiki/Tag:amenity%3Dparking_space
- OSM wiki Key:capacity: https://wiki.openstreetmap.org/wiki/Key:capacity
- iD issues: https://github.com/openstreetmap/iD/issues/6728, https://github.com/openstreetmap/iD/issues/7616, https://github.com/openstreetmap/iD/issues/6988, https://github.com/openstreetmap/iD/issues/6822
- Maid: `packages/module-parking/README.md`, `packages/module-parking/src/presets/presets.ts`, `packages/module-parking/src/sides.ts`, `packages/shell/src/components/MapContextMenu.tsx`, `docs/research/multi-selection.md`, `docs/build-out/steps.md`
