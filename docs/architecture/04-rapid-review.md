# Rapid 3 as a model: structure, services, workers

Status: review of `bhousel/Rapid` at `413c0519f` (2026-10-11), read from the code; nothing was run. File references are relative to `modules/` in that repository (`.reference/rapid/modules`).

Tobias's impression is that Rapid's structure is much better than iD's and should be the model. The review agrees with the direction and finds things to leave behind.

## How Rapid is organised

Rapid has a `Context` that holds two kinds of parts:

- **Systems** (23): long-lived parts of the editor. `editor` (history and undo), `filters`, `gfx` (Pixi), `imagery`, `l10n`, `map`, `network`, `photos`, `scheduler`, `settings`, `schema`, `spatial`, `storage`, `styles`, `ui`, `uploader`, `urlhash`, `validator`, `worker`, and a few more.
- **Services** (19): clients for the outside world. `osm`, `mapillary`, `kartaview`, `maproulette`, `osmose`, `nominatim`, `taginfo`, `wikidata`, and so on.

Every system has the same **life cycle**: constructed, then `initAsync`, `startAsync`, and `resetAsync` (`core/AbstractSystem.ts`). Each is an event emitter and can be paused.

Both kinds are listed in **registries**: `systems.available` and `services.available` are maps from a name to a class (`core/index.ts`, `services/index.ts`). A fork can replace or add an entry before the context is created.

Compared with iD: iD's `context` is one 644-line closure with about 93 members, and its services are a literal object that modules import directly.

## Worth copying

1. **The life-cycle phases.** Construct, init, start, reset, with pause. A fork's config and its modules fit between the phases, and "reset" gives tests and scene switches a clean way to start over.
2. **Systems and services as two named kinds**, each with a registry. It answers "where does this go" for every new piece.
3. **Styles, rulesets and schema as mergeable data.** A file is merged by id, `null` deletes an entry, wildcards work for deleting. That makes a fork's change a small data file. See [styles and lenses](07-styles-and-lenses.md).
4. **Tag classification as data** (rulesets with variables and matchers: `=`, `exists`, `in`, `~`). The same idea as Maid's generated rules, with a nicer authoring format. A natural format for [filters](06-filters.md) as well.
5. **Three separate jobs for background work**: a scheduler decides *when* (frame budget, three priorities), a worker system decides *where* (pool of workers), a network system does the I/O (deduplication, abort, timeouts). Callers do not care whether a fetch-and-parse ran in a worker.
6. **A spatial index kept in sync from differences** ([data store](05-data-store.md)).
7. **A base graph plus local edits, rebased when new data arrives**, so downloads do not disturb edits ([data store](05-data-store.md)).
8. **Versioned settings with migrations** ([storage and settings](09-storage-and-settings.md)).

## Not worth copying

1. **Global registries.** The maps live at module level, so they are shared by everything on the page and are not typed. Maid's registries hang off the editor instance and are typed.
2. **Systems reaching into each other.** About 1,960 `systems.x` accesses, many with non-null assertions; 104 files use `as any`. Declared dependencies are not always awaited: `MapSystem` lists `editor` as required and never waits for it, which works only because everything starts at once. In Maid a part gets what it needs passed in, and the order is checked.
3. **The whole history as one JSON document in localStorage**, rewritten a second after each edit. iD is ahead here (IndexedDB), and Maid should go further ([storage and settings](09-storage-and-settings.md)).
4. **"Immutable" by convention.** Entities are documented as immutable and are changed in place in some spots (`touch()` on shared entities); the graph is described as transactional and is mutable.
5. **No registry for URL parameters.** About 25 keys are read and written as free strings. Maid's are typed parsers in one place ([URL state](08-url-state.md)).
6. **Feature filters as code.** Sixteen predicates in a constructor. Maid's are data in the config.

Some comments and docs in Rapid describe an earlier state (the scheduler header, a build comment, a reset that is documented to stop workers and does not). Read the code, not the comments.

## Background workers

### What Rapid does

- A pool of two module workers, started when first needed.
- In the worker: fetch and parse (OSM API tiles, vector tiles). Results come back by structured clone; no transferable buffers are used.
- On the main thread: every write, validation, the spatial index, label rasterising.
- The worker is a separate build entry. Its URL is derived from the script's own URL at run time, with a shim for cross-origin hosting.
- **No measured benefit is recorded** anywhere in the repository: the commits describe the motivation, the only number is "about 11 ms per tile" for building entities.

### Does Maid want this?

**Not for fetching and parsing, on today's numbers.** Parsing twelve API tiles of the dense scene takes about 30 ms in total on the main thread, spread over the tiles. Moving it to a worker adds a structured clone of the result back to the main thread, which costs about as much as the parse it saves. MapLibre already does the heavy part of rendering in its own workers.

**Yes for long jobs**, when they exist: validation of the loaded area (seconds in iD and Rapid), import of large files, anything over a frame or two that is not tied to the next paint. See [Rust and WASM](11-rust-wasm.md) for the candidates.

### Does it add complexity in Vite?

Less than in Rapid's own build:

- `new Worker(new URL('./validate.worker.ts', import.meta.url), { type: 'module' })` is all Vite needs. It bundles the worker, shares code with the main bundle and resolves the URL. Rapid's run-time URL detection and cross-origin shim are not needed. Maid already loads MapLibre's worker this way.
- What stays hard is not the build: worker code must not import anything that touches the DOM or the editor instance, and the data has to be copied in and out. That calls for a small rule and a lint check, not for infrastructure.

Proposal: no worker system up front. A tiny helper for "run this function in a worker and give me a promise, with cancel" when the first long job arrives, and Rapid's scheduler idea (do idle work inside a frame budget) for things that have to stay on the main thread.

## Tests in Rapid

192 test files, about 3,400 test cases, run with `bun test`; UI-facing ones run under happy-dom. A `headless` entry exports actions, data, lib, validators and most systems without the UI, and a `MockContext` starts with no systems. There is a benchmark suite on canned Tokyo data that is not wired into scripts or CI. For Maid: the test cases for actions and the graph are worth porting together with the code they test.
