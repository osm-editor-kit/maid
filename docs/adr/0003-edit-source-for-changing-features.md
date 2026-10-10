# 0003: Features that are being changed live in a small edit source

Date: 2026-10-10

## Decision

Each of the sources for areas, lines and vertices has a small twin, and every layer has a twin on it. When a feature starts to change (a vertex is dragged), the renderer

1. hides the original with feature state (`editing: true`, opacity 0), which costs no re-tiling,
2. draws the changing copy from the twin source with `setData` on every step,
3. on commit writes the final feature back into the big source, then removes the feature state and empties the twin.

## Why

Any change in a big GeoJSON source makes MapLibre re-index the source and rebuild its visible tiles. Measured on the dense scene, moving one node of a road 120 times, time from the change until it is on screen:

| Approach | Median | p95 | First step | Changes per second |
| --- | ---: | ---: | ---: | ---: |
| `setData` on the big source | 599 ms | 1051 ms | | 2 |
| `updateData` on the big source | 166 to 317 ms | 232 to 563 ms | | 3 to 6 |
| Twin source, originals removed from the big source | 16.8 ms | 18.9 ms | 249 ms | 53 |
| Twin source, originals hidden by feature state | 17.4 ms | 49 ms | 53 ms | 44 |

On the medium scene the last variant runs at 60 changes per second (median 16.7 ms, first step 16 ms). Frames stayed at 16.7 ms in every variant, because the work happens in MapLibre's worker: the map never froze, the change just arrived late.

The commit at the end takes 85 ms (medium) to 550 ms (dense) in the background. The picture is correct the whole time.

## Costs and open points

- Twice the number of layers (27 become about 50). Empty layers are cheap, but this is not free; the full benchmark includes them.
- Only one run per variant so far. The numbers show the order of magnitude, not exact values.
- Not built: moving a standalone point, changes to multipolygon members, several changes at once.
- iD and Rapid were not measured on this scenario.
