# 0017: One glyph per anchor for the riding direction and the drawing direction of a line

Date: 2026-11-27. Asked for by Tobias; worked out in two comment rounds on the design page
([docs/design/line-arrows.md](../design/line-arrows.md), [research note](../research/line-arrows.md)). Replaces the hook
of [ADR 0015](0015-oneway-minus-one-hook-arrows.md).

## Context

Users found the hook for `oneway=-1` (ADR 0015) unnatural. Maid also drew the selected way's drawing direction as a
second set of arrows, separate from iD's oneway arrows, so two symbols competed for the same places on a line and a
two-way line said nothing about how it may be used.

## Decision

- **Two parts.** A solid chevron is the riding direction; a solid triangle is the drawing direction of the OSM way.
  `-1` turns the chevron, never the triangle: `:left`, `:right`, `:forward` and `:backward` follow the drawing
  direction (ADR 0015 "Left and right do not flip", the wiki).
- **One image per anchor.** The parts are combined into one glyph (`packages/renderer/src/glyph.ts`), so nothing collides.
  One spacing rule: 2 px between parts; a triangle in the notch of a chevron that points the same way, 3.6 px from it.
  All parts 8 px high.
- **Chevrons for every line.** One way, against, two-way (a chevron each way), reversible (`> <`). Colour says who:
  ink for all traffic, blue for bicycles only (`oneway:bicycle`, counted off `highway=cycleway` only), amber where a
  track or a way of its own should say how it is ridden and does not (bicycle lens).
- **States.** At rest only the chevrons, on lines with a oneway (tagged or implied) and on roads whose default oneway is
  cancelled (`oneway=no` on a roundabout or motorway shows two-way). A line-focused app (`lineFocus`, Maid Bicycle)
  shows two-way lines at rest too. Hover and selection add the triangle, on every open line.
- **Size follows the line**: inside a road's fill, a small fixed size over thin lines.
- **The bicycle lens** uses the same glyphs as line patterns. Road sides never get the triangle. TILDA's guesses count
  only where safe: a painted lane follows the traffic beside it (the left lane of a two-way road against the line), a
  bicycle road is two-way; an untagged track or way of its own is "not tagged".
- `cycleway=opposite*` is lane tagging and gives no glyph on the centerline. `oneway:bus`, `oneway:psv` and
  `oneway:foot` are out of scope.
- A deliberate deviation from iD in every app: iD mirrors its arrow for `-1` and shows no drawing direction.

## Consequences

- Code: `glyph.ts` (geometry), `direction.ts` (`ridingOf`, image ids), `direction-images.ts`, `layers.ts`
  (`line-oneway`, `line-two-way`, `highlight-direction`), `build.ts` (`ow`, `tr`, `lt`, `ao`), `selection-shape.ts` and
  `engine.ts` (the hovered and selected way's active glyph), the bicycle lens (`ridingDirection`, patterns),
  `direction-svg.ts` and `assets/direction/*.svg` (UI icons, docs). The hook and its images are gone.
- The sketches of the design page are generated from `glyph.ts` (`bun run docs-line-arrows`), tests keep them in step.
- Fields must say what the map says. Checked on 2026-11-27: the oneway field shows "Assumed to be Yes" for an implied
  oneway; the TILDA checklist shows an untagged lane or track oneway as not tagged with its default, and a way's own as a
  guess. A sidewalk where bicycles may ride was two-way on the map and a guess in the checklist; the map now says "not
  tagged" too.
