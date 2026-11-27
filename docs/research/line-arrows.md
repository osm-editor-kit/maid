# Arrows on lines: drawing direction and oneway

Design proposal for Tobias to decide on. v1 2026-11-26, v2 2026-11-27 after his comments. No code has changed.
Sketches of every case in every state, on map and imagery, with the answers to the comments:
**https://claude.ai/artifact/RKGn9wBkgduyGvmVaGswJV** (private until shared).

Asked for by Tobias: users find the hook for `oneway=-1` (ADR 0015) unnatural. The drawing-direction arrow should come
closer to iD but be easier to see; oneways keep their own glyph; both should show together.

## What exists

- iD (`.reference/id` at `0194f3926`): one marker, `svg/defs.ts` `ideditor-oneway-marker-*`, 12 x 6 px, `#333`
  (white, `#eee` on dark and rail lines, `svg/lines.js` `onewayArrowColour`), every 36 px from zoom 16, mirrored for
  `isOneWayBackwards`, doubled for `isBiDirectional`. `oneway=no` cancels every implied oneway (`osm/way.ts`
  `isOneWay`). iD never shows the drawing direction. Maid copies iD's implied list in `renderer/src/direction.ts`.
- Maid: `renderer/src/direction.ts` and `direction-images.ts` draw iD's arrow, the hook for `-1`, and a white outlined
  arrow on a selected highway without oneway. The bicycle lens draws white arrows and hooks as line patterns.
- The TILDA package does not read `cycleway=opposite*`; that is lane tagging, not a centerline property.

## Proposal (v2)

- **One combined glyph per anchor**, so drawing direction and oneway never compete for a place on the line. Oneway
  with the line: two chevrons (they also give the drawing direction). Against the line (`-1`): chevrons back plus a
  small drawing tick in front, visible at rest. No oneway: the tick alone. Reversible: heads outward with a bar.
- **All glyphs solid**, a thin white edge for imagery. Colour says who: black for all traffic, blue for bicycles only
  (contraflow counter-chevron, `oneway=no` + `oneway:bicycle=yes` on shared paths), amber for a missing oneway tag
  (bicycle lens only).
- **Two sizes**: roads 100 %, paths, footways, cycleways and the bicycle lens lines 72 % (`icon-size`).
- **Rest state per style**: the standard style shows drawing ticks only on hover and selection; line-focused styles
  (the bicycle lens) show a few at rest, every 72 px. Ticks on every open line, waterways included.
- **Bicycle lens**: the same glyphs as line patterns. Lanes are drawn as oneway also when TILDA only assumes it
  (`implicit_yes`). Tracks and separate ways need the tag: tagged oneway gives chevrons, tagged two-way a double-headed
  glyph, untagged (`implicit_yes`, `assumed_no`) the amber tick.
- Out of scope: `oneway:bus`, `oneway:psv`, `oneway:foot`. Maid may deviate from iD where its glyphs are clearer.

Code to change (details on the page): `direction.ts`, `direction-images.ts`, `layers.ts` (`icon-size`, a new
`line-direction` layer behind a style option, pair images on the highlight), `build.ts` (`ow`, `sm`),
`selection-shape.ts` and `engine.ts`, the bicycle lens (`ridingDirection` with "tagged or not", patterns),
`direction-svg.ts` and `assets/direction/*.svg`, their tests and `check-bike-style`, and a new ADR that replaces the
hook part of ADR 0015.

## Open questions for Tobias

1. Drawing ticks on hover too, or on selection only?
2. `oneway=no` on a roundabout or motorway: only the ticks of a plain line, or a two-way glyph?
3. Blue for bicycles in every app, or only in Maid Bicycle?
4. Amber for a missing oneway on tracks: a good signal, or too close to a validation warning?

## Follow-up

The hover and selection glow is too faint in the bicycle lens, where the side lines cover it.
