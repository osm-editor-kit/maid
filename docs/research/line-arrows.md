# Arrows on lines: drawing direction and riding direction

Design proposal for Tobias, worked out with him on 2026-11-26 and 2026-11-27. No code has changed. Sketches of every
case in every state, on map and imagery: **https://claude.ai/artifact/RKGn9wBkgduyGvmVaGswJV** (private until shared).

Started because users found the hook for `oneway=-1` (ADR 0015) unnatural.

## Concept

- **Two parts, one glyph per anchor.** A solid chevron is the riding direction, a solid triangle the drawing direction
  of the line. They are combined into one image per anchor, so nothing collides on the line.
- **Chevrons for every line, not only oneways**: one chevron (with the line), one chevron back (`-1`), a chevron each
  way (two-way), `><` overlapping (reversible, alternating). The triangle sits in the chevron's notch, or tip to tip
  against it for `-1`.
- **`-1` does not turn the sides**: `:left`, `:right`, `:forward`, `:backward` follow the drawing direction (wiki,
  [reverse-side-keys.md](reverse-side-keys.md)). So the triangle never turns; only the chevron does.
- **Road sides** drawn beside the centerline (lanes, tracks in the bicycle lens) get chevrons only, no triangle: their
  line direction is always the centerline's. The left lane of a two-way road points left (default
  `cycleway:left:oneway=-1`).
- **Colour says who**: black for all traffic, blue for bicycles only (`oneway:bicycle`, only off `highway=cycleway`;
  contraflow is a black chevron and a blue one back), amber for an untagged oneway on tracks and separate ways
  (bicycle lens; an amber dot). All glyphs solid, 8 px grid, thin white edge for imagery.
- **When shown**: oneways always (from OSM 16, every 48 px). Two-way: in the standard style on hover and selection,
  in line-focused styles (bicycle lens) always, every 96 px. Roads with a default oneway (roundabout, motorway) always
  show their state, so `oneway=no` there shows the two-way glyph.
- **Size follows the line**: inside the white fill on roads (fill minus 2 px), a small fixed size over thin lines.
- `oneway=-1` and `oneway:bicycle=-1` are usually lines drawn the wrong way; Reverse (V) fixes them (ADR 0015
  addendum).

Code to change (details on the page): `renderer/src/direction.ts`, `direction-images.ts`, `layers.ts`, `build.ts`,
`selection-shape.ts`, `engine.ts`, the bicycle lens, `direction-svg.ts` and `assets/direction/*.svg`, their tests and
checks, and a new ADR that replaces the hook part of ADR 0015.

## Open

Nothing for the glyphs. Possible follow-ups: a stronger hover and selection glow in the bicycle lens, where the side
lines cover it; a validation hint that offers Reverse for `-1` ways.
