# First paint: what loads when, 2026-10-29

Tobias saw a long white screen on a phone before Maid appeared. A subagent built `apps/maid` (`vite build`, no type check) and read the chunks, their source maps and the start code. Sizes are measured from the build (KB = 1000 bytes, gzip level 6); every timing is _inferred_ from bytes (about 1 MB/s on 4G): under automation the start order is skipped and no imagery server may be asked, so there is no measured phone timing.

## Before anything shows

Until the code has run, the page was empty: a white screen. Now `apps/*/index.html` shows a spinner from the first byte.

Before React draws the top bar, a first visit loads **31 scripts, 2.9 MB raw, 874 KB gzip**, plus 27 KB of CSS:

| File               | gzip KB | What is in it                                                                           |
| ------------------ | ------: | --------------------------------------------------------------------------------------- |
| entry (`index-*`)  |     273 | React DOM, the shell, dexie (journal), ui, Paraglide (all four languages), heroicons    |
| `maplibre-gl-*`    |     284 | MapLibre GL, whole                                                                      |
| `src-*` (model)    |      93 | zod, the data model, aes-js (unused, through the `@rapid-sdk/util` barrel), core, query |
| `src-*` (renderer) |      69 | renderer, validation rules, operations                                                  |
| `Tooltip-*`        |      52 | motion (framer-motion, motion-dom), tailwind-merge                                      |
| `floating-ui`      |      21 | floating-ui                                                                             |
| 25 smaller         |     ~80 | style data, toasts, date-fns' German locale, street-imagery core                        |

Then, with the map: the MapLibre worker (145 KB), four of them.

## Right after the first view

| What                                       | gzip KB | Why now                                                              |
| ------------------------------------------ | ------: | -------------------------------------------------------------------- |
| Imagery index for Europe, with coverage    |     720 | the start order picks the best background (`module-imagery/shown.ts`) |
| of which the coverage geometry             |     568 | even when the address names a background                             |
| Presets, prefetched                        |     428 | `presetsPreload()` in `apps/maid/vite.config.ts`                     |
| Lazy panels, preloaded when idle           |     167 | `preloadLazyComponents` (`packages/ui/src/lazy.tsx`); Inspector 71   |
| Sprites, whole per set                     |  23–387 | pinhead is 387 KB for 35 icons                                       |

## Ranked by gain on a phone

1. **Imagery coverage geometry, 568 KB**, on every first view. Done: the best background is judged by the boxes already in the 79 KB index (`coverageFromBoxes` in `module-imagery/src/coverage.ts`, Tobias, 2026-10-29), and the search is skipped when the address names a background (`shown.ts`). No code loads the polygons any more.
2. **Presets prefetch, 428 KB**: its own comment measured no gain in ready time. Done: only on fast connections without save-data (`apps/vite-presets-preload.ts`, Tobias, 2026-10-29).
3. **Lazy panels preloaded when idle, 167 KB**: skip on touch devices, or preload only the Inspector.
4. **Map after the top bar**: lazy-load `MapView`, so the top bar and the spinner's replacement come before MapLibre's 284 KB and its worker; preload the worker's URL. Two workers instead of four on phones (CPU, not measured).
5. **Sprites cut to the icons the presets use**: 150 to 250 KB less (_inferred_).
6. **Code the start does not need**, 40 to 60 KB (_inferred_): aes-js (barrel import), four date-fns locales instead of the visit's one (`packages/ui/src/time.ts`), zod, the validation rules in the entry.
7. **Dark mode shows white until the code runs**: the theme class is set by `initTheme` only. Set it inline in `index.html` from the stored choice. `frame-sync.js` (a classic script on every page) only when `window.opener` exists.
8. **The journal's dexie, about 30 KB**, after the first settle (`journalSettled` needs care).

## Already lazy and fine

Inspector, notes, relations column, turn restrictions, data layers, lenses, surface field and imagery panel are lazy (only preloaded, see 3). The Mapillary viewer (268 KB) loads only with the photo panel. `osm-api` only on login or save. GPX, OAM and other ELI regions on use. No external fonts or scripts; assets are hashed.

## Measured on the iOS simulator, 2026-10-29

`bun run sim-measure` on Tobias's Mac: iPhone 17, iOS 26.5, scene `small`, mock data, no background, after the cuts above. A simulator runs on the Mac's CPU (the page sees 8 cores), so its times are lower than a phone's; the comparison between variants is what counts.

Second round: medians of 5 runs in ms, one warm-up visit not counted, the variants taking turns.

| Cache | Workers | First contentful paint | Map drawn | Settled |
| ----- | ------: | ---------------------: | --------: | ------: |
| cold  |       4 |                    307 |      2315 |    2408 |
| cold  |       2 |                    300 |      2187 |    2265 |
| cold  |       1 |                    330 |      2298 |    2387 |
| warm  |       4 |                    317 |      2115 |    2213 |
| warm  |       2 |                    280 |      2185 |    2290 |
| warm  |       1 |                    280 |      2265 |    2355 |

- The number of workers makes no measurable difference: the medians are within 150 ms, single runs of one variant swing from 1.9 to 4.0 s. Maid keeps 4 (Tobias, 2026-10-29). A first round of 3 runs without warm-up looked like "fewer is faster"; that was the slow first visits after the boot.
- The first two visits of a round are slower, so `--warmup` is now 2.
- Cold and warm differ little: the local server has no latency, so parsing and drawing cost the time, not the download.
- What a cold visit loads before it settles, uncompressed (the script's server does not gzip): 7.2 MB, of it the presets chunk 1.8 MB, MapLibre 1.07 MB, the entry 0.83 MB, ELI's Europe details 0.74 MB, the worker 0.51 MB.

## Unsure

- Timings are from the simulator, not a phone. Bytes above the measured section are from the build.
- GitHub Pages serves gzip, not brotli, with a short cache time (general knowledge, the repo has no headers file).
- motion (about 124 KB raw) is in the Sidebar, Dock, Flyout, Tooltip and BottomSheet, all drawn at the start. It stays: no refactor to CSS (Tobias, 2026-10-29).
