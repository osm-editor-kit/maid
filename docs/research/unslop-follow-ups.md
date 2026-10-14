# Cleanup of 2026-10-14: what is left

The `/unslop-code` run of 2026-10-13/14 (phases 3 to 8) applied only changes without a behaviour change. This page
keeps what the phases found and did not apply, so that it can be decided and done step by step. Leads marked
"unverified" come from agents that searched without running anything; check each before acting on it.

## Decided by Tobias on 2026-10-14

- **Automation (1):** stays as it is. One function (`isAutomated()`) decides; the other places only call it, and moving the
  call changes the module contract for no gain. The Wiki fields follow their docs: no source under automation.
- **`isLocalUrl` (2), Taginfo with Zod (7), debug handles only in dev and benchmark builds (5), the magnifier with
  `useMap`:** done in the round after this list.
- **Read-only (3):** a cleaner contract where it saves checks; passing a prop down is fine where the rest is simpler.
- **Fallback presets (4):** as iD and Rapid answer it.
- **Data fetching (6):** TanStack Query through the editor's query client; hand-written fetching and caching stays only for
  very good reasons. The notes module keeps only client state in Zustand.
- **nuqs (8):** stays; Maid has no router.
- **Zustand stores:** as TkDodo recommends ("Working with Zustand"): only hooks exported, actions grouped, small stores.
- **Module-level state:** not an issue, a page has one editor.
- **Validation and presets doing work twice:** measure first, then fix what costs time.
- **Notes zoom:** one rule, as iD: notes load from zoom 12; only the notes module decides it.
- **Duplicated helpers:** merge them (Mapillary token, `canBeArea`, the fixture bounds, OSM zoom, draw mode, data source,
  refusal toasts).
- **Parking texts:** stay in the module, in the same system: the module brings its own Paraglide messages and follows the
  app's language; the missing-texts check covers it.
- **MapLibre's own texts:** translated through the map's `locale`.
- **engine.ts:** split further after the next benchmark on a quiet machine, with an ADR.
- **Script names with `:`:** renamed to the stack's naming.
- **Linter exceptions for floating-ui refs, stable ids for restriction time ranges, one shared Vite tree-shaking block:**
  do all three.

## The list as it was handed to Tobias

1. **Where automation is decided.** About fifteen places call `isAutomated()` themselves (shell: `auth.ts`, `App.tsx`,
   `SearchButton.tsx`, `components/reference.ts`, `mount.tsx`, `search/flyout.ts`; ui: `inspector/recents.ts`,
   `wiki-service.ts`; modules: imagery, data layers, parking, street imagery). Deciding it once in the shell and passing it
   to modules changes the module contract in `packages/core`. Street imagery's `activeProviders(..., automated)` repeats the
   guard on purpose, as a second safety net for core rule 1.
2. **Two `isLocalUrl` with different rules** (`packages/module-data-layers/src/config.ts` and
   `packages/core/src/fetching/services.ts`): core's accepts `.localhost` and `.test`, the data layers' accepts paths on the
   same server. One rule changes which data layers load in automated runs.
3. **Read-only in relation sections and fields.** `relations-sections.tsx` passes `readOnly` through about five levels to
   about twenty buttons; five field components derive read-only from `onChange === undefined`. Options: a React context at
   the section root, or a disabled `fieldset`.
4. **Fallback presets:** `packages/core/src/schema.ts` and `packages/presets` disagree on whether an area-only preset counts
   as the generic one (unverified). That is a result change, not a clean-up.
5. **Debug handles in production builds:** `window.__maid` and `window.__bench` are set in every build, also on GitHub Pages.
   A dev-only gate would break `bench-edit`, which measures a production preview. Option: a build flag for benchmark builds.
6. **Data fetching in effects** (Wiki fields, tag suggestions, info popover, notes, imagery lists, data layers, the place
   search): could go through the editor's query client. That changes caching and when results show; decide per fetch. The
   notes module keeps server data in a Zustand store, with live `AbortController`s and the map object.
7. **Taginfo answers** are checked with hand-written guards, not Zod (`packages/core/src/taginfo/taginfo.ts`). Zod would
   treat arrays and wrongly typed fields differently.
8. **URL state with nuqs:** the stack names nuqs for Next.js and TanStack's search validation; Maid is a Vite app without
   a router. Keep nuqs and say so in the stack notes, or write URL state by hand.

## Clean-ups that need a measurement or a test first (unverified leads)

- Validation: `crossing_ways` and `almost_junction` recompute per neighbour and per end what is fixed per run;
  `way-index.near` boxes a way again; several rules compute a location the validator already fills; `shownIssues` filters
  again per call; `outdated_tags` checks presets per entity; `impossible_oneway` passes no `ignored` set to `hasValue`.
- Presets: `needsAreaTag` scans again per call; `editor.ts` decides the presets source twice; the argument order of
  `presets.search` forces an `undefined` in `Inspector.tsx`.
- Modules and apps: the Mapillary token is resolved in three apps and trimmed again in four helpers; `canBeArea` is the same
  in three apps, and so is `config.live ? undefined : BBOX[config.scene]`; `notes({ minZoom: 14 })` differs from the
  module's default 12 and the zoom gate is decided in two places (`loadsAt` has no production caller); the parking module
  reads `isGerman()` on every render and narrows `showMissing` three times; the surface and parking fields derive
  read-only in four files; the "MapLibre zoom + 1 = OSM zoom" helper exists twice; data layers compute `layersOf` twice.
- Taginfo options that no caller sets; `editor-fetch` reads the time twice.
- Shell and UI: the dev/live/fixture source is derived again in `BottomDock.tsx`, `UserButton.tsx` and `journal.ts` (one
  `source` on the config would do); `shell.ts` reads `LIVE_BUILD` again; the draw-mode check exists in `MapView.tsx`,
  `useShortcuts.ts` and `drawing.ts`; refusal-to-toast is the same in `MultiInspector.tsx` and `MultiType.tsx`; the props
  union of `TagSheet.tsx` is never narrowed; `clipboard.ts` folds read-only keys again after the reducer did;
  `readOnlyKeys` and `showHeader` of the UI package have no caller in the shell.
- Wiki fields under automation: the docs of `wiki-context.ts` say automated runs get no source, but the shell gives one
  and only the request cache refuses. Decide whether automated runs render the source at all.

## Smaller points

- Exported raw Zustand stores (`useSettings`, `useLensStore`, notes, street imagery, `useBearing`); actions are flat, not
  grouped; store files do not follow a `*-store.ts` naming. All reads use selectors today.
- Module-level state shared by every editor on a page: `MapView.tsx` (drag and press state), `Number.tsx` and `Radio.tsx`
  (focus hand-over). Works with one editor per page.
- `MeasureLoupe.tsx` passes a ref to its `Map` and moves it every frame; the react-map-gl way would be a child using
  `useMap`. Needs a browser check.
- Attribution texts are MapLibre's English ones in all four languages (`locale` prop on the map).
- Twelve `oxlint-disable` comments for floating-ui refs; whether they are still needed is not checked.
- `RestrictionField.tsx` keys time ranges by index; a stable id per range is the clean fix.
- The parking module keeps its texts outside `packages/i18n` (a second path for texts).
- The `moduleSideEffects` block is the same in the three apps' Vite configs.
- Package script names with `:` (`dev:api`, `refs-serve:id`) do not follow the stack's naming; AGENTS.md treats the names
  as a contract.
- `engine.ts` is still about 2,470 lines: the rest of it shares private state (channels, highlight and selection, measure,
  drag). Splitting further needs one state object per group, decided with an ADR.
