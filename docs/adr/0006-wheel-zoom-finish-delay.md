# 0006: Shorten MapLibre's wait after a wheel zoom

Date: 2026-10-10

## Decision

Maid changes one constant in MapLibre: the time the map stays in its "zooming" state after a wheel zoom has reached its target goes from 200 ms to 40 ms. The change is a `bun patch` (`patches/maplibre-gl@6.12.0.patch`, listed under `patchedDependencies` in the root `package.json`). It is tied to that exact version, so a MapLibre update drops it visibly and it has to be redone.

## Why

The first benchmark showed Maid reaching the final picture after a wheel zoom later than Rapid (0.4 to 1.5 s against 0.1 to 0.3 s). `bun tools/bench/wheel-zoom.ts` splits that wait, counted from the last wheel event, on the dense scene:

| | Camera at rest | Tiles loaded | Idle (symbols placed and faded in) |
| --- | ---: | ---: | ---: |
| Before | 400 ms | 400 ms | 470 to 600 ms |
| With the patch | 237 ms | 237 ms | 410 to 535 ms |
| With the patch and `fade=0` | 252 ms | 252 ms | 238 to 246 ms |

Tiles are never what the map waits for: they are ready when the camera stops. The wait is 200 ms of easing (a real animation), then MapLibre's fixed 200 ms before it declares the zoom finished, then the label fade. Nothing moves during the second 200 ms; the map just does not go idle. The patch removes most of it.

The first zoom out in each run took 3 to 5 s. That is not rendering: the wheel overshoots the start zoom, the view grows and new OSM tiles are fetched. It affects every editor the same way.

Also tried, without effect on this wait: the zoom limit of the sources (15, 16, 17, 19) and removing pins and labels.

## How to patch here

```bash
bun patch maplibre-gl@6.12.0          # at the repo root; prepares a private copy
# edit node_modules/maplibre-gl/dist/...   (the ROOT node_modules, nowhere else)
bun patch --commit node_modules/maplibre-gl
```

Bun prepares the private copy in the root `node_modules/maplibre-gl`. The path `apps/maid/node_modules/maplibre-gl` is a link into Bun's shared package store that every project on the machine uses, and must not be edited. On the first attempt I edited that link by mistake; the change was reverted and the store verified against the package cache by checksum. The same approach as in `strassenraumkarte/vector/patches`.

The patch file is large (about 580 KB) for a one-number change, because the minified build is a single line and the diff carries the whole line.

## Still open

- The label fade (150 ms) is counted in "final picture". Whether it should be is a definition question; with `fade=0` MapLibre places symbols on every frame, which was expensive before pins were reduced and has not been re-measured since.
- 40 ms is a guess that covers two wheel events of one gesture at 60 Hz. Slow notch-by-notch scrolling now produces a zoom end per notch, which costs a URL update and a tile check each time.
