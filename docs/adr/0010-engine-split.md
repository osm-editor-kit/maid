# 0010: `engine.ts` is split into one class per topic

Date: 2026-10-14. Follows the first pass of 2026-10-13 (the free functions: `pick.ts`, `redraw.ts`, `snap-aim.ts`, `selection-shape.ts`, `channels.ts`, ...).

## Context

`packages/renderer/src/engine.ts` was 2,478 lines in one class. The first pass moved out everything that is a free function. What was left shared private fields, so it could not move as functions.

## Decision

A topic that owns its own state becomes a class in its own file, built by the engine and kept as a readonly property (`engine.sender`, `engine.tiles`, `engine.camera`, ...), the same pattern as `engine.draw` and `engine.transform`. The engine keeps its public API: every method and getter the shell, the modules, the checks and the benchmark call stays on `MaidEngine` as a one-line delegate. No caller changed.

| File | Class | Owns | Lines |
| --- | --- | --- | ---: |
| `sender.ts` | `Sender` | The update channels of every source and tier, the live tier (`live`, `editing`), one update per source at a time, compaction, `settled()` | 309 |
| `tile-loader.ts` | `TileLoader` | Tile requests, their wake timer, the rate-limit pause, `inflight`, `firstLoadDone`, relation and entity loads | 266 |
| `presets-hold.ts` | `PresetsHold` | Points and vertices held for late presets, and the fill-in of icons afterwards | 182 |
| `midpoint-handles.ts` | `MidpointHandles` | The handles in the middle of a selected way's segments, and a press on one | 165 |
| `drag.ts` | `DragTool` | The dragged node, the latest-move-wins loop, what it is aimed at, the drop and its one undo step | 161 |
| `measure-session.ts` | `MeasureSession` | A measure under way: callback, first click, pointer, the magnifier's own subscription | 133 |
| `camera.ts` | `Camera` | Turning with mouse and keys, `fitTo` | 111 |
| `tag-edits.ts` | `TagEdits` | `changeTags`, `changeTagsEach`, `setTagsEach`, `setTag`, `combinedTagsOf` | 115 |
| `clipboard.ts` | `Clipboard` | What was copied, and the paste | 66 |

`engine.ts` went from 2,478 to about 1,460 lines.

### The rule for what goes where

- A class owns **fields** that no other topic writes. A field two topics write stays where the writer with more of the logic is, and the other reaches it through the owner's public member (`tiles.inflight` and `tiles.firstLoadDone` are read by the sender and the engine; `sender.live` is read by the engine's `push`).
- A class that works on the engine's data and edits (`DragTool`, `TagEdits`, `Clipboard`) takes the engine, as `DrawTool` and `TransformTool` already do, and uses only its public members. For that, `changed()` and `handles` became public.
- A class that is mostly bookkeeping (`Sender`, `TileLoader`, `PresetsHold`, `MidpointHandles`, `MeasureSession`, `Camera`) takes a small host interface of the few callbacks it needs (`SenderHost`, `TileHost`, ...). It does not know the engine's type, so it can be read and tested alone.
- No events and no pub-sub: every call into the engine is a direct callback, closed over once in the constructor.

### What stays in `engine.ts`, and why

- **Hover, selection, related, highlight source, field overlay, operation preview** (`setHover`, `setSelected`, `applyHighlight`, `syncRelated`, `pushHighlight`, `refreshShape`, `setFieldOverlay`, `previewOperation`). This is the hub: one change of the selection touches the selection source, the active pin, feature state in two tiers, the related halo, the shape points, the midpoints, the field overlay and the highlight source, and a batch that arrives (`push`) and a redraw (`redrawDifferences`) have to ask it back. Cutting it would need a host interface as wide as the class. It is the next candidate if the engine is split again; the right first step is to make the selection state its own small object that the others read.
- **Change, undo/redo, `edit`, `redraw`, `removeFeatures`, `sendBatch`, `rebuildAll`, filters, lens, mode, `runOperation`.** They are the engine's core: all of the above call `change()` and read the graph it redraws. The tools (`DragTool`, `TagEdits`, `Clipboard`, `DrawTool`, `TransformTool`) already call into them from outside.
- **`merge`, `push`, `pushSelect`, `pushActive`, `syncActive`, `syncSelectTier`.** They are the sender's input, but they decide per feature using the selection, hover, related and the feature-to-source map. The queues they fill belong to the sender; the decision does not.
- **`debugState()`.** It reads every part, so it stays at the top.

## Performance rule

- Hot paths stay imperative and allocation free. Moving code did not add an allocation in a per-frame or per-pointer-move path.
- The only change on a hot path is **one extra method call** per pointer move: `engine.dragTo`, `moveTurn`, `measureMove`, `midpointAt` now forward to a class. V8 inlines these. Nothing was added inside a loop.
- The loops that matter are untouched: the flush of the channels, the compaction snapshot, the drag's latest-move-wins loop, and `push`'s per-feature loop are the same code, with `this.sender.` or `this.host.` in front of a field.
- The code was moved by cut and paste; comments that explain a MapLibre quirk or a performance reason went with their code.
- Checked: unit tests (renderer 343 pass, repo 5323 before and 5358 pass after, the difference being tests other agents added), type-check, lint, and `check-all` for the maid and parking apps (interactions 159, all green). **The benchmark was not run here**; Tobias runs it on a quiet machine before and after. Edit latency (12 to 15 ms) and the time-to-settled are what to compare.

## Alternatives rejected

- **Mixins or several files that all extend one base class.** The state would stay one pile of private fields; only the line count would move.
- **An event bus between the parts.** An indirection with an allocation per event on the paths that run per pointer move; a direct callback does the same.
- **Splitting the hub as well, now.** The boundary is not real yet (see above); a forced one would add a host interface wider than the code behind it.
- **Changing the callers to use the parts** (`engine.sender.settled()` in the shell). The shell, modules and checks use the engine as one object, and the benchmark's `window.__bench` contract names the engine's methods. The parts are public properties for those who want them, but no caller was changed.

## Measured (2026-10-14)

Maid alone, three scenes, five repetitions each, the same setup before (`*-engine-before`, at a104741) and after
(`*-engine-after2`, which also contains the junction sketch and the crossing-ways index of the same afternoon). Medians
in ms, before → after:

| Scene | drawn | settled | load CPU | pan settle | zoom-in settle | zoom-out settle | tag edit | drag |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| small | 1027 → 820 | 1160 → 908 | 696 → 477 | 126 → 124 | 272 → 352 | 469 → 455 | 16.7 → 16.7 | 16.7 → 16.7 |
| medium | 1141 → 1080 | 1239 → 1173 | 777 → 723 | 166 → 172 | 203 → 277 | 598 → 648 | 16.7 → 16.7 | 16.7 → 16.7 |
| dense | 1118 → 1059 | 1196 → 1156 | 759 → 798 | 178 → 175 | 323 → 313 | 780 → 788 | 16.7 → 16.7 | 16.7 → 16.7 |

Edit latency and drag are one frame in both. Zoom-in settle spreads from about 190 to 390 ms within each run (five
repetitions), more than the difference between the medians, so the split shows no measurable cost. A later quiet run
with more repetitions should confirm medium zoom-in.
