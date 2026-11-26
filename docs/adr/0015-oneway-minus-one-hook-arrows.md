# 0015: oneway=-1 gets a hook arrow, the bicycle lines get their riding direction

Date: 2026-11-22. Asked for by Tobias in the project thread "Make oneway=-1 visible on bike lines".

## Context

A way tagged `oneway=-1` is drawn in one direction and driven in the other. iD mirrors its one-way arrow, so the map
shows an arrow that cannot be told from the arrow of a way drawn the other way round with `oneway=yes`. The selected
way's white direction arrows (Maid only) then point against the one-way arrows without saying why. In Maid Bicycle the
blue lines of the bicycle infrastructure (TILDA's parts: the way itself and its road sides) had no direction at all,
although TILDA derives one for every road side: on a two-way road the left side runs against the line, on a one-way
road both sides run with the road, a contraflow lane against it, and `oneway=-1` turns all of that round.

tilda-geo turns the line of a `-1` way round when it publishes it. An editor cannot: the line is the data.

## Decision

- **A hook for "against the line".** A line whose traffic runs against its drawing direction gets a hook instead of
  a mirrored arrow: a stroke along the line in its drawing direction that turns back, with the arrowhead pointing
  against the line ("drawn this way, driven that way"). This is a deviation from iD for every app
  (`renderer/src/direction.ts` `reversed`, the images in `direction-images.ts`). `backward` stays as an image.
- **The bicycle lines carry their riding direction** (`module-bike-infrastructure` `features.ts` `ridingDirection`, the
  `-arrows` layers in `layers.ts`): from zoom 17 (OSM), white arrows with a dark outline on the blue and pink lines.
  An arrow where bicycles ride with the line, the hook where they ride against it, a double arrow where a road side is
  tagged two-way. The hook of a road side turns away from the road. The arrows are line patterns of the renderer
  (`maid-line-arrow-*`), because a pattern follows the layer's `line-offset` and a symbol does not.
- **The direction comes from TILDA, not from a list in Maid.** A road side uses TILDA's `oneway` (one direction or
  not) and `_lineReversed` (against the line), which is the port of tilda-geo's `line_direction.lua`. Since
  `@tilda-geo/bicycle-infrastructure` 0.6.0 (2026-11-25) the way itself has `_lineReversed` too (`oneway=-1` or
  `oneway:bicycle=-1`), so Maid reads no tag of its own for the direction.
  TILDA's guessed one-way (`implicit_yes`) gives no arrows on a way of its own: its drawing direction says nothing.
- **Left and right do not flip.** `:left`, `:right`, `:forward` and `:backward` always follow the drawing direction,
  with `oneway=-1` too (OSM wiki, "Forward & backward, left & right"). The fields and the side overlay on hover stay as
  they are; on a way with `oneway=-1` the directional fields add a line that says so, and the one-way check reads
  "Yes, against line (-1)".

## Consequences

- Test cases: the third column of the made-up scene `bicycle` (`DIRECTIONS` in `tools/fixtures/bicycle.ts`, each with
  the riding direction it must show), checked and photographed by `bun run check-bike-style bicycle --app bicycle`
  (`reports/bike-style/direction-*.png`).
- The bicycle arrows are on top of the line, so on a cycleway with `oneway=-1` the renderer's hook peeks out from under
  the blue line. Accepted: both say the same.

## Addendum 2026-11-26: Reverse turns `-1` into `yes`

Asked for by Tobias. The edit menu's Reverse (V) turns a `-1` of a oneway key (`oneway`, `oneway:bicycle`,
`cycleway:right:oneway`, …) into `yes` after it turned the line: the riding direction on the ground stays, and the `-1`
is gone, which is what Reverse is mostly used for. `yes` stays `yes`, as in iD, because Reverse of a `yes` way fixes a way
drawn the wrong way round. iD keeps `-1` (its V does not touch oneway; only its join turns `-1` round). The tag box
beside the menu and the confirm on touch show the change. Code: `reverseAction` in `packages/operations/src/operations.ts`.
Task files get the same through their `reverse` operation.

