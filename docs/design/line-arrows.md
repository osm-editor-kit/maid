# Arrows on lines

How Maid draws which way a line may be used and which way it is drawn. Worked out with Tobias on 2026-11-26 and
2026-11-27 (the comment rounds of the design page, [research note](../research/line-arrows.md)); the decision is
[ADR 0017](../adr/0017-line-direction-glyphs.md). The sketches below are generated from the renderer's own geometry
(`bun run docs-line-arrows`), so they show what the map draws.

## Definitions

**Riding direction · chevron.** Which way traffic may use the line, as the tags say: `oneway`, `oneway:bicycle` off a
cycleway, the tags that imply a oneway (iD's list: roundabouts, motorways, rivers), and in the bicycle lens TILDA's
riding direction of a road side. One chevron: this way only. One chevron back: against the drawing direction
(`oneway=-1`). A chevron each way: both ways. Two chevrons pointing at each other (`> <`): both ways, one at a time
(`oneway=reversible`, `alternating`). This is what a map reader needs, so it is what shows at rest.

**Drawing direction · triangle.** The order of the nodes in the OSM way. It is editing information: `:left`, `:right`,
`:forward`, `:backward` and `-1` are read against it, and `-1` does not turn it (wiki, [reverse-side-keys.md](../research/reverse-side-keys.md)).
It shows on hover and selection only, combined with the chevrons into one image. A road side drawn beside its
centerline never gets it: its drawing direction is the centerline's.

**Colour · who.** Ink: all traffic. Blue: bicycles only (`oneway:bicycle` off `highway=cycleway`; the bicycles' way back
on a contraflow road). Amber: the riding direction should be tagged and is not (tracks and ways of their own, bicycle
lens only). Every part is solid, on an 8 px grid, with a thin edge in the opposite tone so it reads on a road fill and on
imagery. Where iD draws its arrows white (dark lines, rail, pedestrian streets) the glyph is white with a dark edge.

**States.** Normal: chevrons on lines with a oneway (tagged or implied) and on roads whose default oneway is cancelled.
Normal in a line-focused editor (the app's `lineFocus`, Maid Bicycle): every line traffic uses shows its riding
direction, two-way ones too, every 96 px. Hover and selected: chevrons with the triangle on every open line; a line no
one travels (a fence) shows the triangle alone.

## The glyphs

At rest (left) and on hover and selection (right). The SVG files are in
[packages/renderer/assets/direction](../../packages/renderer/assets/direction/README.md).

| Glyph | At rest | Hover, selected | Tags |
| --- | --- | --- | --- |
| One way | ![](../../packages/renderer/assets/direction/with-rest.svg) | ![](../../packages/renderer/assets/direction/with.svg) | `oneway=yes`; `junction=roundabout`; `highway=motorway`; a lane (TILDA `implicit_yes`) |
| One way, against the line | ![](../../packages/renderer/assets/direction/against-rest.svg) | ![](../../packages/renderer/assets/direction/against.svg) | `oneway=-1` |
| Two-way | ![](../../packages/renderer/assets/direction/both-rest.svg) | ![](../../packages/renderer/assets/direction/both.svg) | no oneway (hover, selection, line focus); `junction=roundabout` + `oneway=no`; `highway=motorway` + `oneway=no`; `highway=cycleway` + `oneway=no` |
| Reversible | ![](../../packages/renderer/assets/direction/reversible-rest.svg) | ![](../../packages/renderer/assets/direction/reversible.svg) | `oneway=reversible`; `oneway=alternating`; `conveying=reversible` |
| One way, bicycles both ways | ![](../../packages/renderer/assets/direction/contraflow-rest.svg) | ![](../../packages/renderer/assets/direction/contraflow.svg) | `oneway=yes` + `oneway:bicycle=no` |
| Same, against the line | ![](../../packages/renderer/assets/direction/contraflow-against-rest.svg) | ![](../../packages/renderer/assets/direction/contraflow-against.svg) | `oneway=-1` + `oneway:bicycle=no` |
| One way for bicycles | ![](../../packages/renderer/assets/direction/bike-with-rest.svg) | ![](../../packages/renderer/assets/direction/bike-with.svg) | `highway=path` + `oneway:bicycle=yes`; `highway=footway` + `oneway:bicycle=yes` |
| Same, against the line | ![](../../packages/renderer/assets/direction/bike-against-rest.svg) | ![](../../packages/renderer/assets/direction/bike-against.svg) | `highway=path` + `oneway:bicycle=-1` |
| Oneway not tagged | ![](../../packages/renderer/assets/direction/missing-rest.svg) | ![](../../packages/renderer/assets/direction/missing.svg) | bicycle lens: `highway=cycleway` without `oneway`; `cycleway:*=track` without `:oneway` |
| Drawing direction alone | | ![](../../packages/renderer/assets/direction/drawn.svg) | an open line no one travels (a fence) |

`oneway=-1` and `oneway:bicycle=-1` are usually lines drawn the wrong way round: Reverse (V) turns the line and makes
the tag `yes` ([ADR 0015](../adr/0015-oneway-minus-one-hook-arrows.md), addendum).

**Spacing.** All parts are 8 px high. Between two parts there are 2 px, edge to edge along the line; a triangle before a
chevron that points the same way sits in its notch, 3.6 px from it, so the white edges do not touch. Reversible `> <`
and two-way `< >` keep the same gap.

## Every case

Every way is drawn from left to right. Sketches at 1.5 times map px.

**Two-way road.** Nothing at rest in the standard style, as in iD. Line focus: the two-way glyph at rest.

![Two-way road](line-arrows/two-way.svg)

**Oneway along the line** (`oneway=yes`, a roundabout, a motorway).

![Oneway](line-arrows/oneway.svg)

**Oneway against the line** (`oneway=-1`). At rest it looks like a oneway drawn the other way, as in iD; hover and
selection show "drawn this way, driven that way".

![Oneway against the line](line-arrows/oneway-against.svg)

**Reversible, alternating.**

![Reversible](line-arrows/reversible.svg)

**Implied oneway cancelled** (`junction=roundabout` + `oneway=no`, `highway=motorway` + `oneway=no`): the two-way glyph,
so nobody has to know the default.

![Implied oneway cancelled](line-arrows/oneway-cancelled.svg)

**Contraflow for bicycles** (`oneway=yes` + `oneway:bicycle=no`). `cycleway=opposite*` is lane tagging, not a property of
the centerline, and gives no glyph here.

![Contraflow](line-arrows/contraflow.svg)

**Footway or path, oneway**: the small size, over the thin line.

![Footway oneway](line-arrows/footway-oneway.svg)

**Shared path, oneway for bicycles** (`highway=path` + `oneway=no` + `oneway:bicycle=yes`).

![Bicycles only](line-arrows/bike-only.svg)

**Cycleway, oneway**: on a cycleway `oneway` is the cyclists' own, so the glyph is ink.

![Cycleway oneway](line-arrows/cycleway-oneway.svg)

## The bicycle lens (Maid Bicycle)

The blue lines are TILDA's parts: the way and its road sides. They carry the rest glyphs as line patterns, small. The
road sides never get the triangle; the way gets it from the renderer on hover and selection.

**Two-way road with bike lanes** (`cycleway:both=lane`): the left lane rides against the line, the default of
`cycleway:left:oneway` (`-1`), assumed and not mapped.

![Lanes](line-arrows/lens-lanes.svg)

**Oneway road with a contraflow lane** (`oneway=yes` + `oneway:bicycle=no` + `cycleway:left=lane` +
`cycleway:left:oneway=-1`).

![Contraflow lane](line-arrows/lens-contraflow-lane.svg)

**Tracks, one without its oneway** (`cycleway:right=track` + `cycleway:right:oneway=yes` + `cycleway:left=track`): a
track should say how it is ridden; TILDA's guess is not drawn as a fact.

![Tracks](line-arrows/lens-tracks.svg)

**Cycleway of its own**: two-way when tagged (`oneway=no`), not tagged (no `oneway`), against the line (`oneway=-1`).

![Two-way cycleway](line-arrows/lens-way-two-way.svg)

![Cycleway, oneway not tagged](line-arrows/lens-way-missing.svg)

![Cycleway against the line](line-arrows/lens-way-against.svg)

| Part | TILDA `oneway` | Glyph |
| --- | --- | --- |
| Lane (road side) | `yes`, `implicit_yes` | with or against, by `_lineReversed` |
| Any part | `no`, `car_not_bike` | two-way |
| Bicycle road (the way) | `assumed_no` | two-way |
| Track, way of its own | `yes` | with or against |
| Track, way of its own | `implicit_yes`, `assumed_no` | not tagged (amber) |

The fields say the same: the oneway field shows "Assumed to be Yes" for an implied oneway, and the TILDA checklist shows
an untagged lane or track oneway as not tagged with its default, and a way's own as a guess.

## How the style does it

- `build.ts` gives each line `ow` (the glyph kind, `ridingOf`), `tr` (traffic uses it), `lt` (light glyph) and, under a
  dimming lens, `ao` (the glyph's opacity).
- `line-oneway`: the rest glyph of `ow`, every 48 px from OSM 16, its size following the line (inside the road fill,
  the fill minus 2 px; 5.2 px over a thinner line). Hidden through feature state on the hovered and selected way.
- `line-two-way`: the two-way rest glyph on travelled lines without `ow`, every 96 px, in a line-focused editor only.
- `highlight-direction`: the active glyph of the hovered and the selected ways (`selection-shape.ts` `directionFeature`).
- The bicycle lens: `line-pattern` images `maid-line-glyph-<with|against|both|missing>` (`features.ts`
  `ridingDirection`).
- Images are drawn in code from `glyph.ts` (`direction-images.ts`); one image per kind, state and tone, built ahead.
