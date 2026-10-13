# Shell package plan

Status: planning, 2026-10-13. Read-only: nothing was moved, edited or run in a browser. About 40 files under `apps/maid/src` and `packages/` have uncommitted edits, so counts are a snapshot. Counts were measured (`wc`, `stat`, `grep`, `git status`). Statements marked (inferred) come from reading code, not from running it.

Decision this plans for: `docs/adr/0009-decisions-of-2026-10-13.md` (the paragraph "The apps") and `docs/architecture/02-fork-model.md`. The open step is in `docs/build-out/steps.md`, "The module system".

## What was built (2026-10-13)

Steps 0 to 4 are in. Steps 5 and 6 are open. The plan below is kept as it was written; where the build differs, this section says so.

- `mountEditor(root, app)` (`packages/shell/src/mount.tsx`) makes the editor from an app's config and renders it into `root`. It returns a function that unmounts it. `createShell(app)` (`packages/shell/src/shell.ts`) makes the parts: editor, engine, login and journal. `ShellContext` (`shell-context.ts`) hands them to the components, and `useShell()` reads them.
- `AppConfig` (`packages/shell/src/shell.ts`): `editor: (config: Config) => EditorConfig` is the one required field (modules, presets, filters). The others are optional: `id` (default `'maid'`, names the journal and the login per app), `brand` (name and detail in the top bar), `osm` (development client id, login origin, env file) and `visitBackground` (for a `background=custom:` link).
- `packages/shell/src/index.ts` exports `mountEditor`, the types `AppConfig` and `Config`, and the built-in modules `elementInfo`, `relations`, `sceneBounds` and `validation`.
- Commits: steps 0 to 2 (barrel, styles and public files, the bulk move of 82 files) are in 5251d50, whose message names only operations; the renames are there. a1eb73e holds the config and entry of `apps/maid`, with two late-bound holders for the config and the engine. Step 3 (one app argument instead of singletons) and step 4 (`apps/maid-bicycle` on port 5176, dev scripts, ports) are in a383355, which removed the holders.

Deviations from the plan:

- No `createApp` and no `AppProvider`. `mountEditor(root, app)` and `ShellContext` do that job. The app config is in `shell.ts`, not in a new `app.ts`.
- `created_by` is still "Maid 0.0.0" for both apps.
- The six settings stores keep fixed names. Two apps on different ports are different origins, so they do not collide; two apps on one origin would.
- Steps 5 and 6 are open: `--app` for the checks and `check-all --app`, the contract tests per module, the dev-only `?modules=` harness and `check-config`. Until step 5 the browser checks run against `apps/maid` only.

## Summary

- Move the shell (App, components, hooks, auth, save, journal wiring, URL, built-in modules, bench handle) from `apps/maid/src` to `packages/shell`. One bulk step moves 71 files, about 7,760 lines, with `git mv`.
- Pass the config as (a): `createApp(config)` and one React context. 29 files are touched: 16 mechanical, 10 by hand, 2 rewritten (`main.tsx`, `editor.ts`), 1 import path.
- Package: `@osm-editor-kit/maid-shell` in `packages/shell`.
- Steps 0 to 6, each green. Steps 2 and 3 need a committed, quiet `apps/maid/src`.
- Three test levels: types (already tested in core), a contract test per module, and `bun run check-config` over a matrix that uses a dev-only `?modules=` harness.
- Eight questions for the owner (section 8).

## 1. Inventory of apps/maid

Counts are lines from `wc -l`, measured. Asset counts are bytes; the `.pbf` and `.svg` files are binary or one-line.

| Group | Files | Lines | Decision |
| --- | --- | --- | --- |
| SHELL code | 50 | 5,544 | moves to `packages/shell/src` |
| SHELL tests | 21 | 2,178 | moves with its code |
| SPLIT | 3 | 158 | `config.ts`, `editor.ts`, `index.css`: see below |
| HARNESS | 1 | 73 | `sheet-harness.tsx`: dev only, moves |
| APP | 10 | 307 | stays: config, entry, env, Vite, package |
| ASSET | 10 | 1.15 MB | `public/` moves to `packages/shell/public`, shared |

Every file, by folder (lines in brackets; SHELL unless marked):

- `src/` top level, code (17): App 78, auth 99, bench 57, command-icons 26, commands 125, drawing 45, favourites 137, favourites-keys 112, field-overlay 112, imagery-used 14, images 135, journal 149, measure-tags 25, platform 15, reference 305, selection 20, stack 71.
- `src/` top level, tests (12): favourites-keys 193, favourites 132, field-overlay 106, measure-tags 51, reference 235, stack 80, and six `id-*.test.ts` (95 in all).
- `src/components/` (19): BottomDock 55, FavouriteHint 95, FilterButton 108, Inspector 250, MapContextMenu 72, MapNotices 27, MapView 493, ModeButtons 66, Operations 18, PresetIcon 14, RestoreChanges 70, RestorePrompt 90, SaveButton 219, StackPicker 160, TopBarPanels 30, UndoRedo 30, UserButton 83, ZoomControls 24, useShortcuts 137.
- `src/url/` (5 code, 4 tests): id-url 125, params 82, shown 43, state 19, view 44; tests 47, 49, 103, 61.
- `src/save/` (4 code, 4 tests): blocked 42, clean-tags 66, osm-change 134, save 52; tests 87, 97, 35, 207.
- `src/modules/` built-in (5 code, 1 test): relations 689, relations-logic 363, validation 208, element-info 68, scene-bounds 43; test relations-logic 600.
- APP: `maid.config.ts` 94, `main.tsx` 24, `preset-changes.example.ts` 42 and its test 56, `vite-env.d.ts` 1. Root: `index.html` 13, `vite.config.ts` 13, `package.json` 51, `.env.example` 9, `.env.local` 4 (git-ignored; only key names were read).
- HARNESS: `sheet-harness.tsx` 73, loaded only with `?harness=tags`.
- SPLIT:
  - `config.ts` 77: `readConfig` and `Config` are runtime settings read from the URL: shell. The defaults (`scene` small, `minDataZoom` 16, `workers` 4) are app choices.
  - `editor.ts` 57: the instances (section 2) are shell. The call `editorConfig(config)` that supplies the modules is app.
  - `index.css` 24: `@import tailwindcss`, the dark variant and `body` rules are shell. Each app adds its own `@source` lines.
- ASSET `public/`: `sprites/` 5 SVG, 994 KB (`/sprites/...`, used by `images.ts` and `PresetIcon.tsx`); `fonts/Open Sans Semibold/` 3 `.pbf` (MapView glyphs at `/fonts/{fontstack}/{range}.pbf`); `land.html` 17 (the OAuth popup lands here); `frame-sync.js` 69 (a plain script in every host page).

## 2. Module-level instances and how the shell gets its config

### 2.1 What exists at import time

Importer counts are code files, measured by grep. 26 files import from `editor.ts`: 16 use `editor`, 14 use `engine`, 12 use `useEngine`, 8 use `config`.

| Instance | Created at import in | Importers | What happens at import |
| --- | --- | --- | --- |
| `config` (`readConfig(location)`) | `editor.ts` | 8 | reads the URL before any mount |
| `editor` (`createEditor(editorConfig(config))`) | `editor.ts` | 16 | runs every module's setup |
| `engine` (`MaidEngine`, fetch = `editor.fetch`) | `editor.ts` | 14 | |
| `migrateIdHash`, `connectLenses(engine)` | `editor.ts` | 1 | rewrites the URL; subscribes the lens store |
| `filtersStart`, `normalizeFilters` | `editor.ts` | 1 | reads the stored filter setting |
| `journal` (`createJournal`) and `void check()` | `journal.ts` | 4 | starts an IndexedDB check |
| auth state (`unavailable()`, `storedUser()`) | `auth.ts` | 3 | reads `location` and `localStorage` |
| favourites `engine.subscribe(...)` | `favourites.ts` | 5 | a subscription |
| presets, `BBOX` | `maid.config.ts` | 1 | `createPresets(...)` |
| `initTheme`, `setWorkerUrl`, `createRoot` | `main.tsx` | entry | |
| `window.__bench`, `window.__maid` | `bench.ts`, called from `MapView` | 1 | the only writes to `window` |
| holders and caches: `MAC`, stack, reference, images | their files | 3, 5, 1, 2 | no editor in them |
| package stores, fixed persist names: `maid:settings` (ui), `maid:notes`, `maid:lenses`, `maid:street-imagery`, `maid:data-layers`, `maid:imagery` | the packages | the shell and modules | no option below changes these |

Usage lines outside tests and `editor.ts` (measured): 40 use `editor.`, 151 use `engine.`, 25 use `config.`.

### 2.2 The three options

| | (a) `createApp(config)` and one context | (b) late-bound holder | (c) Vite virtual module |
| --- | --- | --- | --- |
| How | `mountEditor` calls `createApp`; instances go into a React context; non-React code gets them as arguments | `mountEditor` fills a holder before first render; accessors exported | the package imports `virtual:maid-app`, filled by Vite per app |
| Files changed | 29 (section 2.3) | the 26 importers plus `auth.ts`; the 216 usage lines become holder reads | about 3: the package file and two `vite.config.ts` |
| Import-time work | none in the shell; journal, auth, favourites start in `createApp` | still at import unless made lazy | still at import |
| Two editors per page | possible for editor and engine; package stores stay singletons | no | no |
| Tests | `createApp` per test; no shared shell state | one holder shared by all tests | each test needs a stub |
| Config matrix (`?modules=`) | a second `mountEditor` | impossible without a reload | a second build |
| React Compiler | context and hooks: no issue | a module-level `let` cannot be reassigned (repo convention: `stack.ts` keeps state in an object for this); readers must not cache | no issue |
| Magic | none | the order of mount matters | a name that exists only under Vite |

(b) is not the small diff it looks like: a holder cannot be imported as a live binding, so each of the 216 usage lines changes.

### 2.3 Recommendation: (a)

Only (a) runs more than one config per process without a reload, which the matrix and the contract tests need. Its diff is larger than (c) but mostly mechanical. (a) does not give two editors per page, because the package stores stay singletons. Document one editor per page; revisit with store factories if ever needed.

API sketch, `packages/shell/src/app.ts`:

```ts
export type Runtime = Config              // config.ts today: read from the URL by the shell
export type AppConfig = {
  id: string                              // 'maid' | 'maid-bicycle'
  brand: { name: string; detail: string }
  createdBy: string                       // changeset tag; today `Maid ${version}`
  osm: { devClientId?: string; loginOrigin: string }
  defaults?: { scene?: string; minDataZoom?: number }
  presets: Presets
  filters: readonly Filter[]
  modules: (runtime: Runtime) => MaidModule[]
}
export function createApp(app: AppConfig, runtime: Runtime): MaidApp   // { config, editor, engine, ... }
export function AppProvider(props: { app: MaidApp; children: ReactNode }): ReactElement
export function useApp(): MaidApp
export function useEditor(): Editor
export function useEngine<T>(read: (engine: MaidEngine, version: number) => T): T   // as today
```

Non-React code gets its instance as a parameter: `drawClick(app, select, kind, point, layers)`, `imageryOnMap(editor)`, `watchFavourites(engine)`, `createJournal(editor, name)`.

Files changed for (a):

- 16 mechanical (one import line and `const { editor, engine } = useApp()` in the function): App, BottomDock, FavouriteHint, Inspector, MapContextMenu, MapNotices, MapView, ModeButtons, RestoreChanges, SaveButton, StackPicker, TopBarPanels, UndoRedo, useShortcuts, relations, sheet-harness.
- 9 importers by hand: `bench` (editor as argument), `commands` (`protectedBy` is a plain function), `drawing`, `favourites` (the subscription moves into a function), `imagery-used`, `journal` (a factory; `void check()` moves into it), `save/save`, `selection`, `FilterButton` (`normalizeFilters` takes the editor).
- 1 by hand, not an importer: `auth.ts` (state becomes lazy).
- 2 rewritten: `main.tsx` (calls `mountEditor`), `editor.ts` (becomes `app.ts`). 1 import path: `maid.config.ts`.

### 2.4 `window.__maid` and `window.__bench` afterwards

- `window.__bench`: the same `BenchApi` (`tools/refs/bench-api.d.ts`). No method changes; `editor: 'maid'` stays for both apps.
- `window.__maid`: `{ app, map, engine, editor, model, journalFlushed, notify }`. The same keys plus `app` (the `AppConfig.id`). Each value belongs to the page's one app instance. `tools/bench/maid-window.d.ts` gets the new field.
- `window.__sheet` (harness only): unchanged.

## 3. The package

### 3.1 Name

`packages/shell`, package `@osm-editor-kit/maid-shell`.

- `packages/app` is out: `apps/maid/package.json` is already `@osm-editor-kit/maid-app`.
- `packages/core` is headless and does not use the word.
- `packages/ui` does: its README line 1 reads "The editor's shell as React components". Reword it in step 0 to "The components the shell is built from". ui keeps the components.
- The ADR and `steps.md` already say "the shell". Fallback: `packages/host` (`@osm-editor-kit/maid-host`).

### 3.2 Dependencies

Static imports measured across the shell files: `maid-ui` 25 files, `react` 14, `maid-core` 12, `maid-renderer` 9, `maid-model` 7, `@heroicons/react` 7, `maplibre-gl` 4, `maid-presets` 4, `react-map-gl` 3, `nuqs` 3, `maid-validation` 3, and once each `maid-journal`, `maid-filters`, `maid-style`, `maid-operations`, `zod`, `@tanstack/react-hotkeys`. Also `maid-module-lenses` (`editor.ts`), `maid-module-notes` and `maid-module-street-imagery` (`MapView.tsx`, for `NOTES_LAYER_IDS` and `streetImageryClick`), `osm-api` (a dynamic import in `auth.ts`) and `react-dom` (for `mountEditor`). So the shell still depends on two modules; moving their click routing into the modules is later work (inferred).

After the move `apps/maid` keeps: `maid-shell`, the modules in `maid.config.ts`, `maid-filters`, `maid-presets`, `maid-operations`, `maid-renderer`, `maid-validation`, `maid-core` (type), `maid-ui`, `maplibre-gl`, `react-dom`, and the Vite tooling. Declared there but not imported from its `src` (0 hits): `@tanstack/react-query`, `tailwind-merge`. Drop them in step 3 (inferred: unused).

### 3.3 Public API

`packages/shell/package.json` exports `.` (barrel), `./styles.css`, and `./harness` (dev only, so production does not carry `TagHarness`).

```ts
export function mountEditor(root: HTMLElement, app: AppConfig): () => void   // returns unmount
export type { AppConfig, Runtime, MaidApp } from './app.ts'
export { createApp, AppProvider, useApp, useEditor, useEngine } from './app.ts'
export { defineModule, type MaidModule, type Editor } from '@osm-editor-kit/maid-core'
export { elementInfo, relations, validation, sceneBounds } from './modules/...'  // built-ins the app switches on
export { MAC, modKey, useStack } from ...                                          // helpers for app modules
```

An app imports from `@osm-editor-kit/maid-shell` only, never from the shell's internals.

### 3.4 Config fields: today and new home

| Field | Today | Kind | New home |
| --- | --- | --- | --- |
| `scene` (`scene=`, default small) | URL | runtime | `Runtime`; app sets `defaults.scene` |
| `live` (`live=0/1/dev`) | URL; off under automation | runtime | `Runtime` |
| `dev`, `apiUrl` | derived: DEV_API, OSM, or the mock `localhost:8090/s/<scene>` | runtime | `Runtime`; `DEV_API` stays in the shell |
| `fill`, `ui`, `labels`, `icons`, `pins`, `workers`, `tolerance`, `sourceMaxZoom`, `fade` | URL (bench switches) | runtime | `Runtime` |
| `minDataZoom` (default 16) | URL | runtime, app default | `Runtime`; `defaults.minDataZoom` |
| `camera` (`map=`), `filters` (`filters=`, `disable_features`) | URL | runtime | `Runtime`; `AppConfig.filters` is the default |
| module list, presets, `sceneBounds` bbox | `maid.config.ts` | app | `AppConfig.modules(runtime)`, `AppConfig.presets` |
| `VITE_MAPILLARY_TOKEN` | app env | app | `streetImagery({ mapillaryToken })` in `modules` |
| `VITE_OSM_DEV_CLIENT_ID` | app env, read by `auth.ts` | app | `AppConfig.osm.devClientId`; the shell never reads `import.meta.env` |
| login origin `http://127.0.0.1:5173` | hard-coded in `auth.ts` | app | `AppConfig.osm.loginOrigin` |
| brand "Maid", "MapLibre iD Editor" | `App.tsx` | app | `AppConfig.brand` |
| changeset `created_by` `Maid <version>` | `save/osm-change.ts` line 128 | app | `AppConfig.createdBy` |
| notes `apiUrl`, `minZoom` 14 | `maid.config.ts` | app | in `modules(runtime)`, which gets `runtime.apiUrl` |

### 3.5 CSS

- `packages/shell/src/styles.css`: `@import 'tailwindcss'`, `@custom-variant dark`, the `html`/`body` rules, and `@source` for the shell's sources and the module packages the default app uses.
- `apps/maid/src/index.css` becomes `@import '@osm-editor-kit/maid-shell/styles.css'` plus its own `@source` lines.
- Tailwind 4 resolves `@source` relative to the file that holds it. For an imported stylesheet this is inferred; step 1 checks it, and `check-render` shows a wrong path at once.
- `oxfmt.config.mjs` `sortTailwindcss.stylesheet` follows the new file.

### 3.6 Static assets

Recommendation: one shared `publicDir` per app, pointing at the package:

```ts
publicDir: fileURLToPath(new URL('../../packages/shell/public', import.meta.url)),
```

Dev and build behave the same, nothing is copied, nothing goes stale. Rejected: a copy script (stale copies) and a Vite plugin now (an app with its own public files would need one, since Vite takes one `publicDir`; add it then).

| File | Used by | Owner | Source of truth |
| --- | --- | --- | --- |
| `sprites/*.svg` (5, 994 KB) | `images.ts`, `PresetIcon.tsx` | shell | copied from `.reference/id/dist/img` by `tools/refs/copy-sprites.ts`; target moves |
| `fonts/Open Sans Semibold/*.pbf` (3) | MapView glyphs | shell | committed |
| `land.html` | OAuth popup redirect | shell | committed |
| `frame-sync.js` | each app's `index.html`; compare page | shell | `tools/refs/frame-sync.js`, copied by `copy-sprites.ts` (today into `apps/maid/public`) |

### 3.7 Env variables and OAuth

| | `apps/maid` (today) | `apps/maid-bicycle` (new) |
| --- | --- | --- |
| `.env.local` (git-ignored) | `VITE_OSM_DEV_CLIENT_ID` and `VITE_MAPILLARY_TOKEN`, both set (values not read) | client id empty until registered; Mapillary token is the owner's call |
| `.env.example` | the two names, comments, redirect `127.0.0.1:5173/land.html`, no secret | the same two names, redirect `127.0.0.1:5176/land.html` |
| OAuth redirect registered | `http://127.0.0.1:5173/land.html` | not registered: owner task |

Until the 5176 redirect exists, the bicycle login shows the shell's "unavailable" message (`unavailable()` in `auth.ts`). That message names `apps/maid/.env.local` today; it must name the app's own env file.

## 4. apps/maid-bicycle

| File | Lines | Content |
| --- | --- | --- |
| `index.html` | 13 | title, `#root`, `/frame-sync.js`, `src/main.tsx` |
| `package.json` | about 35 | `@osm-editor-kit/maid-bicycle`; scripts `dev` (`bun --bun vite --port 5176 --strictPort`), `build`, `preview`; dependencies as `apps/maid`, minus unused |
| `vite.config.ts` | about 15 | Tailwind, React Compiler, `PORTS.maidBicycle`, shared `publicDir` |
| `.env.example` | 9 | the two names, with the 5176 redirect |
| `src/main.tsx` | about 20 | `initTheme()`, `setWorkerUrl(...)`, `mountEditor(root, appConfig)` |
| `src/maid.config.ts` | about 60 | `AppConfig`: id `maid-bicycle`, placeholder brand, `createdBy`, `osm` with the 5176 origin, presets, filters, `modules(runtime)` |
| `src/modules/bike-tags.tsx` | about 40 | the example module: an inspector section "Bicycle tags" on ways |
| `src/modules/bike-tags.test.ts` | about 30 | `hasBikeTags(tags)` cases and the contract test |
| `src/vite-env.d.ts` | 1 | Vite client types and the app's `VITE_*` names |

Modules switched on: `elementInfo`, `operations(defaultOperations)`, `relations`, `validation(defaultRules)`, `imagery`, `dataLayers`, `lenses`, `streetImagery` (token from the app env), `surface`, `notes`, and `bikeTags()`. Not on: `sceneBounds` (no fixture). The D6 modules are not part of this plan.

The example module registers one `inspector.section`, shown for ways, that says whether a key starts with `cycleway` or `bicycle`, or `highway=cycleway` is set. `hasBikeTags` is pure, so its test needs no DOM. It proves the path: app config, its own module, the shell's extension point. Port 5176 is `maidBicycle` in `tools/ports.ts`: not 5174 (another project), not 5175 (the benchmark preview).

## 5. Root scripts and tooling

| File | Change |
| --- | --- |
| `package.json` | `dev` = `bun run --parallel dev-maid dev-bicycle dev-api`; rename `dev:maid` and `dev:api`; add `dev-bicycle`; add `check-all` (step 0) and `check-config` (step 6) |
| `tools/ports.ts` | add `maidBicycle: 5176` |
| `tools/bench/args.ts` (new) | `takeApp(argv)` removes `--app maid\|bicycle` from `process.argv` and returns it (default `maid`), so positional arguments stay as they are |
| `tools/bench/check-page.ts` | `runCheck` uses `PORTS[app]` instead of `PORTS.maid` (line 65); the localhost line stays |
| 11 check scripts (draw, edit, filters, interactions, journal, ops, relations, tags, validation, undo, shot-diff) | call `takeApp()` first; `shot.ts` accepts `maid-bicycle` |
| `run.ts`, `edit.ts`, `wheel-zoom.ts`, `zoom-settle.ts`, `quick-pan.ts` | no change: the benchmark measures `apps/maid` on `PORTS.maidBuild` |
| `tools/refs/copy-sprites.ts` | targets `packages/shell/public/sprites` and `packages/shell/public/frame-sync.js` |
| `.claude/launch.json` | add `maid-bicycle` (port 5176); the other entries stay |
| `oxfmt.config.mjs`, `oxlint.config.mjs` | `apps/maid/public/**` becomes `packages/shell/public/**` and `apps/maid-bicycle/public/**`; oxfmt stylesheet path per 3.5 |
| `AGENTS.md` | scripts table: `dev`, `dev-maid`, `dev-bicycle`, `dev-api`, `check-all`, `check-config`, `--app`; layout: `packages/shell`, `apps/maid-bicycle` |
| `packages/ui/README.md` | line 1 reworded (3.1) |
| `tsconfig.json`, `.github/workflows`, knip | no change: `include` already covers the folders; CI runs `check-ci` only; no knip config exists (measured) |
| `apps/compare` | not read |

`shot-diff.ts` does not call `runCheck` (0 calls, measured), so it has no localhost line of its own (inferred). Step 5 adds one.

## 6. Tests

### 6.1 Types (level a)

- Extension points are declared by merging into `ExtensionPoints`: 4 in `packages/ui/src/extension-points.ts` and 4 in `packages/renderer/src/extension-points.ts`. `Hooks` is empty outside core's own tests.
- `packages/core/src/types.test.ts` has `@ts-expect-error` lines for an unknown point, an unknown hook and wrong item types.
- Measured: `tsc --noEmit -p packages/core/tsconfig.test.json` exits 0 today, so every expected error fires. An app module with an unknown point fails the root `tsc`, which covers the same maps (inferred; not run).

### 6.2 Contract test (level b)

`testModule(module, { points })` lives in `packages/core/src/testing.ts`, exported as `@osm-editor-kit/maid-core/testing`, so the headless index stays free of test code. It runs `module.setup` through a spy `ModuleApi` and checks that every `register` goes to a listed point; replaces `globalThis.fetch` and `XMLHttpRequest` with throwing stubs during setup and destroy; creates `createEditor({ modules: [module] })` and checks unique ids per point; and calls `destroy()` and checks that every registry is empty. Hook listener removal needs a core count per hook name; add it only when a test needs it.

Each module gets `contract.test.ts` (about 15 lines) in step 5. `apps/maid/src/app-config.test.ts` runs `editorConfig` with a fixed runtime through the same helper. Points and needs below come from the factories and `setup` bodies (measured). "Network" is read from the code, not measured.

| Module | Factory | Registers at | Needs alone | Network during setup |
| --- | --- | --- | --- | --- |
| data-layers | `dataLayers()` | map.content, topbar.panel | nothing | none |
| imagery | `imagery()` | map.content, topbar.panel, imagery.used | nothing | none |
| lenses | `lenses()` | topbar.panel | writes its store; the map needs the shell's `connectLenses` | none |
| notes | `notes({ apiUrl, minZoom })` | map.content, topbar.panel, dock.view | `apiUrl` (the mock in tests) | none; requests on map moves at zoom 14 and up |
| street-imagery | `streetImagery({ mapillaryToken })` | map.content (not under automation), topbar.panel, dock.view, inspector.field | `editor.queries` from core | none at setup |
| surface | `surface()` | inspector.field | nothing | none |
| traffic-signs | `trafficSigns()` | inspector.field | the app's preset change, to show its field | none |
| operations (renderer) | `operations(list)` | edit.operation | nothing | none |
| scene-bounds (shell) | `sceneBounds({ bbox })` | map.layer | a bbox | none |
| element-info (shell) | `elementInfo()` | inspector.section | `editor` | none |
| validation (shell) | `validation({ rules })` | inspector.section, dock.view | `editor` | none |
| relations (shell) | `relations()` | inspector.section (two) | `editor` and the `engine` singleton: not alone until step 3 | none |

### 6.3 Config matrix (level c)

`bun run check-config [--app maid|bicycle]` runs one row per config: none, each of the 12 modules alone, and all of the app's modules (14 rows per app). Rows open `/?modules=<list>&scene=small`. A dev-only harness serves them, in the style of `?harness=tags`:

- `main.tsx`: `if (import.meta.env.DEV && params.has('modules'))` mounts the same `AppConfig` with `modules: () => catalogue(list)`.
- `packages/shell/src/harness/catalogue.ts` (dev only, dynamic import) maps ids to factories and declares the items each should add: one line per module. Production never includes it.

Each row checks: no `pageerror` and no `console.error` (`runCheck` collects only the first today, so the check adds the second); `__bench.ready()` and `settled()` resolve and `__maid.map.loaded()` is true; `__maid.editor.moduleIds` equals the row's list (core already exposes it); each enabled module's declared items are in `__maid.editor.registry(point).list()`; a disabled module leaves nothing in any registry; no request outside localhost (the line `runCheck` prints).

## 7. Order of work

Each step leaves `bun run check` and `bun run check-all` green (`check-all` is new in step 0). "Same counts" means the number of `ok` lines of each check is equal before and after, with no `FAIL`. Record the counts before step 2 and put them in the commit message.

| Step | What | Size | Mechanical? | Done when | Blocked by open edits? | Risk |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | Proof on `platform.ts`, `stack.ts`, `stack.test.ts`. New `packages/shell` with a barrel. `check-all`. ui README line 1. | S: 3 files, 166 lines, 8 import lines | yes: `git mv`, `sed` | `check`, `check-all` | no: none is modified | low: barrel import, `bun test` in a package, workspace link |
| 1 | Styles and assets: `index.css` to `packages/shell/src/styles.css`; `apps/maid/public` to `packages/shell/public`; `publicDir`; `copy-sprites.ts`; oxfmt and oxlint paths | S-M: 11 files, 1.15 MB moved, 4 config lines | mostly: `git mv`, `sed` on configs; CSS by hand | `check`, `check-render` (unchanged), `check-all` | no | medium: `@source` paths (3.5) |
| 2 | Bulk move: every SHELL, SHELL-test and HARNESS file, plus `config.ts` and `editor.ts`. Relative imports keep working: both trees are three levels below the root (inferred from the paths). | L: about 71 files, about 7,760 lines; by hand: `main.tsx` and `maid.config.ts` imports, barrel entries | yes: a script over the classification, then `sed` | `check`, `check-all` with the same `ok` counts, `check-render` | YES: a committed, quiet tree | medium: a missed import or barrel entry; the type-check finds most |
| 3 | Singletons to `createApp` and context (2.3) | M: 29 files (16 mechanical, 10 by hand), `app.ts` new | mixed | `check-all` same counts; `bun test` creates two shell instances without sharing; `check-journal` (restore timing moves from import to mount) | YES: components are edited now | high: React Compiler, `useEngine` identity, journal timing |
| 4 | Bicycle app skeleton (section 4); `dev` scripts; `ports.ts`; `launch.json`; `AGENTS.md` | M: 9 new files, about 225 lines | by hand | `check`; `bun run --cwd apps/maid-bicycle build`; `bun run dev` starts three processes (later, not in this plan) | no: new folder | low: login "unavailable" until the redirect |
| 5 | `--app` for all checks; `check-all --app`; `testModule`; 12 contract tests; app config test | M: a helper of about 120 lines, 13 test files, 11 one-line check edits | by hand | `check` (with the new bun tests); `check-all --app bicycle` | no | low |
| 6 | Dev-only `?modules=` harness and catalogue; `check-config` | M: 2 new files, about 250 lines | by hand | `check-config` passes for both apps, all rows, no console errors | no | medium: the catalogue goes stale when a module changes; the check catches it |
| 7 (later) | Built-in modules to `packages/module-*`; a core `api.engine` | L | by hand | `check-all` | not in this plan | medium |

Step 0 commands (macOS `sed`):

```sh
git mv apps/maid/src/platform.ts packages/shell/src/platform.ts
git mv apps/maid/src/stack.ts packages/shell/src/stack.ts
git mv apps/maid/src/stack.test.ts packages/shell/src/stack.test.ts
grep -rlE "from '(\.\.?/)+(platform|stack)'" apps/maid/src | xargs sed -i '' -E "s#from '(\.\.?/)+(platform|stack)'#from '@osm-editor-kit/maid-shell'#"
```

Then `packages/shell/src/index.ts` re-exports both with `export *`. Step 2 repeats the pattern from a list generated by the classification (every SHELL, SHELL-test, HARNESS, `config.ts`, `editor.ts`, minus step 0), one `git mv` per line.

The tree is not quiet now. Uncommitted changes under `apps/maid/src` (`git status`): `App.tsx`, `main.tsx`, `editor.ts`, `maid.config.ts`, `reference.ts`, `reference.test.ts`, `components/Inspector.tsx`, `id-raw_tag_editor.test.ts`; deleted `components/AddTag.tsx`, `TagList.tsx`, `TagRow.tsx`; untracked `components/FetchPauses.test.ts`. Steps 2 and 3 wait until these are committed.

## 8. Risks and questions for the owner

| # | Question | Options | Recommendation |
| --- | --- | --- | --- |
| 1 | Package name | `shell`, `app`, `host` | `shell`. `app` clashes with `apps/maid`'s package name; reword `packages/ui/README.md` line 1. Fallback `host`. |
| 2 | Built-in modules (relations, validation, element-info, scene-bounds): with the shell, or as module packages now | keep in the shell until step 7; or move now | keep until step 7. `relations` needs the engine, and `ModuleApi` has none. Move later with a core `api.engine`. |
| 3 | OAuth redirect for port 5176 | a second OAuth app with `http://127.0.0.1:5176/land.html`; or a second redirect on Maid's app | a second app: one client per app, revoked separately. Owner task; login is "unavailable" until then. |
| 4 | Shared browser storage | keep separate (per origin); or share | keep separate. Different ports are different origins: settings, favourites, the journal (IndexedDB), notes, lenses, imagery, street imagery, the reference cache and the login token are per app. One app's journal never restores into the other. Cost: settings and login are entered twice. If the apps are later served from one origin (for example `/bike/`), keys collide; then the stores need a prefix from `AppConfig`, which needs store factories. |
| 5 | Name of the bicycle app, in the UI and in `created_by` | the owner names it; `created_by` is the app's name and version, or stays `Maid <version>` | its own name in `created_by`: OSM readers use it to see which editor saved a change. Placeholder `maid-bicycle` until named. |
| 6 | Mapillary token for the bicycle app | share Maid's token; or its own | its own: the env comment says each app registers its own. |
| 7 | Dev-only `?modules=` matrix and its catalogue | add; or skip the matrix | add. The cost is one catalogue line per module. |
| 8 | Two editors on one page | not supported; or support later | not supported now. The package stores are singletons; say so in the package README. |

## Not checked

- No browser check was run and no server was started (per the brief). Every "done when" in section 7 is unrun.
- Counts are a snapshot of a tree that other agents are editing.
- Tailwind 4 `@source` resolution inside an imported package stylesheet: inferred.
- Vite `publicDir` outside the app root under the dev server: inferred (Vite's default `server.fs` allows the workspace root).
- Whether each module loads alone under `bun test` (zustand `persist` without `localStorage`; Bun's `navigator`): inferred from the code.
- "Network during setup" in the module table: read from the code, not measured.
- That an app module with an unknown extension point fails the root `tsc`: inferred from the shared declarations. The core's own test config was measured (exit 0).
- `apps/compare` and the body of `tools/bench/shot-diff.ts`: not read.
- The lint rule behind the React Compiler limit on reassigned `let` bindings: not checked; the repo's own convention (a comment in `stack.ts`) was read.
