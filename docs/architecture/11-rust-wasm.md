# Rust and WebAssembly: where it could help

Status: assessment, 2026-10-11. No Rust has been written for Maid. Based on the measurements from iteration 1 and on the team's `rust-wasm-geo` skill, whose rule is: **profile first; move to WASM when JavaScript blocks the main thread for more than about 100 ms, or for thousands of features and repeated geometry work.**

## Where Maid's time goes today

Loading the dense scene (51k nodes, twelve API tiles, 11.7 MB of JSON) takes 1.4 to 2.2 s until the picture is final. Maid's own JavaScript in that:

| Step | Time |
| --- | ---: |
| Parse the JSON | about 30 ms |
| Merge into the store | about 20 ms |
| Build features, including tag classification and style lookup | about 110 to 130 ms |
| **Total** | **about 160 ms**, spread over twelve tiles |

The rest, about a second, is MapLibre: tiling, building buckets, placing symbols. MapLibre is JavaScript and WebGL; we do not get to rewrite its worker in Rust.

So for what Maid does today, Rust would speed up a tenth of the load. **Not worth it yet.** The parts below are where that changes.

## Candidates, by expected value

| Candidate | Why it could pay | When to look | Crates (from the skill) |
| --- | --- | --- | --- |
| **Validation over the whole loaded area** | iD and Rapid run it in idle time for 5 to 25 s on our larger scenes. Rules are per-object checks plus spatial queries: crossing ways, almost-junctions, disconnected ways. Batch work over tens of thousands of objects | When validation is ported. The best first candidate | `geo`, `rstar` |
| **Spatial index and "what is near this"** | Snapping while drawing and dragging, crossing detection, hit-testing beyond what MapLibre renders. Called on every pointer move | When drawing and snapping are built, and only if a JavaScript R-tree (`rbush`, `flatbush`) shows up in profiles. They are fast; this is not a given | `rstar` |
| **Geometry operations on big selections** | Orthogonalise, circularise, simplify, offset, merge and split areas, multipolygon assembly on large relations | Per operation, when one is slow on real data. Most act on one object and are fine in JavaScript | `geo`, `i_overlay` for polygon booleans |
| **Parsing OSM data** | Only for bulk: opening a `.osm.pbf` or a large `.osm` file, offline extracts. `JSON.parse` of an API tile is native code already and will not be beaten | If file import or offline areas become features | `osm-reader` |
| **Routing along the network** | "Follow this road", route relations, snapping a trace | With such a feature. `osm-route-snapper` in osm-editor-kit is already Rust for this | `fast_paths`, `route-snapper-graph` |
| **Conflict detection and three-way merge on upload** | Graph work, rarely large | Unlikely to need it | |
| **Feature building for the map** | 110 ms per dense load today | No: the result has to cross back into JavaScript as GeoJSON for MapLibre, and that copy eats the gain | |
| **Tag classification and style lookup** | String matching against a few hundred rules | No: cached per tag combination, it is already cheap | |

## What decides whether a candidate works

- **The boundary.** Data crosses between JavaScript and WASM as strings or bytes, and crossing costs. Work that needs the whole graph on the Rust side means keeping a second copy of the graph there and feeding it every edit. That is a real architectural commitment and the main reason not to start casually.
- **Where the truth lives.** The skill's rule is durable compute state in Rust, UI state in React. For Maid the graph is the truth and it lives in TypeScript (it has to: undo, the inspector and the renderer read it constantly). A Rust index would be a derived copy, rebuilt or patched on change.
- **A worker either way.** Anything that takes more than a few milliseconds should not run on the main thread. A JavaScript worker gets most of the benefit for long jobs; Rust adds speed inside it.

## How to test a candidate

One procedure, the same every time:

1. **Write the task as a benchmark in TypeScript first**, on the fixtures: `small`, `medium`, `dense`, and a synthetic scene of 500k nodes (the generator is still to be built).
2. **Measure** median and p95 of the pure computation with `bun test`'s bench or a small script, and the main-thread blocking in the app with the existing harness (long tasks, frame times).
3. **Decide by the skill's threshold:** under 100 ms of blocking on the dense scene, stop. It stays TypeScript, in a worker if it is over a frame.
4. If it is over: **write the Rust version behind the same function signature**, with the logic in a plain Rust module that is tested without WASM, and one `wasm.ts` file as the only place that imports the build.
5. **Measure again, including the crossing**: time from the JavaScript call to the JavaScript result, not the time inside Rust.
6. **Keep the TypeScript version** as the reference implementation and run both against the same test cases, so results are checked against each other.
7. Record the numbers in a decision record, whichever way it went.

## Cost to the project

- A second toolchain (Rust, `wasm-pack`) for every contributor and in CI, and a build step before the app runs.
- A `.wasm` file in every fork's bundle.
- Fewer people who can change that code.

That cost is paid once, with the first crate. It should be paid for something that clearly needs it. Validation is the likeliest.

## Open

- Whether validation rules can be written so that the same rule runs in TypeScript and is later moved to Rust without changing what a fork's custom rule looks like. A fork's rule will be TypeScript; the engine around it need not be.
