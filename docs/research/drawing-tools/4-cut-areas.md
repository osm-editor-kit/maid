# Cut areas: split a building or area along a drawn line

Research, 2026-10-16. Feature 4 of the drawing tools. Nothing here is implemented yet.
Code claims were traced by reading the source at the pinned references (`bun run refs-setup`) and Maid's code. Nothing was run. Items marked "not checked" were not verified.

## Summary

- iD does not cut areas. Its "Split" on an area (one or two vertices) splits the **outline** into two open ways inside a new multipolygon, leaves the geometry unchanged, and the mapper must draw the cut edge by hand. Maid already ports exactly this (`packages/model/src/actions/split.ts`, annotation "Split the edge of an area").
- JOSM's Split Object (Alt+X, UtilsPlugin2) is the reference for a real cut: an untagged open line whose ends lie on a closed way gives two closed ways, both with all tags. JOSM has an open bug where a cut line outside the area produces overlapping results (ticket 21153).
- Kyle's fork has no line-cut feature. His `divide` branch (PR #9020, open) is a grid divide of a four-corner way, key K. The review thread asks for a line-based split as a follow-up; nobody built it in iD.
- The only prototype of a line cut in iD is RudyTheDev's "splice" (issue #9334, 2022): single-way areas only, not finished, not submitted.
- Recommendation: "Cut" in the edit menu for one selected closed way, then draw a polyline that crosses the outline exactly twice. No shortcut in v1. Produce two closed ways (not a multipolygon) for plain areas. Refuse, with a reason, every case that is not clearly safe.

## 1. What exists

### 1.1 iD: Split (`modules/actions/split.ts`, `modules/operations/split.js`)

Source: `.reference/id/modules/actions/split.ts` (the operation file is `.reference/id/modules/operations/split.js`).

- **Selection.** The operation is available when every selected entity is a vertex, optionally plus ways. `limitWays` restricts the split to selected ways when a shared vertex belongs to several.
- **Which ways split.** `waysForNode` returns closed ways (any vertex on them counts) and open ways where the node is interior (not an endpoint). If any line is among the candidates, only lines are split; areas are split only when no line is.
- **One vertex on a closed way.** `splitArea` picks the partner node that maximises (path length from the node to the partner) / (straight distance). Bone shapes split at their waist, circles across the diameter.
- **Two vertices on a closed way.** The action loops over the nodes; the first node is split with the next selected node as partner (`otherNodeIds`). The later node then finds no interior position and does nothing. Two selected vertices therefore give the same kind of result as one, with a chosen partner.
- **What the halves are.** For a closed way, both halves are **open** arcs from node A to node B and back. No chord is added. So the area's geometry is unchanged.
- **Areas.** `isArea` is true for a closed way. The action creates a new multipolygon with the two arcs as `outer` members, moves the area's tags to the multipolygon, and resets the ways' tags (way-only tags such as `osmWayOnlyTags` are kept on the ways in iD, not in Rapid or Maid, see 1.3). The annotation is "Split the edge of an area". RudyTheDev's step list in #9334 confirms this workflow: split, disconnect, draw the new edges, close the parts, then re-merge and re-tag.
- **Which id keeps the history.** `keepHistoryOn` defaults to `'longest'`: the longer half keeps the original way id, the other is new.
- **Tags on lines.** Summable tags such as `step_count` are divided proportionally between the halves (iD uses `osmSummableTags`; Rapid and Maid use `step_count` only).
- **Relations.** Turn restrictions: the half that touches the via node/way stays in the restriction. Other relations (routes, multipolygons): both halves are inserted in the member order (`splitWayMember`, a heuristic based on connections to the neighbour members). Roundabouts (`junction=roundabout|circular`) are not split when they are closed and in a relation (`simple_roundabout`).
- **Disabled reasons.** `not_eligible` (no candidate way, or the limit does not match), `parent_incomplete` (a route or turn restriction member's neighbour or via way is not loaded; iD offers to download them, then runs the operation), `simple_roundabout`, and `connected_to_hidden`.
- **Shortcut.** X (`operations.split.key`).

Tests in iD: `test/spec/actions/split.js` (not read here).

### 1.2 JOSM

- **Split Way** (`https://josm.openstreetmap.de/wiki/Help/Action/SplitWay`, shortcut P). Splits at selected nodes. For a closed way the longest new segment keeps the original id and history (since changeset r8886); an expert dialog can choose otherwise. The wiki does not say how tags or relations are handled.
- **Split Object** (`https://josm.openstreetmap.de/wiki/Help/Action/SplitObject`, UtilsPlugin2, Alt+X). This is the cut we want:
  - Closed way, simple case: select two non-adjacent nodes of the closed way. The way is cut along a straight line between them into two closed ways.
  - Closed way, cut along a drawn line: select an untagged, non-closed way whose end nodes lie on the closed way. It is cut into two closed ways.
  - Shared nodes: if several closed ways share the selected nodes, the target closed way must also be selected.
  - Multipolygon or boundary: select the relation and an untagged open way. Its ends must connect to `outer` members. It must not cross or share nodes with an `inner` member. All members must be downloaded.
  - Both results inherit all tags and are selected afterwards.
  - Not specified on the page: which part keeps the original id.
- **Bug #21153** (open, assigned GerdP): a cut line lying entirely outside the area, or relations with parts outside, creates the new closed way or relation, but the former outer part is added to both areas, giving overlapping areas. Developers noted that only ERROR-level checks block multipolygon splits, and that crossings with shared nodes are only warnings. Suggested check: compare the covered area before and after. Lesson for us: validate geometry before writing and refuse.
- Not relevant despite the lead: ticket 18229 is about the Bedzin imagery layer, not splitting.

### 1.3 Rapid 3 (`.reference/rapid/modules/actions/split.ts`)

Same action as iD, ported to TypeScript, with two differences that Maid inherited:
- For an area, if it is already in a multipolygon, Rapid merges the tags into that relation (`parentMP.mergeTags`) instead of creating a new one.
- Both halves end up with **no tags** (`tags: {}`); iD keeps way-only tags on them.

Rapid has no area-cut feature.

### 1.4 Maid today

- Operation `splitOperation` in `packages/operations/src/operations.ts` (shortcut `x`). Applies when the selection is vertices plus optional ways; one reason only (`not_eligible`) is mapped to a sentence: "Lines can't be split at their beginning or end." Missing against iD: the `parent_incomplete` interrupt, `simple_roundabout` and `connected_to_hidden` checks.
- Annotation: "Split the edge of an area" / "Split a line" / "Split N features". After the run, the vertices, the affected ways and the created ways are selected.
- Model action `packages/model/src/actions/split.ts` (415 lines), a port of Rapid with two Maid-specific changes marked in the code (F-actions-b-34, see `docs/research/relations-vs-id.md`): a split area is not paired with its new half in non-multipolygon relations, and the multipolygon replaces the area in the area's other relations (iD#12024). Both halves get `tags: {}`.
- Tests: `packages/operations/src/operations.test.ts`, `describe('split')` at line 139, roads only. Browser check: `tools/bench/ops-check.ts` splits a road, not an area.
- Edit menu: `packages/shell/src/components/MapContextMenu.tsx` builds the items from the selection's operations (`useEditCommands` in `packages/shell/src/commands.ts`). The shortcut is registered in `packages/shell/src/useShortcuts.ts` (line 143).
- Single-letter shortcuts in use by operations (from `operations.ts`): v, x, c, s, q, o, d, e, t, y. Modes use 1, 2, 3. Check `useShortcuts.ts` before picking one.
- Drawing: `packages/shell/src/drawing.ts` (`drawClick`, `engine.draw.click`, `DrawKind` `'line' | 'area'`), modes `draw-line` and `draw-area`.
- No polygon-boolean or topology library is in the workspace (grepped the `package.json` files for polygon-clipping, turf, jsts, martinez, geos: none). Geometry helpers must be written or taken from Rapid's math package.

### 1.5 Kyle's fork and the iD threads

Checked with `gh`, read-only.

- Branches of `k-yle/iD` (11): `9398-drawing-lost`, `disable-locator-overlay`, `divide`, `gh-pages`, `kh/import-osmChange`, `kyle-deploy`, `openseamap-overlay`, `plugin-sdk`, `preset-field-icons`, `route-ref`, `validator-oneway-onelane`. Only `divide` relates to this topic. `9398-drawing-lost` is not checked; the name suggests a fix for lost drawings.
- PRs by k-yle matching "split" or "cut" in openstreetmap/iD: only **#9020 "create a 'divide' operation"** (open, opened 2022-03-08, last update 2026-08-03, branch `divide`, closes #6988 "Split building into 2 identical connected buildings").
  - What it does: divides one selected way with four corners into a grid of smaller closed ways (parking spaces, terraces, camp pitches), similar to the JOSM gridify plugin. Key K. Two prompts (short and long length) in an async modal with a preview (`modules/ui/divide_preview.ts`). The divide action takes the way's four nodes (`divideRectangle`). Not a line cut.
  - Review: tyrasd (member) found that a concave input produces self-intersecting results, and that a neighbouring area sharing an edge does not get the new vertex (validator warnings). He favours a more flexible divide over a narrow one. kymckay asked for a custom dividing line as a follow-up. 1ec5 suggested selecting an area and a crossing line (no vertex) and splitting along it, and noted vector tools already do a similar operation. k-yle agreed that the operation should be in the menu without a shortcut.
  - Verdict: nothing for a line cut in Kyle's fork. The closest thing is the discussion in #9020.
- Other iD threads:
  - **#9334** "Feature Request: split polygon on blade" (open, 2022). RudyTheDev's prototype `splice` (branch `splice_operation` in his fork): draw a line between two edges of an area, select both, run splice. Works for single-way areas; polygons with several ways not done; no PR as of the last comment. The thread also documents today's 21-step manual workaround.
  - **#8374** "cut off / cut out for splitting areas" (closed). The proposal was a draw-a-line cut in the context menu. k-yle's answer: cut-out already works by selecting the outer and inner area and pressing C (merge).
  - **#2971** "Universal area cutting tool" (closed by jfirebaugh): iD is a basic to mid-level editor; complicated UI for advanced editing belongs in JOSM.
  - **#3769** "Knife Tool to split a way at an arbitrary point" (open): a comment calls it an advanced tool for the toolbar. **#3934** "Split area should be easy possible" (closed) is marked a duplicate of **#969** "Splitting an area appears to be broken" (closed, title only read).

## 2. Interaction options and recommendation

| Option | How | Pros | Cons |
| --- | --- | --- | --- |
| (a) Cut mode | Select one closed way, edit menu "Cut area" (or the Maid operation), then draw a polyline across it; Enter or double-click finishes; Escape cancels | Matches how mappers think; one gesture; no extra features needed | A new interaction mode; needs a clear status text |
| (b) Line + area | Select an area and an existing untagged open way that crosses it, then "Cut" | Reuses drawing; JOSM-like | Two selections; the line is consumed; a tagged or shared line must be refused |
| (c) Two vertices | iD's existing Split with two vertices | Already in Maid | Makes an outline split in a multipolygon, not a cut (see 1.1) |

**Recommend (a) for v1, (b) later.** Option (c) stays as it is and is not called a cut in the UI.

Details for (a):
- Entering: "Cut" in the edit menu for exactly one selected closed way. Shows its tooltip and reasons when disabled.
- Drawing: the first click is the start point and must be outside the area or on its outline; intermediate clicks are the polyline; a click on an existing vertex snaps to it. The polyline may leave and re-enter the area as long as the algorithm finds the chord (section 3). Backspace removes the last point (as in the line tool).
- Finishing: Enter or double-click. The preview shows the two pieces (outline in one colour, the chord dashed).
- Escape: cancels before any graph change; nothing enters the history.
- Undo: the whole cut is **one** undo step. Redo restores both halves. Undo label: "Cut an area in two" (or "Cut an area into N").
- Afterwards: both halves are selected, as the split does.
- Disabled reasons appear as tooltip sentences (section 5).

## 3. Algorithm

Input: a closed way `W` (its nodes without the closing repeat: `P0..Pn-1`), and a polyline `L` (`Q0..Qm`), all in a local metric projection (metres) so the tolerance is in metres. Tolerance `eps` for snapping and for "on the outline": a single metric value (for example 0.3 m, to be decided, section 7).

1. **Validate inputs.** `W` is simple (no self-intersections, no repeated consecutive nodes). `L` has at least one segment and no self-intersections. Refuse otherwise.
2. **Intersections.** For every segment of `L` and every segment of `W`, compute the intersection. Record for each: parameter along `L`, and position along `W` (segment index plus t). Collinear overlaps are refused. A point within `eps` of an existing vertex of `W` is the vertex itself (no new node).
3. **Keep the inside part.** Walk `L` in order. The parts of `L` before the first crossing and after the last crossing are the drawing tails; they are discarded. For v1, require exactly **two** crossings `c1`, `c2` where the piece of `L` between them lies inside `W` (test the midpoint of the chord with point-in-polygon). Otherwise refuse with the reason from section 4.
4. **Crossing nodes.** For each of `c1`, `c2`:
   - an existing vertex of `W` within `eps`: reuse it;
   - otherwise insert a new node on the edge of `W` (new node id, position on the segment), unless the edge belongs to another way too (refuse, section 4).
5. **Chord.** The chord is the part of `L` between `c1` and `c2`, with its intermediate vertices (reuse `L`'s nodes if `L` is an existing way, otherwise new nodes). It must not touch `W` anywhere else, and must not touch any inner ring (section 4).
6. **Two rings.** `W` is split at `c1` and `c2` into arcs `A1` (from `c1` to `c2` along `W`) and `A2` (the other way). Ring 1 = `A1` + chord reversed; Ring 2 = `A2` + chord. Both are closed (first node = last node). Check each ring has at least three distinct nodes and non-zero area; refuse otherwise.
7. **Ids and tags.**
   - The ring with the longer perimeter keeps `W`'s id and history (iD's `'longest'` rule); the other is a new way.
   - Both rings get `W`'s tags (JOSM's rule). Summable tags such as `step_count` are divided by the length ratio, as iD does; other count tags are not changed (decide, section 7).
   - The drawn line is not kept as its own way. Its nodes become the shared boundary of the two rings. (The task brief said the cut line is not kept: it is not kept as a way, but the chord's nodes stay in both rings.)
8. **Relations.** See section 4. Plain area: nothing else changes. Multipolygon outer: `W` is replaced by the two rings, both with role `outer`, in the member order of the relation; inner members stay where they are unless they must move (refuse instead, section 4).
9. **Write.** One new action `cut` in the model (new file, for example `packages/model/src/actions/cut.ts`), with the geometry in a headless helper (no map, no UI, as `packages/operations`). The operation returns the action and the selection. Unit tests on the geometry; one undo entry through the operation's `actions` list.

Open-line variant (b), later: the chord is an existing untagged way `L` whose ends lie on `W`; it is consumed (deleted) only when no other entity uses it. Use the same steps.

## 4. Geometry and relation cases

Rule per case: **do** (automatic, both halves as in section 3), **refuse** (no change, with the reason text), or **later** (not in v1). "Refuse" is the default; a refusal names the reason.

| Case | Rule | Reason text (proposal) |
| --- | --- | --- |
| Simple closed way (building, plot), line crosses twice | **do**: two closed ways, both with the tags | none |
| Line crosses 4+ times (concave shape) | **later**: v2 cuts one chord at a time (first chord, then the piece that contains the next chord). v1: **refuse** | "The line crosses the outline 4 times. Cut one part at a time (not yet supported)." |
| Line crosses 1 time, or ends inside the area | **refuse** (no chord) | "The line must cross the outline twice." |
| Line passes exactly through an existing vertex of the area | **do**: reuse the vertex | none |
| Line touches the outline at one point (tangent) | **refuse** | "The line only touches the outline." |
| Line lies along an edge (collinear overlap) | **refuse** | "The line runs along the outline." |
| Line ends on the outline (JOSM style) | **do**, same algorithm (the crossings are the endpoints) | none |
| Line crosses an edge shared with a neighbouring area or line | **refuse** in v1 (iD #9020 review: neighbours would need the new node; iD does not do it). v2: insert the node into every way sharing the edge (needs approval: it edits other features) | "The line crosses an edge that another feature shares." |
| Line passes through a shared vertex (a vertex used by another way) | **do**, the other way keeps the vertex and its id | none |
| Area whose edges are shared with neighbours (not the cut edge) | **do**: the cut does not touch the neighbour; only `W` changes | none |
| Closed way that is a member of a route or other non-multipolygon relation (site, boundary, route) | **refuse** in v1. v2: replace the member by both rings in the same position (iD's `splitWayMember` logic) | "This area is a member of a relation that is not a multipolygon." |
| Closed way with `junction=roundabout` or `circular` | **refuse** (as iD's `simple_roundabout`) | "A roundabout cannot be cut." |
| Multipolygon, outer is one closed way, no inner ring | **do**: the multipolygon keeps its tags and gets two `outer` members. Not converted to two ways | none |
| Multipolygon, outer is one closed way, inner ring lies fully inside one half | **do**: the inner ring is kept in the relation and sits in the half that contains it | none |
| Multipolygon, inner ring crosses or touches the cut line | **refuse** (a hole would be cut; JOSM's rule: no crossing or shared nodes with inner members) | "The cut would cut through a hole." |
| Multipolygon, outer is made of several ways | **refuse** in v1 (JOSM needs the chord to end on outer members; multi-way outers need more work) | "The outline of this multipolygon is made of several ways." |
| Multipolygon, several outer rings | **refuse** | "This multipolygon has several outlines." |
| `building:part` (a closed way, usually not in a relation) | **do**, same as a plain area. Parts may overlap a building; the cut does not check that (later: warn) | none |
| Self-intersecting input (outline crosses itself) | **refuse** (fix first) | "The outline crosses itself. Fix it first." |
| Cut line has tags (it is a feature) | **refuse** in mode (b) only | "The line has tags." |
| Piece would be degenerate (under 3 nodes, zero area) | **refuse** | "A piece would be too small to be an area." |
| Data not downloaded, too large, or hidden connections (iD's `not_downloaded`, `too_large`, `connected_to_hidden`) | **refuse**, using the same checks as the split operation | the existing reason texts |
| Cut through several features (chord crosses a point or a line inside the area) | **do**: only the outline is changed; points and lines inside keep their place (they are not split) | none |

## 5. Proposal for Maid: a module for the parking app

Name: `packages/module-cut-area` (exports `cutOperations`, like `parkingOperations` in `packages/module-parking/src/index.ts`). Enabled by `apps/maid-parking/maid.config.ts`. Not in core: iD keeps no such tool, and the parking app is where the grid and cut cases come up (parking areas, and the parking lane outline). Confirm with Tobias before wiring it into bicycle or the default app.

- **Operation**: `cutOperation: Operation` with `id: 'cut'`, `label: 'Cut area'`, no `shortcut` in v1. `applies`: exactly one selected entity that is a closed way. `disabled` returns the first reason from the table (section 4), mapped to a sentence. `run` returns the action and the selection.
- **Entering the cut**: the operation starts a draw session in a new `cut` mode (`packages/shell`, next to `drawing.ts`), using the existing draw click and snapping. The status line says: "Draw a line across the area. Enter finishes, Escape cancels." The preview draws the chord.
- **Edit menu**: one entry "Cut area" after "Split" in the same group. Disabled entries show the tooltip sentence, as the other operations do.
- **Keyboard**: none in v1 (k-yle and 1ec5 agree a rare operation should not take a letter key; the single letters are scarce). Reachable through the menu and the command bar.
- **Texts**: all strings through Paraglide (`packages/i18n`), with the module's own `project.inlang` (see the `i18n-compile` rule). English first, then de, fr, es.
- **Tests**: unit tests in the module (section 6); `bun run check-config` must accept the module (no network request, unique ids).

## 6. Test plan

Unit tests (`bun test`, no browser, fixtures not needed):
- Intersection helper: 0, 1, 2, 3, 4 crossings; crossing through a vertex; tangent; collinear overlap; line ends on the outline; line starts inside; line entirely outside.
- Cut of a square by a diagonal: two triangles; area of the two rings sums to the original (tolerance 1e-9); both rings closed; ids (longer keeps `W`'s id); tags on both; `step_count` split.
- Concave U-shape with two crossings: two rings, no self-intersection. Concave with four crossings: refuse with the v1 reason.
- Relations: multipolygon with no inner (two outers, tags on the relation kept); inner fully in one half (moves with its half); inner crossing (refuse); route member (refuse); roundabout (refuse); multi-way outer (refuse).
- Shared edge (refuse); shared vertex (do, other way keeps vertex).
- Operation: `applies` false on a point, on two areas, on a line; each disabled reason produces its sentence; `run` returns one action; undo restores the graph exactly (compare the graph before and after).
- Property test: random convex polygons and random chords through them: pieces do not overlap, areas sum to the original, every vertex of each ring is on the original outline or the chord.

Browser check (`tools/checks/check-cut.ts`, in the table of `check-all.ts`, `--app parking`, like `check-ops`):
1. Select a building in a scene with fixtures (`small`), open the edit menu, see "Cut area" enabled.
2. Enter the cut mode, click two points across the building, Enter; expect two closed ways with the same tags, both selected, the undo label "Cut an area in two".
3. Undo: one step restores the original building (graph equal to the start).
4. Refusals: a point selected: "Cut area" not shown. A line crossing once: tooltip "The line must cross the outline twice", no change.
5. Relations scene: a multipolygon with an inner ring (find one in the `relations` fixture, not checked yet): cut across the outer, not the hole: relation has two outers and one inner; cut through the hole: refused.
Each step prints one `ok` line; the check exits non-zero on failure. Uses fixtures only, no network (core rule 1).

Gap: the `relations` fixture has multipolygons (its meta says so); whether one has a courtyard is not checked. If none exists, a person has to cut a new fixture (`bun run fixtures-build`), a reviewed change.

## 7. Open questions for Tobias

1. **Output for plain areas**: two closed ways (recommended, what a mapper expects for a split building) or iD's multipolygon of two open outers (the existing outline split)? iD says "follow iD when in doubt"; iD's own cut is not a cut, so there is no iD precedent for a real cut.
2. **Scope of v1**: exactly two crossings (recommended), or iterate chords for concave shapes now?
3. **Shared edges**: refuse (recommended), or insert the node into the neighbour too (changes another feature)?
4. **Route and other relation members**: refuse in v1 (recommended), or replace in place like iD's split?
5. **Way-only tags**: iD keeps them on the halves; Rapid and Maid drop them. Keep Maid's divergence for the cut as well?
6. **Snap distance**: metres (for example 0.3 m) or screen pixels at the current zoom? Both are used in Maid's drawing today (not checked which one snaps).
7. **Shortcut**: none in v1, or a letter after all? Which letter is free in the parking app (check `useShortcuts.ts`)?
8. **Module or core**: parking app only (recommended for v1), or also the default app?
9. **Parking use**: are parking spaces (amenity=parking polygons, or the parking lane outline) the main use case? That decides whether the cut and the grid divide (Kyle's #9020 idea, which is out of scope here) belong together.
10. **Fixtures**: may a person cut a multipolygon-with-courtyard fixture for the browser check, or is the existing `relations` fixture enough?

## Sources

- iD (pinned checkout, repo-relative): `.reference/id/modules/actions/split.ts`, `.reference/id/modules/operations/split.js`. Upstream: https://github.com/openstreetmap/iD
- Rapid 3 (pinned): `.reference/rapid/modules/actions/split.ts`. Upstream: https://github.com/bhousel/Rapid
- Maid: `packages/operations/src/operations.ts`, `packages/operations/src/types.ts`, `packages/operations/src/operations.test.ts`, `packages/model/src/actions/split.ts`, `packages/shell/src/components/MapContextMenu.tsx`, `packages/shell/src/commands.ts`, `packages/shell/src/useShortcuts.ts`, `packages/shell/src/drawing.ts`, `packages/shell/src/components/ModeButtons.tsx`, `packages/module-parking/src/index.ts`, `tools/bench/ops-check.ts`
- iD PR #9020 (k-yle, divide): https://github.com/openstreetmap/iD/pull/9020
- iD issues: #9334 https://github.com/openstreetmap/iD/issues/9334, #8374 https://github.com/openstreetmap/iD/issues/8374, #2971 https://github.com/openstreetmap/iD/issues/2971, #3769 https://github.com/openstreetmap/iD/issues/3769, #3934 https://github.com/openstreetmap/iD/issues/3934, #969 https://github.com/openstreetmap/iD/issues/969, #6988 https://github.com/openstreetmap/iD/issues/6988
- JOSM Split Way: https://josm.openstreetmap.de/wiki/Help/Action/SplitWay
- JOSM Split Object: https://josm.openstreetmap.de/wiki/Help/Action/SplitObject
- JOSM ticket 21153: https://josm.openstreetmap.de/ticket/21153
- Not relevant: JOSM ticket 18229 (Bedzin imagery layer, not splitting)
- Related Maid research: `docs/research/relations-vs-id.md`, `docs/research/drawing-tools/` (this folder)
