# Iteration 1: can Maid render OSM data with MapLibre?

Second edition, 2026-10-10 (late). The first edition compared Maid with iD and Rapid as they ship. This one switches off validation in iD and Rapid so that all three only render, adds a vertex drag with the real mouse, includes the speed work done since, and adds Firefox and WebKit.

Run on one machine (Apple M4, Chrome 154 headless with GPU, 1600×1000 at 2x). The machine was under other load during the runs (another app at 100% of a core), which widens the spread; all three editors ran interleaved, so they shared it. Full tables and all screenshots: `reports/2026-10-10-21-13-final/report.html` (generated, not in git).

## Answer

**Yes, this is a feasible path, and the case got stronger.** With validation off in iD and Rapid, Maid still holds 60 frames per second in every scenario, including dragging a vertex, while iD drops to 13 to 30 and Rapid to 32 to 38 when panning or hovering on the larger scenes. Maid also loads the dense scene fastest.

What you should weigh:

1. **Maid's weak spot is the wait for the final picture when new data arrives**, most visibly after zooming out: 1.1 to 2.3 s on the larger scenes, against 0.8 s for iD and 0.2 to 0.3 s for Rapid. The map stays smooth during that time. The cause is structural: every arrival of data re-tiles the whole source. It is the first thing to fix next, and there is a concrete idea for it (below).
2. **Rapid is as smooth as Maid when dragging a vertex** (59 fps). Maid's advantage over Rapid is in panning and hovering, and in memory; its advantage over iD is everywhere except single-hover latency.
3. **Maid is still not a full editor.** It now has an inspector, tag editing and vertex dragging, but no undo, no saving, no presets form, no relations editing.
4. **The thresholds from the plan were never confirmed.** Checked against them, two are still not met as written (below).

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
| Vertices | Comparable | Dots for tagged, shared and end vertices; tagged vertices with a preset show the disc with its icon from zoom 17 on. Not compared one by one with iD |
| Labels | Present | Many more labels than iD (every named point). Placement differs. Fonts for Cyrillic and other scripts are missing |
| Oneway arrows | Present | Not compared in detail |
| Hover and select halo | Comparable | A selected way shows its shape points. No midpoints |
| Not built | | Fill patterns, sided markers (cliffs, kerbs), turn restrictions, midpoints, wireframe mode |

None of the gaps looks like something MapLibre cannot do, with one exception to watch: iD interleaves casing and stroke per `layer` value, which costs MapLibre one layer group per value.

## Speed

Medians of three runs, validation off in iD and Rapid. Lower is better unless noted. Bold marks the best of the three.

### Loading: from opening the page until the picture is complete (ms)

| Scene | Maid | iD | Rapid |
| --- | ---: | ---: | ---: |
| small (11k nodes loaded) | **1094** | 1483 | 2026 |
| medium (39k) | 2325 | **2240** | 3797 |
| dense (51k) | **2019** | 2674 | 3812 |

Maid's runs spread widely on the small and medium scenes (797 to 1462 ms and 1849 to 2569 ms), so Maid and iD are equal there within the noise. On the dense scene Maid is ahead in all three runs. iD draws less than the other two: it hides buildings and points on the larger scenes. Rapid loads a larger area around the view.

### Panning with a real mouse drag

| | Maid | iD | Rapid |
| --- | ---: | ---: | ---: |
| Frames per second over loaded data, medium | **59.7** | 30.4 | 36.0 |
| Frames per second over loaded data, dense | **59.8** | 22.8 | 36.2 |
| Worst frame, medium (ms) | **17** | 467 | 67 |
| Worst frame, dense (ms) | **17** | 767 | 67 |
| Into new data: worst frame, dense (ms) | **17** | 617 | 50 |
| Into new data: until the picture is final, medium (ms) | **279** | 1554 | 650 |
| Into new data: until the picture is final, dense (ms) | 330 | 1670 | **83** |

iD and Rapid move a stale picture while you drag and redraw it now and then; iD's long frames are those redraws. Maid redraws the real data on every frame.

### Zooming with the mouse wheel, two levels in and back

| | Maid | iD | Rapid |
| --- | ---: | ---: | ---: |
| Worst frame zooming in, medium (ms) | **50** | 450 | 100 |
| Worst frame zooming in, dense (ms) | **67** | 1033 | 333 |
| Until final after zooming in, medium (ms) | 445 | 896 | **250** |
| Until final after zooming out, medium (ms) | 1058 | 781 | **163** |
| Until final after zooming out, dense (ms) | 2291 | 814 | **301** |

Zooming out is where Maid is worst. The wheel overshoots, the view grows, and new OSM tiles are fetched; when they arrive Maid re-tiles all four sources, twice. See "The remaining weak spot".

### Hover and select

| | Maid | iD | Rapid |
| --- | ---: | ---: | ---: |
| Pointer move to highlight, medium (ms) | 12.8 | **4.2** | 38.4 |
| Pointer move to highlight, dense (ms) | **11.7** | 26.0 | 51.7 |
| Frames per second while sweeping the pointer, medium | **59.5** | 12.2 | 38.2 |
| Frames per second while sweeping, dense | **59.5** | 6.5 | 31.8 |
| Select a way until drawn, medium (ms) | **31** | 408 | 69 |
| Select a way until drawn, dense (ms) | **31** | 774 | 73 |

Maid's select now includes opening its inspector.

### Dragging a vertex with the real mouse

A road junction is pressed and moved in a small circle for two seconds, one zoom level closer than the other scenarios. The benchmark checks that the node really moved in each editor's data.

| | Maid | iD | Rapid |
| --- | ---: | ---: | ---: |
| Frames per second, medium | **60** | 21 | 59 |
| Frames per second, dense | **60** | 13 | 59 |
| Worst frame, medium (ms) | **17** | 150 | **17** |
| Worst frame, dense (ms) | **17** | 317 | **17** |
| Until final after release, medium (ms) | 265 | **0** | 46 |
| Until final after release, dense (ms) | 281 | **11** | 18 |

Maid and Rapid are equally smooth; iD is not. After release Maid needs about 0.3 s to write the moved features back into its big sources. The picture is already correct during that time, because the moved features are drawn from a small separate source ([ADR 0003](../adr/0003-edit-source-for-changing-features.md)).

![Maid after the drag](img/medium-drag-maid.jpg)

### Memory after a run (JS heap, MB)

| Scene | Maid | iD | Rapid |
| --- | ---: | ---: | ---: |
| medium | **68** | 126 | 361 |
| dense | **67** | 161 | 476 |

GPU memory is not included; it cannot be read this way.

### Firefox and WebKit

Playwright's builds of Firefox 155 and WebKit 26.6, medium scene, two runs each. Main-thread work and heap cannot be measured there.

| | Maid | iD | Rapid |
| --- | ---: | ---: | ---: |
| Firefox: frames per second while panning | **59.6** | 9.2 | 12.6 |
| Firefox: frames per second while dragging a vertex | **60** | 8 | 30 |
| Firefox: load until complete (ms) | **2237** | 2944 | 5012 |
| WebKit: frames per second while panning | **59.2** | 14.8 | did not run |
| WebKit: frames per second while dragging a vertex | **59** | 4.5 | did not run |
| WebKit: load until complete (ms) | 2942 | **2698** | did not run |

Maid behaves the same in all three browsers. iD and Rapid are slower in Firefox than in Chrome. Rapid did not get past loading in Playwright's WebKit ("pattern textures not loaded"); that may be this WebKit build or our host page, and says nothing certain about Safari.

### Does validation explain iD's and Rapid's numbers?

No. Switching it off changed little: on the dense scene iD panned at 21.6 fps with it and 22.8 without, Rapid at 30.3 and 36.2. Their frame rates are set by drawing.

## Against the thresholds from the plan

| Threshold (proposed, never confirmed) | Result |
| --- | --- |
| Look: every core item comparable or with a documented gap | Met. Gaps are listed above; none is a known dead end |
| Better than iD on every scenario in medium and dense: load | Met on dense. Equal within noise on medium |
| ... settle time after a camera move | **Not met after zooming out**: 1058 and 2291 ms against iD's 781 and 814 ms. Met when panning into new data and after zooming in |
| ... hover latency | Met on dense (11.7 against 26 ms). Not met on medium (12.8 against 4.2 ms); both are within one frame |
| p95 frame time within 1.25 times Rapid's on dense | Met. Maid 16.8 ms, Rapid 50 ms |
| Settle time not worse than Rapid's | **Not met.** Rapid reaches the final picture sooner in most cases |
| A changed node on screen within 50 ms | Met: 60 fps during a real drag on every scene, so each step is on screen within a frame |

## The remaining weak spot

A trace of what Maid waits for shows the pattern behind every slow "until final" number: new OSM data arrives, each of the four sources gets an update, and MapLibre re-tiles the **whole** source and rebuilds every visible tile, although only a strip at the edge is new. iD and Rapid only draw what is new.

What was done about it tonight, with measurements in the decision records:

- MapLibre ran on one worker thread; Maid now starts four. Final picture after panning into new data on the dense scene: about 0.8 s instead of 1.5 s ([ADR 0007](../adr/0007-workers-and-batched-updates.md)). In the full run it is 330 ms.
- Tiles that arrive together go in as one update.
- MapLibre held the map in "zooming" for a fixed 200 ms after a wheel zoom; patched to 40 ms ([ADR 0006](../adr/0006-wheel-zoom-finish-delay.md)).

What is left, and the idea for it: **split the sources by area**. If each source holds the data of one block of OSM tiles, new data creates a new source and old sources are never re-tiled. The cost is more layers (one set per block in view), which has to be measured. This is the next experiment.

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
| Four MapLibre workers instead of one | Final picture after panning into new data about twice as fast |
| MapLibre's fixed 200 ms after a wheel zoom, patched to 40 ms | Camera at rest 240 ms after the last wheel event instead of 400 ms |
| Validation off in iD and Rapid | Changed their numbers little |
| Source zoom limit 15 to 19, pins and labels off | No effect on the wait after a zoom |

### Where the wait after a zoom comes from

Measured separately on the dense scene, jumping two zoom levels in and back five times and timing until Maid reports the final picture (`bun tools/bench/zoom-settle.ts`):

| Setting | Zoom in | Zoom out |
| --- | ---: | ---: |
| Default (tiles cut up to MapLibre zoom 17) | 340 ms (181 to 371) | 215 ms (201 to 218) |
| Tiles cut up to zoom 19, 16 or 15 | 184 to 199 ms | 215 to 248 ms |
| Without pins and labels | 183 ms | 200 ms |
| Label fade off (`fade=0`) | **11 ms** (10 to 104) | **24 ms** (18 to 48) |

So the zoom limit of the sources does not matter, and neither do pins and labels as such. About 150 ms of every wait is the label fade, which Maid counts because MapLibre only reports "idle" when it is over. Tiles of a zoom level that was visited before are ready within a frame or two.

This table is from before the wheel-zoom patch. A second script (`bun tools/bench/wheel-zoom.ts`) later split the wait after a real wheel zoom: 200 ms of camera easing, then a fixed 200 ms in which MapLibre still counts the map as zooming, then the fade. The fixed part is now patched down to 40 ms. The fade stays: turning it off makes MapLibre place symbols on every frame, which cost 990 ms of main-thread work per second in an earlier measurement.

## How far to trust the numbers

- **Unequal work, less than before.** iD and Rapid now run without validation. They still carry a full UI, undo history and presets; Maid has an inspector with tag editing and nothing else.
- **One machine, a fast one.** Apple M4 with GPU. Slower machines and integrated graphics were not tested. That matters most for Maid, because MapLibre leans on the GPU and on worker threads.
- **Headless browsers.** Chrome for the main run, Playwright's Firefox and WebKit for a smaller one. No real Safari, no touch devices.
- **Background load.** Another application used a full core during the runs. Editors ran interleaved, so it hit all three, but single cells can be off; the ranges in the generated report show it.
- **Frame rate is capped at 60.** Maid sits at the cap in every scenario, so the tables do not show how much headroom it has. Main-thread work per second is the better hint: 180 to 350 ms out of 1000.
- **"Final picture" is defined per editor.** The definitions are in `tools/refs/id/NOTES.md`, `tools/refs/rapid/NOTES.md` and `packages/renderer/src/engine.ts`. Maid's includes the label fade; iD's redraw at the end of a drag happens inside the gesture and shows up as a long frame, not as settle time.
- **Three repeats** for the main run, two for Firefox and WebKit, five for the worker and batching comparison, one for most other configuration comparisons. One iD run of an earlier full run did not finish in five minutes; the final run had no failures.
- **iD without hiding** (drawing everything) was only measured in the first edition: about 3 fps while panning the larger scenes.
- **Both reference editors ran without the name-suggestion-index** and without background imagery, with the sidebar collapsed.
- **Not examined:** geometry precision at very high zoom (OSM zoom 22 and above, where MapLibre overzooms tiles), relations beyond simple multipolygons, scenes larger than about 60k loaded nodes, low zoom levels.

No request left the machine in any run. Every non-localhost request is blocked and counted, and the count was zero for all three editors.

## What I recommend

Go ahead with MapLibre. Next, in this order:

1. **Split the sources by area** and measure it. This targets the one place where Maid is behind both other editors.
2. **Real editing on the edit-source pattern, with undo.** Port iD's graph and history as the data layer ([extensibility plan](../extensibility-plan.md)); the current store cannot undo.
3. **Send the MapLibre report** ([draft](../upstream/maplibre-updatedata-inconsistent-tiles.md)) once you have read it. Nothing has been posted.

## Reproduce

```bash
bun install
bun run refs-setup      # clones and builds iD and Rapid at their pins
bun run bench --repeat 3 --label final
bun run bench --browser firefox --scene medium --repeat 2 --label firefox
bun run bench --editor id --repeat 2 --label id-cull0 --variant "no auto-hide" --id-query "cull=0"   # iD drawing everything
bun run bench-report <run-id> [<run-id> ...]
bun run compare         # the three editors side by side on http://localhost:5174
```
