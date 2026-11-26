# Direction markers

Standalone SVGs of the markers Maid draws for the direction of a line, for the one-way options of the TILDA checklist and for projects that take them over as they are. White with a dark outline (`#1c1c1c`), fixed colours, no CSS variables, square `viewBox` of 16 units (one unit is one px of the map's marker), `<title>` inside.

Every file points to the right (east). **Left to right is the way's drawing direction**: draw the way from its first node to its last node, then read the marker against it.

| File | Meaning |
| --- | --- |
| `forward.svg` | One way along the drawing direction (`oneway=yes`): an arrow with the line. |
| `both.svg` | Both directions (for example `oneway=alternating`, `oneway=reversible`, or a road side tagged two-way): a double arrow. |
| `reversed.svg` | One way against the drawing direction (`oneway=-1`): the hook, a stroke along the line that turns back with its arrowhead pointing against the line ("drawn this way, ridden that way"). It turns up, to the left of the drawing direction. See ADR 0015. |
| `drawn.svg` | The drawing direction itself: the thin white arrow Maid puts on the selected way. Turn it to the way's bearing to show which way a way is drawn. |

Do not edit the files. They are generated from `src/direction-svg.ts` by `bun run direction-svgs`, and a test (`src/direction-svg.test.ts`) fails when a file differs from the generator.
