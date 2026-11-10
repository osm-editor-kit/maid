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

`packages/module-sidepaths`, on in `apps/maid-bicycle` only. It does not need the TILDA package.

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

## Open steps

- **Extract** and **extract and merge** as in iD-Radnetz. They need `@tilda-geo/bicycle-infrastructure-tagging`
  0.2.0, which `bunfig.toml`'s five-day release age blocks until 2026-11-15, unless Tobias adds the two `@tilda-geo`
  packages to `minimumReleaseAgeExcludes` (asked on 2026-11-10). The plan: `planExtraction` for the tags,
  `offsetLine` (already in `geometry.ts`) for the new way, `mergeSelection`/`combinedPathTags` and a port of the cut
  and membership logic of `merge_sidepaths.ts` on Maid's `actionSplit` and `actionAddMidpoint`. The traffic sign
  recommender of the fork (`loadSignRecommender`) has no counterpart in Maid yet; without it the package reads no signs.
- A preview of the new way when the entry is hovered: the engine's operation preview only draws selected ways that
  moved.
- The campaign's examples, once Tobias sends the link: run the entries on them and tune the search (distance, kinds).
