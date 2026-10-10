# Iteration 1: can Maid render OSM data with MapLibre?

Date: 2026-10-10. Run on one machine (Apple M4, Chrome 154 headless with GPU, 1600×1000 at 2x). Full tables and all screenshots: `reports/2026-10-10-12-34-main/report.html` (generated, not in git; rebuild with `bun run bench` and `bun run bench-report`).

## Answer

**Yes, this is a feasible path.** In this test MapLibre drew the same OSM data in iD's look and stayed at 60 frames per second on every scene and scenario, where iD and Rapid dropped to 20 to 40 while panning the two larger scenes.

The answer has three limits you should weigh:

1. **Maid does much less than the other two.** It is a renderer with hover and select. iD and Rapid also run validation, presets and an inspector. The frame-rate gap is large enough that I do not expect this to turn the result around, but it was not measured.
2. **Maid is slower than Rapid at reaching the final picture after a zoom**: 0.4 to 1.5 s against 0.1 to 0.3 s. The map stays smooth and correct in geometry meanwhile. Part of the wait is cosmetic (a 150 ms label fade and camera easing), part is tiles being cut for a new zoom level.
3. **The thresholds from the plan are not all met as written.** "Better than iD on every scenario" fails on two measurements (below). You never confirmed the thresholds; I would not treat the two misses as blockers.

## Look

The same view of the medium scene (Mitte, Hackescher Markt) after loading. Same camera, same data, no background.

| Maid (MapLibre) | iD 2.42.2 (SVG) | Rapid 3 (PixiJS) |
| --- | --- | --- |
| ![Maid](img/medium-load-maid.jpg) | ![iD](img/medium-load-id.jpg) | ![Rapid](img/medium-load-rapid.jpg) |

Two levels closer:

| Maid | iD | Rapid |
| --- | --- | --- |
| ![Maid](img/medium-zoom-maid.jpg) | ![iD](img/medium-zoom-id.jpg) | ![Rapid](img/medium-zoom-rapid.jpg) |

What the pictures show:

- **Lines and areas match iD.** Colours, widths, casings, dashes and the low-zoom widths are not copied by hand: Maid generates them from iD's own stylesheets (713 rules) and presets. See [ADR 0001](../adr/0001-style-from-id-css.md).
- **iD shows much less by default.** In the medium scene it hides 622 buildings, 3274 points and 417 address points ("4,328 hidden features"), because it cannot draw them fast enough. Maid and Rapid draw them. With hiding switched off iD looks like this: [medium-load-id-no-auto-hide.jpg](img/medium-load-id-no-auto-hide.jpg).
- **Points need a density rule in any editor.** Rapid draws every pin and the map disappears under them. Maid draws every point as a dot and adds pins where they fit ([ADR 0004](../adr/0004-points-as-dots-plus-pins-that-fit.md)). That is a design choice of mine, not iD's look.

Core subset, item by item:

| Item | State in Maid | Gap |
| --- | --- | --- |
| Roads: casing, stroke, zoom bands | Comparable | Stacking uses three bands (below, ground, above), iD has one per `layer` value |
| Paths, tracks, dashes | Comparable | |
| Bridges and tunnels | Comparable in colour and dash | Same stacking limit |
| Buildings, landuse, water: outline | Comparable | |
| Partial fill (iD's default) | Close | Built as an inward-offset line whose width is capped by the area's size. It cannot be clipped to the area, so very irregular shapes get an uneven band |
| Points with preset icons | Comparable where a pin is shown | Density rule differs on purpose. Preset matching is simplified |
| Vertices | Partly | Dots for tagged, shared and end vertices. No icons on tagged vertices yet, which iD and Rapid show |
| Labels | Present | Many more labels than iD (every named point). Placement differs. Fonts for Cyrillic and other scripts are missing |
| Oneway arrows | Present | Not compared in detail |
| Hover and select halo | Comparable | A selected way does not show all its shape points in the default mode |
| Not built | | Fill patterns, sided markers (cliffs, kerbs), turn restrictions, midpoints, wireframe mode |

None of the gaps looks like something MapLibre cannot do, with one exception to watch: iD interleaves casing and stroke per `layer` value, which costs MapLibre one layer group per value.

## Speed

Medians of three runs. Lower is better unless noted. Bold marks the best of the three.

### Loading: from opening the page until the picture is complete (ms)

| Scene | Maid | iD | Rapid | iD without hiding |
| --- | ---: | ---: | ---: | ---: |
| small (11k nodes loaded) | **507** | 1284 | 1461 | 1597 |
| medium (39k) | **1516** | 2016 | 3161 | 3041 |
| dense (51k) | 2536 | 2677 | 4786 | 3659 |

On the dense scene Maid and iD are equal within the spread (2453 to 2720 against 2542 to 3380). 750 ms of every iD load is its redraw throttle. Rapid loads a larger area around the view (53k nodes instead of 39k in the medium scene).

### Panning over loaded data, with a real mouse drag

| | Maid | iD | Rapid | iD without hiding |
| --- | ---: | ---: | ---: | ---: |
| Frames per second, medium | **59.6** | 29.3 | 38.4 | 2.8 |
| Frames per second, dense | **59.6** | 21.6 | 30.3 | 3.2 |
| Worst frame, medium (ms) | **16.8** | 367 | 50 | 1525 |
| Worst frame, dense (ms) | **16.8** | 1000 | 83 | 2333 |
| Main-thread work per second, dense (ms) | **354** | 904 | 923 | 994 |

On the small scene all three hold about 60. Panning into data that is not loaded yet gives the same picture: Maid's worst frame stays at one frame, iD has frames of 417 ms (medium) and 733 ms (dense), Rapid 117 and 67 ms.

iD and Rapid move a stale picture while you drag and redraw it afterwards. iD's long frames are those redraws. Maid redraws the real data on every frame.

### Zooming with the mouse wheel, two levels in and back

| | Maid | iD | Rapid |
| --- | ---: | ---: | ---: |
| Worst frame zooming in, medium (ms) | **16.8** | 433 | 100 |
| Worst frame zooming in, dense (ms) | **83** | 1333 | 500 |
| Until the picture is final after zooming in, medium (ms) | 540 | 828 | **133** |
| Until final after zooming in, dense (ms) | 567 | 1428 | **268** |
| Until final after zooming out, dense (ms) | 1467 | 811 | **134** |

This is Maid's weak spot. After a zoom MapLibre cuts new tiles in its worker and places pins and labels again. During that time the map is smooth and shows the previous tiles scaled, so nothing is wrong on screen, but the final picture comes later than in Rapid, and after zooming out on the dense scene also later than in iD.

### Hover and select

| | Maid | iD | Rapid |
| --- | ---: | ---: | ---: |
| Pointer move to highlight, dense (ms) | 8.7 | **1.1** | 67 |
| Frames per second while sweeping the pointer, medium | **59.5** | 13.1 | 39.9 |
| Frames per second while sweeping, dense | **59.5** | 6.0 | 17.6 |
| Select a way until drawn, medium (ms) | **31** | 362 | 66 |
| Select a way until drawn, dense (ms) | **30** | 1231 | 122 |

iD highlights a single feature faster than Maid (both under one frame), but moving the pointer across a dense map brings it down to 6 frames per second.

### Memory after a run (JS heap, MB)

| Scene | Maid | iD | Rapid |
| --- | ---: | ---: | ---: |
| medium | **78** | 127 | 457 |
| dense | **91** | 168 | 583 |

GPU memory is not included; it cannot be read this way.

### Changing data: dragging a vertex (Maid only)

One node of a road moved 120 times on the dense scene; time from the change until it is on screen. One run per variant.

| Approach | Median | p95 | Changes per second |
| --- | ---: | ---: | ---: |
| Re-send the whole source (`setData`) | 599 ms | 1051 ms | 2 |
| Update the feature in the big source (`updateData`) | 166 to 317 ms | 232 to 563 ms | 3 to 6 |
| **Small edit source, original hidden by feature state** | **17 ms** | **49 ms** | **44** |

This is the most important finding for editing. The obvious way is too slow, because MapLibre rebuilds a source's tiles on every change. Moving the features that are being changed into a small twin source brings it to one frame. See [ADR 0003](../adr/0003-edit-source-for-changing-features.md). iD and Rapid were not measured on this scenario.

## Against the thresholds from the plan

| Threshold (proposed, never confirmed) | Result |
| --- | --- |
| Look: every core item comparable or with a documented gap | Met. Gaps are listed above; none is a known dead end |
| Better than iD on every scenario in medium and dense: load | Met on medium. Equal on dense |
| ... settle time after a camera move | **Not met.** After zooming out on dense Maid needs 1467 ms, iD 811 ms. In the other camera scenarios Maid is equal or better once iD's redraw at the end of a gesture is counted |
| ... hover latency | **Not met as written.** iD 1.1 ms, Maid 8.7 ms. Both are within one frame, and iD collapses to 6 fps when the pointer keeps moving |
| p95 frame time within 1.25 times Rapid's on dense | Met. Maid 16.7 ms, Rapid 67 ms |
| Settle time not worse than Rapid's | **Not met.** See zooming |
| A changed node on screen within 50 ms | Met with the edit source (median 17 ms, p95 49 ms, one run) |

## What I explored and changed along the way

Each of these was measured; the numbers are in the decision records.

| Finding | Effect |
| --- | --- |
| Diff updates instead of re-sending everything | Pan into new data on dense: final after 0.5 s instead of 1.7 s |
| One update per source at a time | Works around a MapLibre 6.12 problem: overlapping `updateData` calls left tiles inconsistent and made feature queries throw. Needs an upstream report |
| Pins as symbols on every point | Was the most expensive part of the style. Dots plus fitting pins fixed readability and cost |
| Label fade at 0 ms | Makes MapLibre place all symbols on every frame: 990 ms of work per second while panning. 150 ms is the default now |
| Hover through feature state instead of a highlight source | Highlight after 7 ms instead of 23 ms |
| Edit source for changing features | 17 ms instead of 166 to 600 ms per change |
| Markers created before their features arrive | Images added later did not appear in tiles that were already laid out |

### Where the wait after a zoom comes from

Measured separately on the dense scene, jumping two zoom levels in and back five times and timing until Maid reports the final picture (`bun tools/bench/zoom-settle.ts`):

| Setting | Zoom in | Zoom out |
| --- | ---: | ---: |
| Default (tiles cut up to MapLibre zoom 17) | 340 ms (181 to 371) | 215 ms (201 to 218) |
| Tiles cut up to zoom 19, 16 or 15 | 184 to 199 ms | 215 to 248 ms |
| Without pins and labels | 183 ms | 200 ms |
| Label fade off (`fade=0`) | **11 ms** (10 to 104) | **24 ms** (18 to 48) |

So the zoom limit of the sources does not matter, and neither do pins and labels as such. About 150 ms of every wait is the label fade, which Maid counts because MapLibre only reports "idle" when it is over. Tiles of a zoom level that was visited before are ready within a frame or two.

The benchmark's larger numbers (0.4 to 1.5 s) come on top of that from two things this test leaves out: MapLibre eases the camera for a moment after the last wheel event, and tiles for a zoom level are cut the first time it is shown. Both are tunable, and neither blocks the map. I left the defaults as they are: turning the fade off makes MapLibre place symbols on every frame, which cost 990 ms of main-thread work per second in an earlier measurement.

## How far to trust the numbers

- **Unequal work.** Maid has no validator, no preset or tag UI, no undo history. iD and Rapid run their validators in the background after data arrives (Rapid for 5 to 25 s on the larger scenes), which adds to their main-thread load during the later scenarios. The comparison is "renderer plus minimal engine" against complete editors.
- **One machine, a fast one.** Apple M4 with GPU. Slower machines and integrated graphics were not tested. That matters most for Maid, because MapLibre leans on the GPU and on worker threads.
- **Headless Chrome only.** No Firefox, no Safari, no touch devices.
- **Frame rate is capped at 60.** Maid sits at the cap in every scenario, so the tables do not show how much headroom it has. Main-thread work per second is the better hint: 180 to 350 ms out of 1000.
- **"Final picture" is defined per editor.** The definitions are in `tools/refs/id/NOTES.md`, `tools/refs/rapid/NOTES.md` and `packages/renderer/src/engine.ts`. Maid's includes the label fade; iD's redraw at the end of a drag happens inside the gesture and shows up as a long frame, not as settle time.
- **Three repeats** for the main run, two for the variant runs, one for the edit test and the configuration comparisons.
- **iD without hiding** failed one of two runs on the dense scene (did not finish in five minutes), so that column has one run there.
- **Both reference editors ran without the name-suggestion-index** and without background imagery, with the sidebar collapsed.
- **Not examined:** geometry precision at very high zoom (OSM zoom 22 and above, where MapLibre overzooms tiles), relations beyond simple multipolygons, scenes larger than about 60k loaded nodes, low zoom levels.

No request left the machine in any run. Every non-localhost request is blocked and counted, and the count was zero for all three editors.

## What I recommend

Go ahead with MapLibre, and start iteration 2 with the two things that carry the most risk:

1. **Real editing on the edit-source pattern**: drag a vertex, add a node, move a way, with undo. This is where the renderer and the data model meet, and where the store decision is due (evaluate `@osm-editor-kit/osm-data` first, see [ADR 0005](../adr/0005-own-store-for-the-proof-of-concept.md)).
2. **Time to final picture after zoom**: decide what counts as final (the label fade is cosmetic), shorten or drop the wheel easing, and cut tiles for the neighbouring zoom levels ahead of time. Check geometry precision at high zoom along the way.

Before building on it further:

- Report the `updateData` problem to MapLibre with a minimal reproduction.
- Run the benchmark on a weaker machine and in Firefox and Safari.
- Add a fair background load to Maid (a validator pass) so the comparison is like for like.

## Reproduce

```bash
bun install
bun run refs-setup      # clones and builds iD and Rapid at their pins
bun run bench --repeat 3 --label main
bun run bench --editor id --repeat 2 --label id-cull0 --variant "no auto-hide" --id-query "cull=0"
bun run bench-report <run-id> [<run-id> ...]
bun run compare         # the three editors side by side on http://localhost:5174
```
