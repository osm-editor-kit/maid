# 0008: New and changed data go to a small live tier

Date: 2026-10-10. Extends [0003](0003-edit-source-for-changing-features.md).

## Decision

Every source (areas, lines, points, vertices) has a small twin, and every layer has a twin on it. The twins are the **live tier**:

- Data that arrives after the first view is complete goes into the live tier, not into the big sources.
- A feature that changes (dragged vertex, edited tag) gets its new copy in the live tier. Its original in the big source is hidden through feature state.
- Two seconds after the last activity, and only when the picture is final, the live tier is merged into the big sources in the background (**compaction**). The live copies are removed when the big sources have finished rebuilding, so nothing flickers.

The first view still goes straight into the big sources, because there is nothing to protect yet.

## Why

Every update of a GeoJSON source makes MapLibre re-tile the whole source and rebuild its visible tiles. With all data in four big sources, a strip of new data at the edge of the view cost as much as loading everything again. That was Maid's one consistent weakness against iD and Rapid: the time until the picture is final when new data arrives.

Measured with `bun tools/bench/quick-pan.ts maid dense`, five runs each, median (range), on a machine under other load:

| Variant | Final picture after panning into new data |
| --- | ---: |
| One worker, everything in the big sources | 1520 ms (1488 to 1587) |
| Four workers ([0007](0007-workers-and-batched-updates.md)) | 792 ms (737 to 1602) |
| Four workers and the live tier | 428 ms (378 to 572) |

The first wheel zoom out of a run, which pulls in new data around the view, went from 3 to 5 s to about 1.1 s in a single measurement.

Dragging a vertex through the live tier (`bun tools/bench/edit.ts dense`, one run): change on screen after 16.7 ms median, 19.9 ms p95, first step 33 ms, 59 changes per second. With the earlier edit source it was 17.4 ms, 49 ms, 53 ms and 44.

A jump to a place with no data loaded (medium scene) settled after 730 ms with 968 lines, 818 areas, 2529 points and 4206 vertices in the live tier. After compaction the big sources held the same totals and the same number of lines was on screen.

## Costs

- Twice the number of layers, now including the symbol layers (pins, labels, arrows). Layers on an empty source cost little, but this is not free.
- Compaction is the old full re-tile, moved to a moment when nobody waits for it. If the mapper acts during compaction, that action shares the worker with it.
- A feature can exist twice for a moment at the end of compaction (in both tiers). With translucent fills that could show as a brief darker patch; not observed in the checks, not ruled out.
- More state to keep right: which tier holds a feature, which originals are hidden. Covered by one manual consistency check, not by tests yet.

## Open

- The two seconds and the "picture is final" condition are first guesses.
- Long sessions: the big sources still grow without limit. Dropping data that is far from the view is a separate topic.
- Unit tests for the tier bookkeeping.
