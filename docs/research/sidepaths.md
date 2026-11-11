# Side paths: extract, merge and move tags (2026-11-10)

Asked by Tobias on 2026-11-10: port the side path functions of the iD fork iD-Radnetz (FixMyBerlin) to Maid, as an
optional module of the bicycle editor, and add the `sidewalk:*` tags. The case behind it is the campaign "Hegemeisterweg
Tagging-Fehler": roads with `sidewalk=separate` that still carry `sidewalk:*` attributes which belong on the separate
sidewalk.

## What iD-Radnetz does

In the fork (`modules/actions/extract_sidepath.ts`, `extract_merge_sidepaths.ts`, `merge_sidepaths.ts`,
`modules/sidepath/`, `modules/operations/extract_menu.ts`):

- **Extract a side** (WORKDOC feature 17): one "Extract …" entry with a flyout, grouped by both sides, left, right. A
  cycle track, a sidewalk, or both as one path become a new way parallel to the road (`offsetLine`, the distance from
  `sidepathOffsetMeters`: road, parking, track, sidewalk stacked), and the road's side becomes `separate`. Ctrl+E.
- **Merge** (feature 28): a cycleway and a footway side by side become one foot and cycle path. The older way keeps
  its geometry, a too long way is cut first, relation memberships move to the surviving way.
- **Extract and merge** (feature 30): both in one step, the footway found by position (`find_sidewalk.ts`). Ctrl+G.

The tag logic (which sides can be extracted, the new way's tags, the road's changes, the merged tags) is in the npm
package `@tilda-geo/bicycle-infrastructure-tagging` (FixMyBerlin, 0.2.0). The geometry is in the fork.

## What Maid has now: module `sidepaths`

`packages/module-sidepaths`, on in `apps/maid-bicycle` only. Moving the tags (below) needs no TILDA logic; extracting does.

**Tags to the separate way** ("Tags to left sidewalk", "… right sidewalk", "… both sidewalks", and the same for cycle
tracks). Offered on one selected road whose side is `separate` (`sidewalk:left`, `sidewalk:both`, plain `sidewalk`) and
that still has attributes for that side:

- The attributes of a side are `prefix:side:key`, then `prefix:both:key`, then `prefix:key`. They go to the separate
  way as plain keys (`sidewalk:both:surface=sett` → `surface=sett`). A way drawn against the road gets directions and
  sides turned (`traffic_sign:forward` → `traffic_sign:backward`, `oneway=yes` → `-1`).
- The road keeps `sidewalk:left=separate`. A shared key of a side that stays is rewritten as that side's own key.
- The separate way is found by position: a way of the kind (`footway=sidewalk`, or a footway or path with
  `is_sidepath=yes`; a cycleway that is not a crossing and has no name, or a path for bicycles with `is_sidepath=yes`),
  half of whose points lie on that side 1 to 25 m from the road, or that runs along a third of the road. Several pieces
  on one side all get the tags.
- Undo is one step. Afterwards the ways that got tags are selected.

Assumptions, written down instead of asked (Tobias to check):

1. **A value the separate way already has otherwise stays on the road** as the side's own key, and the other
   attributes move. Nothing is lost, and the mapper decides; the road stays selected so that they see what is left.
   When nothing can move at all, the entry is disabled with "The separate way on the left side already has another
   value for surface." On the medium fixture this is common (`sett` on the road, `paving_stones` on the sidewalk).
2. **Equal values are simply removed from the road.** On the medium fixture most roads are of this kind.
3. **`lane`, `lanes` and `kerb` stay on the road**: `lane`/`lanes` as TILDA's `sideTags` leaves them out
   (`cycleway:right:lane=advisory` next to a separate track on Alexanderstraße is a painted lane), `kerb` because a road
   side's kerb is mapped at crossings.
4. **Crossings, pedestrian areas and named footways are never the separate sidewalk.** Without this rule the first run
   on the medium fixture took crossings and "Mollergasse" for sidewalks.
5. **Three entries per kind** (both, left, right) instead of iD-Radnetz's flyout: Maid's edit menu has no flyout. The
   labels start with what differs ("Tags to left sidewalk"), because the menu cuts long labels.

Measured on the medium fixture (each side of each road on its own, 55 sides with `separate` and attributes): 27 only
clean the road (the sidewalk has the same value), 16 have another value on the sidewalk (it stays on the road), 12 find
no separate way (often a sidewalk mapped without `footway=sidewalk`, or across a square). The cycle track entries give
tags to a way on Alexanderstraße and Grunerstraße. All searches together take about 0.1 to 0.5 s.

Checks: `bun test packages/module-sidepaths` (16 tests), `bun run check-sidepaths medium --app bicycle` (8 ok).

## Extract, and extract and merge (2026-11-11)

Tobias approved the two `@tilda-geo` packages in `minimumReleaseAgeExcludes` on 2026-11-11 (they came in with
module-tilda). The port:

- `extract.ts`: `planSidepathExtraction` (TILDA's `planExtraction`, plus the fork's rule that a way whose bikes ride
  only against the road is drawn reversed with `oneway=yes`) and the action, with the new way on `offsetLine`.
- `merge.ts`: the fork's `merge_sidepaths.ts`: TILDA's `mergeSelection` and `combinedPathTags`, the cut of a too long
  way (Maid's `actionAddMidpoint` and `actionSplit`), memberships move to the surviving way.
- `extract-merge.ts`: one or both sides, and extract and merge in one step. The footway is found as in the fork
  (`footwaysAlong`, half of it within 7 m of the extracted track).
- `sign-rules.ts`: the traffic sign converter (`@osm-traffic-signs/converter`, German signs) as TILDA's `recommend` and
  `joinSigns`, loaded at the module's setup, as the fork's `recommender.ts`. Until it is there the entries say
  "Loading the traffic sign rules…".
- Edit menu entries instead of the fork's flyout: "Extract both cycle tracks", "Extract left cycle track", the same for
  sidewalks and for "… as one path", and "Extract + merge both|left|right". Only the ones the road offers show.

Differences to the fork, decided here:

1. **A plan is tried on a copy of the graph first.** When a step fails (no footway beside the track, lengths too
   different, different values), the entry is disabled with the reason and nothing changes. The fork keeps a half done
   extraction and says so in a flash; Maid has no flash, so it refuses as a whole.
2. **No flash with the changed road tags or the dropped tags.** The undo step and the selection show the result.
3. **No preview on hover** (the engine's preview only draws selected ways that moved).

Measured on the fixtures with the sign rules: medium 242 sidewalk extractions and 11 extract-and-merges work, 5 merges
are refused for different lengths; dense 81 and 3, 1 refused. No case throws. Spandauer Straße (w4773465): the track's
`surface:colour=red`, `width=1` and `segregated=yes` end up on the merged path as `cycleway:surface:colour`,
`cycleway:width`, and the existing sidewalk keeps its geometry.

Checks: `bun test packages/module-sidepaths` (19 tests), `bun run check-sidepaths medium --app bicycle` (15 ok,
screenshots `reports/sidepaths-menu.png` and `reports/sidepaths-extract.png`).

## Open steps

- The campaign's examples, once Tobias sends the link: run the entries on them and tune the search (distance, kinds).
- Many entries on a road with tracks and sidewalks on both sides (up to 12). A flyout in the edit menu (an extension
  point for grouped operations) would bring back the fork's "Extract …" menu.
- Merging two selected ways (a cycleway and a footway) as an entry of its own (feature 28 alone).
- A preview of the new way when an entry is hovered.
