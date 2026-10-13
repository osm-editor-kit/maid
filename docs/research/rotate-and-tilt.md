# Rotate and tilt: can Maid turn and tilt the map?

Date: 2026-10-13. Owner's request: add the full MapLibre turn (bearing) and tilt (pitch), keep editing correct, and add a re-tilt button like tilda-geo's.

Labels in this file: **[M]** measured in a browser on the dev server (Playwright, real mouse and key events, camera set by `jumpTo`), **[R]** read from code, **[I]** inferred. No code was changed. Scratch scripts are outside the repo.

Versions: MapLibre GL 6.12.0 (default `maxPitch` 60, `dragRotate` true, `keyboard` true, `touchZoomRotate` true, `touchPitch` true) [R], react-map-gl 8.1.3 [R].

## Built on 2026-10-13 (be55541)

Turning is built: Alt or Control with a drag on open map (the mouse rotate that was off below is on now); Shift with the left and right arrows in steps of 2.5 degrees; two fingers on a touch screen; a compass button, shown while the map is turned, and the key N. A link (`map=zoom/lat/lng/bearing`) and the stored last position keep the bearing. Labels, pins and house numbers stay upright, and street names follow their road. `fitTo` keeps the bearing (3bb1edd). Of the five fixes in Part 4, these are done: 1 (`fitTo`), 2 (URL and stored view) and 3 (the compass). Fix 4 (the notes and imagery boxes) and fix 5 (keep the mouse rotate off) are not: the mouse rotate is on now.

Tilt is not built and stays off. The Part 4 tilt items (the rotate tool's angle under pitch, `maxPitch`, the capped tile cover) are open.

Still broken with a turned map:

- Tiles, notes, imagery and street imagery load for the box around the view, which is larger than the view when turned. More requests than needed (Part 2, the rows for `loadVisibleTiles`, notes and imagery).
- The "too large" rule (5251d50) uses the view box, so the share in view is not exact with a turned map. Fixed in 827a9f8: the share is measured against the four corners of the view.
- Ctrl-click on open map on a Mac no longer opens the menu, because Ctrl with a drag turns the map. Needs a person's test.
- Shift+Right turns clockwise, as in Rapid. This reverses MapLibre's default. To be confirmed.

## Verdict

- **Rotation (bearing): yes, with five fixes first.** The editing core is camera-correct for move, rotate-by-angle at bearing, draw, pick, snap and measure [M]. Breaks: `fitTo` resets the bearing [M], the URL and the stored view drop it [R], the rotate tool's angle is off under pitch only [M], and there is no control.
- **Tilt (pitch): not yet.** It works in the tests at pitch 45 for move, draw, pick and measure [M], but the rotate tool turns 35 to 42 degrees for a 30 degree pointer sweep [M], the tile cover grows 2.7 times at OSM zoom 18 and 6.5 times at zoom 16 at pitch 60 [M], and the ground size per pixel differs 3.7 times between the top and bottom edge at pitch 60 [M]. Needs a maximum pitch and a capped tile cover.

Note the surprise: **turning and tilting already work from the keyboard and by touch.** Shift+Left and Shift+Right turn the map by 15 degrees per press, Shift+Up tilts by 10 degrees [M]. Two-finger twist and pinch are on by default [R], not measured. Only the mouse is off.

## Part 1: what is switched off today

| Setting | Maid today | Effect | Source |
| --- | --- | --- | --- |
| `dragRotate` | `false` (MapView.tsx `<Map>`) | Right-drag and Ctrl-drag do not turn or tilt. Measured: no change in bearing or pitch. | [M] smoke, [R] MapView.tsx |
| `pitchWithRotate` | default `true`, no effect while `dragRotate` is off | none | [R] maplibre defaults |
| `touchZoomRotate` | default on, not set | two-finger twist turns the map | [R], not measured |
| `touchPitch` | default on, not set | two-finger vertical drag tilts | [R], not measured |
| `keyboard` | default on, not set | Shift+Left/Right turn 15°, Shift+Up/Down tilt 10° per press | [M] |
| `maxPitch` | not set, so 60 | `getMaxPitch()` = 60 | [M] |
| `initialViewState` | no bearing or pitch | every start is north-up, flat | [R] |
| URL `map=` | `zoom/lat/lng` only (url/params.ts `parseAsCamera`) | bearing and pitch never reach the URL | [R] |
| stored last view | zoom, lat, lng only (MapView.tsx `handleMoveEnd`) | a reload loses the turn | [R] |
| compass button | none: `ZoomControls.tsx` has zoom in and out only | nothing to reset north | [R] |

**Why the mouse is off.** `dragRotate={false}` came in with the first map commit, 81fdd73 (2026-10-10). Its message gives no reason. [I] The likely reason: the right button opens the editor's edit menu (MapView.tsx `handleContextMenu`), and Ctrl-click is the Mac right click, so MapLibre's right-drag and Ctrl-drag would collide with the menu. No document in `docs/` decides it.

**Turning in other editors [R].**
- **Rapid** supports bearing. URL `map=zoom/lat/lon/angle` with the angle in degrees, sign negated, left out when near zero (`MapSystem.ts` `_hashChanged` around lines 317-340, and the writer at lines 405-420). Rotate gesture: Alt or Control plus drag, pivot at the viewport centre (`MapInteractionBehavior.ts` lines 340-380). Shift+Left/Right turn 2.5° (same file, around line 160). Its compass (`UiBearingControl.ts`) resets to north on click. Labels are counter-rotated to stay screen-upright and are all relabelled on a turn (`PixiLayerLabels.ts` lines 327, 344-375). Drags undo the turn before panning (`MapSystem.pan`, lines 654-656).
- **Rapid tilt.** None in the main map: its `Viewport` has no pitch. A separate 3D view (`Map3dSystem.ts`) is a second MapLibre map at pitch 60 that follows the main map's bearing, with its own compass [R].
- **iD** has no bearing: `renderer/map.js` has no bearing or pitch setter; its only "rotation" is a field copied from an event [R].

## Part 2: what assumes a flat, north-up map

Verdict key: **OK** correct under any camera. **Fix** assumes flat or north-up. **Note** correct but the pixel rule now means different ground sizes.

| File, function | What it does | Under bearing | Under pitch |
| --- | --- | --- | --- |
| `engine.ts` `loadVisibleTiles` (324-346) | tiles in `map.getBounds()` box at OSM zoom 16 | box grows, [M] | box grows to the horizon, [M] **Fix** |
| `engine.ts` `snapAt` (1269-1321), `snap.ts` | square box of 8 px in the screen, `map.project` of nodes, `nearestOnPolyline` in px, `map.unproject` for the place | OK | **Note**: 8 px is constant on screen; ground size changes [M] |
| `engine.ts` `pick`, `pickAll` (2087-2140) | rendered-feature box of 6 px | OK | OK. Measured reach 8 to 16 px, depends on the line's direction [M] |
| `transform.ts` `TransformTool.move` (153-170) | pointer's ground position, Mercator delta | OK | OK for the feature under the pointer near the centre [M] |
| `transform.ts` rotate, angle (175-185) | angle of the pointer around the centre of the nodes, on the Mercator plane | OK (a turn is a similarity) [M] | **Fix**: 35 to 42° on screen for a 30° sweep [M] |
| `draw.ts` `target` (270-297), `nearestOnWay` | `map.project` of nodes, 8 px box, `map.unproject` for free clicks | OK [M] | OK [M] |
| `midpoints.ts` `midpointFeatures` (55-77) | middle taken on screen, then `unproject` | OK [M] | OK. Handle at the screen middle, 0.00 px [M] |
| `field-overlay.ts` `visiblePolyline`, `straightEnough` | straightness on screen points, minimum 40 px | OK | **Note**: tests the perspective line, not the ground |
| `field-overlay.ts` width bands (`frame`, `offsetLine`) | band built in metres in a flat frame at the line's start | OK, ground geometry [R] | OK, ground geometry [R] |
| `direction.ts`, `direction-images.ts` | oneway arrows as `line-pattern` images, map-aligned | arrows follow the way [R] | arrows foreshortened [R], not confirmed by eye |
| `layers.ts` plaques (`point-address`, 530-560) and pins (575-600) | no `*-alignment` set, so MapLibre `auto` | upright on screen [R] | upright on screen [M] (screenshot) |
| `layers.ts` street labels (`symbol-placement: line`, ~651) | `auto`, so map-aligned | label turns with the road [M] | label tilts and foreshortens [M] |
| `measure.ts` `distanceMetres` | great-circle distance of unprojected points | OK | OK, 0.04 to 0.11 % error [M] |
| `StackPicker.tsx` (116), `MapContextMenu.tsx` | `map.project` of the stack; menu placed at the pointer's screen position | OK [M] | OK [M] |
| `MapView.tsx` `keyMenuPlace` (90-107) | mean of lon/lat, then `map.project` | OK | OK |
| `useShortcuts.ts` arrows (86-117) | `panBy` in screen pixels | OK | OK |
| `engine.ts` `fitTo` (1541-1566) | `fitBounds` without a bearing | **Fix**: MapLibre resets the bearing to 0 (its docs and `cameraForBounds` use `bearing || 0`). Measured: 37 becomes 0 [M] | same reset, pitch kept [R] |
| `module-notes` `notes.tsx` (80-84), `module-imagery` `ImageryLayers.tsx` (32-35) | `getBounds()` box sent to notes and imagery | box grows [R] | box grows, more requests to external services [R] **Fix** |
| `module-street-imagery` (uses `useMapViewportBbox` from the external `street-imagery-react`, read only) | `getBounds()` box, snapped to tiles | box grows [R] | box grows [R] **Fix** |
| `module-street-imagery` view cone | ground polygon from the photo's compass heading | OK [R] | OK [R] |
| `url/view.ts`, `MapView.tsx` `handleMoveEnd` | stores zoom, lat, lng only | drops bearing [R] | drops pitch [R] **Fix** |

Pixel rules and ground size. Snapping (8 px), pick (6 px and the line's half width), handles (6 px) and the minimum segment length (40 px) are all screen rules. They stay the same in pixels at every camera, but the ground size changes. At pitch 45, 8 px is 3.75 m at the top third and 2.38 m at the bottom third. At pitch 60 with bearing 200, 4.75 m at the top and 2.10 m at the bottom [M]. Decide whether that is acceptable (owner decision 6).

## Part 3: measurements

Camera matrix: six cameras on the `small` scene at OSM zoom 18, 1600 by 1000 window. Each run is one browser session, about a minute each. Camera 200 is stored as -160 by MapLibre (same orientation).

### Table: tests by camera [M]

Results from the final batch unless marked "earlier". "n/m" = not measured (no suitable target found on screen); the reason is in the notes.

| Test | 0 / 0 | 90 / 0 | 37 / 0 | 0 / 45 | 37 / 45 | 200 / 60 (-160) |
| --- | --- | --- | --- | --- | --- | --- |
| a1 click on a building edge selects it | pass | pass | pass | pass | pass | pass |
| a2 pick reach outward (px; 6 px box plus half the line) | 16 | 10 | 14 | 10 | 10 | 8 |
| a3 click on a standalone point selects it | pass | n/m | n/m | pass | n/m | pass |
| a4 click on a vertex of a selected building selects it | pass | pass | **FAIL** (picked the neighbour, 6 px away; not investigated) | pass | pass | pass |
| b drag a free corner, node ends at pointer | pass, 1.33 px | pass, 1.38 px (Alt) | pass, 1.13 px | **FAIL**, 80.6 px (Alt; not investigated) | pass, 0.97 px (Alt) | pass, 0.76 px (Alt) |
| c1 node dropped on node connects | pass | pass | pass | pass | n/m (no pair of corners on screen) | pass |
| c2 node snap reach, median (px), top and bottom third | top 12, bottom 1 (noisy 0 to 16) | top 7, bottom 6 | top 7, bottom 7 | top 5, bottom 7 | top 7, bottom 5 | top 1, bottom 7 |
| c2 way snap, median of the smaller side (px) | 3 | 5 | 5 | 2 | 3 | 1 |
| c2 metres per 8 px, top and bottom third | 2.91 (middle) | 2.91 (middle) | 2.91 (middle) | 3.75 top, 2.38 bottom | 3.75 top, 2.38 bottom | 4.75 top, 2.10 bottom |
| d three clicks of a line, nodes at the clicks | pass, 0.00 px | pass, 0.00 px | pass, 0.00 px | pass, 0.00 px | pass, 0.00 px | pass, 0.00 px |
| e1 move by the pointer vector (70, -45 px) | pass, 0.00 px | pass, 0.00 px | pass, 0.00 px | pass, 0.86 px | pass, 0.62 px | pass, 1.25 px |
| e2 rotate by the pointer angle (30°, on screen) | pass, 0.41° | pass, 0.14° | pass, 0.17° | **FAIL**, 35° worst, mean 37° turn | n/m (no building of the right size) | **FAIL**, 42° worst, mean 49° turn |
| f midpoint handle on screen middle; drag adds node at pointer | earlier pass: 0.00 and 0.82 px | earlier pass: 0.00 and 0.53 px | earlier pass: 0.00 and 0.93 px | probe 0.00 px (handle); final batch n/m | n/m | earlier pass: 0.00 and 1.07 px |
| g measuring tape vs great-circle distance of unprojected points | pass, 0.11 % | pass, 0.11 % | pass, 0.11 % | pass, 0.04 % | pass, 0.04 % | pass, 0.03 % |
| h right click: menu left edge at pointer x (px) | earlier -0.8 | earlier -0.7 | earlier flipped up, x -0.0 | earlier -0.1 | earlier -0.5 | earlier -0.5 |
| h menu top edge at pointer y (px) | earlier -0.6 (fits) | earlier -0.6 | earlier -463 (flipped up: bottom at pointer) | earlier -0.6 | earlier -0.8 | earlier -0.2 |
| i tiles in the view box at OSM zoom 18 | 6 | 4 | 6 | 6 | 9 | 16 |

Notes on the table:
- a2 changes with the building's edge direction, so it is not a pure pixel reach.
- a4 at 37/0 picked a neighbouring node. Cause not checked.
- b at 0/45 with Alt dropped the node 80 px from the pointer. The drag may not have grabbed the corner. Not investigated, but it is a red flag for the pitched path and must be checked first.
- e2 is the rotate tool's angle on screen. The pass limit is 2°.
- f and h were run in an earlier batch before a road filter change. The final batch found no suitable road for them at most cameras. The probe at 0/45 showed the handle exactly on the screen middle (0.00 px). A miss on the first try was a test error: the click selected a different road.

### Screenshots [M, read by eye]
- `b37-p45-plain`: plaques stay upright, street labels follow the road and are foreshortened, the top of the view is compressed. Oneway arrows not confirmed.
- `b37-p45-selected-width` and the other screenshots: not inspected.

### Keyboard [M]
- Shift+Right: bearing 15°. Shift+Up: pitch 10° (from 0).

### Fit to a selection [M]
- `engine.fitTo` on a way at bearing 37: bearing becomes 0 and pitch stays 0.

### Ground scale across the view [M]
| Camera | Metres per px: top | middle | bottom |
| --- | --- | --- | --- |
| 0 / 0 | 0.364 | 0.364 | 0.364 |
| 0 / 45 | 0.545 | 0.364 | 0.273 |
| 37 / 45 | 0.545 | 0.364 | 0.273 |
| 200 / 60 | 0.856 | 0.364 | 0.231 |

Top-to-bottom ratio: 2.0 at pitch 45, 3.7 at pitch 60.

### Tiles wanted (replica of `loadVisibleTiles`, centre 13.4 / 52.389) [M]
| OSM zoom | Pitch 0, bearing 0 | Pitch 0, bearing 200 | Pitch 60, bearing 0 | Pitch 60, bearing 200 |
| --- | --- | --- | --- | --- |
| 16 | 24 | 42 | 156 | 169 |
| 17 | 6 | 16 | 49 | 42 |
| 18 | 6 | 6 | 16 | 16 |

Pitch 60 costs 6.5 times the tiles at zoom 16 and 8 times at zoom 17 (bearing 0). Requests to the mock API match: 10 new `map.json` requests for the 200/60 camera at zoom 18. The engine knows 16 tiles. The replica matches the engine's own count.

### Not measured by the matrix: the tile cover at pitch 45 with bearing 37, zoom 16 and 17 (not in the table above).

## Part 4: verdict and build plan

### Rotation: what works, what to fix first
Works now: move and rotate by angle at bearing [M], draw and snap [M], pick [M], measure [M], handles [M], stack and menu placement [M], keyboard turn [M], touch turn [R].

Fix first:
1. `engine.ts` `fitTo`: pass `bearing: map.getBearing()` to `fitBounds` and `easeTo` so a selection zoom keeps the turn [M].
2. `url/params.ts`, `url/view.ts`, `MapView.tsx` `handleMoveEnd`: carry bearing (and later pitch) in `map=` and the stored view [R].
3. Control: new compass button in `packages/ui/src/MapControls.tsx` shown in the `ZoomControls.tsx` group, visible only when turned or tilted (see below) [R].
4. Notes and imagery boxes: `module-notes` `notes.tsx` and `module-imagery` `ImageryLayers.tsx` use the view box; under bearing the box grows about 1.4 times [R]. Cap them to the screen's ground box, not the bounds of a turned view.
5. Keep the mouse rotate off until the menu is designed (see decisions).

### Tilt: the same, plus two things pitch adds
1. Rotate tool under pitch: compute the angle in screen pixels (project the pivot and the pointer) instead of on the Mercator plane. `transform.ts` lines 175-185 [M].
2. Horizon and scale: set `maxPitch` on `<Map>` in `MapView.tsx`. Measured top-to-bottom ground ratio 2.0 at 45 and 3.7 at 60. Propose 45 (see decisions).
3. Tile cover: replace `loadVisibleTiles` box with the screen's ground polygon (the four corners of the canvas unprojected, with the far edge clipped to a fixed distance from the centre), and cap the count. Proposal: load only tiles within a fixed radius of the centre, and never more than 2 times the tiles of the pitch-0 view of the same camera. Measured numbers above show the box grows 6.5 times at zoom 16 and 8 times at zoom 17 without a cap.
4. Maps' own pitch maths: nothing else. Labels, plaques and pins are already screen-aligned [R, M].

### The control (tilda-geo, read only)
- The tilda-geo repo, `app/src/components/regionen/pageRegionSlug/Map/MapNavigationButtons.tsx`: a button group with zoom in, zoom out, and a compass ("Nach Norden ausrichten"). The compass shows only when the 3D mode is on (`showCompass={is3dActive}`). A click calls `resetNorthPitch`, which resets bearing and pitch together. There is no separate tilt toggle.
- Its needle uses `compassNeedleTransform.ts`: scale by 1/√cos(pitch), rotateX(pitch), rotateZ(-bearing). The 3D mode, not the camera, decides when it shows. `Map3dTouchRotation.tsx` enables dragRotate, touchPitch and the rotation of touch zoom and keyboard only in 3D mode.
- The URL `map=` takes five parts in 3D mode: `zoom/lat/lng/bearing/pitch`, bearing from -360 to 360, pitch from 0 to 85 (`mapParam.ts`). Pitch is capped at 60 by MapLibre's default [I]: no `maxPitch` is set in the app.

Maid's version: a compass in the zoom group under "+" and "−", same look as `ControlButton`. Shown only when the bearing or pitch is not zero (listen to the map's `rotate`, `pitch` and `move` events). The needle uses tilda's transform, so it rotates with the bearing and squashes with the pitch. A click calls `resetNorthPitch` with an animation. Tooltip "Reset north and tilt", shortcut N (free today [R]). MapLibre's own NavigationControl does not fit: it always shows and only resets on click [R].

### Gestures and the editor's right-click menu
- Right-drag and Ctrl-drag in MapLibre turn and tilt [R]. Both collide with the menu: `MapView.tsx` `handleContextMenu` opens the menu on the contextmenu event, and Chrome fires it on release after a right drag [I]. Ctrl-click is the Mac right click (`handleMouseDown` ignores it [R]).
- If the mouse turn is enabled later: suppress the menu when the pointer moved more than 4 px between the press and the contextmenu event, and keep Ctrl-drag off on Mac [I].
- Keyboard Shift+arrows and touch two-finger already work [M, R].

### The URL
- Proposal: `map=zoom/lat/lng` plus optional `/bearing/pitch`, the same order as tilda-geo, both omitted when zero. iD reads the first three parts [I, not checked in `.reference/id`]. Maid's `parseAsCamera` in `url/params.ts` already reads three parts; extend it to five.
- Rapid's order is `zoom/lat/lon/angle` with the angle negated, so Rapid links will need a conversion.

### Checks to add
Run these again at 37 / 45 (a turned and tilted camera):
- `interactions-check.ts`: the move (M) checks, the rotate (R) checks, the draw-line checks (key 2), the node drag and snap checks, and the midpoint handle check. Each run is about a minute, so a turned pass adds about a minute.
- Add a dedicated tilt check for the rotate-tool angle at pitch 45 (the current failure, 35°), the tile count, and the fitTo bearing.

### Build steps (one agent each; parallel where marked)
1. Fix `fitTo` to keep the bearing. Files: `packages/renderer/src/engine.ts`. Check: probe of the bearing after fit (37 stays 37).
2. URL and stored view with bearing and pitch. Files: `apps/maid/src/url/params.ts`, `url/view.ts`, `apps/maid/src/components/MapView.tsx`. Check: `params.test.ts` and `view.test.ts` round trip. (parallel with 1 and 3)
3. Compass control. Files: `packages/ui/src/MapControls.tsx`, `apps/maid/src/components/ZoomControls.tsx`, `useShortcuts.ts` (N). Check: new browser check at 37/45 (needle, reset, hidden at 0/0). (parallel with 1 and 2)
4. Rotate tool angle in screen pixels. Files: `packages/renderer/src/transform.ts`. Check: e2 at 0/45 and 200/60 under 2°. (parallel)
5. Tile cover and cap. Files: `packages/renderer/src/engine.ts` `loadVisibleTiles`, `tile-loading.ts`. Check: tile counts table above, no more than 2 times the pitch-0 count at zoom 16 and 17. (after 1)
6. Maximum pitch and horizon. Files: `apps/maid/src/components/MapView.tsx`. Check: ground ratio table at the chosen maximum. (after 5)
7. Notes and imagery boxes. Files: `packages/module-notes/src/notes.tsx`, `packages/module-imagery/src/ImageryLayers.tsx`. Check: request size at 37/45. (parallel)
8. Turned and tilted checks in `interactions-check.ts` and a new tilt check. Check: runs green at 37/45. (last)

### Decisions for the owner
1. **Rotation only, or rotation and tilt together.** Option A: rotation first (steps 1 to 4), tilt after the tile cap (5 to 6). Option B: both now. Recommend A: rotation is already exact; tilt needs the tile cap and the rotate fix.
2. **Maximum pitch.** Options 30, 45, 60 (MapLibre default). Recommend 45: the top-to-bottom ground ratio is 2.0 at 45 against 3.7 at 60, and the tile count at zoom 16 grows less. Measure 30 and 45 at zoom 16 before fixing.
3. **Labels and pins upright or turning.** Recommend: plaques and pins upright on screen (already so, same as Rapid); street labels follow the road (already so).
4. **Store bearing and pitch.** Recommend: in the URL when not zero, and in the stored view. A start from a link keeps its turn; a start with no link starts north-up when the stored view is zero.
5. **Mouse turn and tilt (right-drag, Ctrl-drag).** Recommend off for now: it collides with the menu. Use the compass, Shift+arrows and touch.
6. **Shift+arrow steps.** Measured 15° per press (MapLibre) against Rapid's 2.5°. Recommend keep MapLibre's steps and document them, or set 2.5° by a custom handler.
7. **Compass shortcut.** Recommend N.
8. **Snap and pick in pixels, or in metres.** Recommend pixels (what the user sees); document that at a tilt the ground size of a snap differs by about 2 times between the top and bottom.

## Not checked
- Two-finger twist and pinch (touch rotate and pitch): read from defaults, not run in a browser.
- The a4 failure at 37/0 and the b drag at 0/45 with Alt (80 px off): causes not found.
- The rotate tool at 37/45 (no building of the right size on screen).
- The midpoint handle and the menu in the final batch (the earlier batch and the probe are the evidence).
- The selected-width screenshot, and oneway arrows by eye.
- Tile counts at pitch 45 and bearing 37 at OSM zoom 16 and 17.
- Request counts for notes and imagery (not captured in the runs; read from code).
- iD's parser for a five-part `map=` (inferred).
- Rapid and tilda-geo behaviour: from code reading only, not run.
- The external `street-imagery-react` `useMapViewportBbox` (read from the installed package, not run).
- Time of `interactions-check.ts` (estimate only).
- Nothing built, nothing committed, nothing changed in any repository other than this file.
