# 0007: Four MapLibre workers, and tiles that arrive together go in as one update

Date: 2026-10-10

## Decision

- Maid starts MapLibre with four workers (`setWorkerCount(4)`; `?workers=N` overrides).
- Features from tiles that arrive within 150 ms of each other are sent to MapLibre as one update per source (`?coalesce=0` switches it off).

## Why

A trace of what Maid waits for after a pan into new data on the dense scene showed all four sources busy at once, each going through two update cycles, and the picture final about a second after the last tile arrived. Two causes:

1. **MapLibre uses one worker thread unless told otherwise** (outside Safari). Every source has its own tiler, but they all run on that one thread, together with the work of turning tiles into drawable buckets. Maid's four sources queue behind each other.
2. **Every update re-tiles its whole source.** A view needs about twelve OSM tiles, which arrive in a burst. The first arrival started an update, the rest waited for it and then caused a second one.

Measured with `bun tools/bench/quick-pan.ts maid dense`, five runs per variant, alternating, medians (range). The machine was under other load during these runs, so the ranges are wide.

| Variant | Load until complete | Final picture after panning into new data |
| --- | ---: | ---: |
| One worker, no batching | 2249 ms (1954 to 2486) | 1520 ms (1488 to 1587) |
| One worker, batching | 2029 ms (1958 to 2962) | 2078 ms (1647 to 3055) |
| Four workers, batching | 1818 ms (1678 to 2122) | 792 ms (737 to 1602) |

In an earlier pair of five runs without batching, four workers against one gave 1062 ms against 1760 ms after the pan, and no gain on load (2627 ms against 2336 ms).

Batching alone did not help, and may have hurt the pan case. The gain comes from the workers; batching is kept because it removes update cycles and cost nothing in the combined variant. A 300 ms window was not better than 150 ms.

## Where a load's time goes now

Dense scene, three runs: the page is ready after about 230 ms, all twelve tile responses are in by about 450 ms, and Maid's own work on them (parse, merge, build features) is about 160 ms in total. The picture is final after 1.4 to 2.0 s. So roughly a second is MapLibre: tiling, building buckets for 47 layers, placing symbols, and the 150 ms label fade.

## Not settled

- Four is a guess for an eight-to-ten-core machine. Fewer cores may want fewer.
- Whether more workers slow the start (each loads MapLibre's worker script) could not be told apart from noise.
- The remaining second per load is the next thing to look at: fewer layers per source, or sources split by area so that new data does not re-tile old data.
