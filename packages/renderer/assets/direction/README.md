# Direction glyphs

Standalone SVGs of the glyphs Maid draws for the riding direction and the drawing direction of a line (ADR 0017,
[docs/design/line-arrows.md](../../../../docs/design/line-arrows.md)): for the one-way options of the TILDA checklist,
for the docs, and for projects that take them over as they are. Solid parts with a thin edge in the opposite tone,
fixed colours, no CSS variables, a square `viewBox` of 24 units (one unit is one px of the map's glyph at its large
size), `<title>` inside.

Every file points to the right (east). **Left to right is the way's drawing direction**: draw the way from its first
node to its last node, then read the glyph against it.

- A **chevron** is the riding direction: which way traffic may use the line.
- The **triangle** is the drawing direction. `<kind>.svg` has it (hover and selection on the map), `<kind>-rest.svg`
  does not (the map at rest).
- **Colour** says who: ink for all traffic, blue for bicycles only, amber where the riding direction should be tagged
  and is not.

| File | Meaning |
| --- | --- |
| `with` | One way, along the drawing direction (`oneway=yes`, a roundabout) |
| `against` | One way, against the drawing direction (`oneway=-1`) |
| `both` | Both directions (a two-way road; `oneway=no` where a oneway is the default) |
| `reversible` | Both directions, one at a time (`oneway=reversible`, `alternating`) |
| `contraflow` | One way along the line, bicycles both ways (`oneway=yes` + `oneway:bicycle=no`) |
| `contraflow-against` | One way against the line, bicycles both ways (`oneway=-1` + `oneway:bicycle=no`) |
| `bike-with` | One way for bicycles, along the line (`oneway:bicycle=yes` off a cycleway) |
| `bike-against` | One way for bicycles, against the line (`oneway:bicycle=-1` off a cycleway) |
| `missing` | The riding direction should be tagged and is not (a track or path in the bicycle lens) |
| `drawn` | The drawing direction alone (an open line no one travels, a fence) |

Do not edit the files. They are generated from `src/direction-svg.ts` by `bun run direction-svgs`, and a test
(`src/direction-svg.test.ts`) fails when a file differs from the generator.
