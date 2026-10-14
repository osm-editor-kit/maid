# Cleanup of 2026-10-13/14: decisions and what is left

The `/unslop-code` run of 2026-10-13/14 (phases 3 to 10) applied only changes without a behaviour change. What the
phases found and did not apply was handed to Tobias; his decisions and their state are below. Leads marked "unverified"
come from agents that searched without running anything; check each before acting on it.

## Decided by Tobias on 2026-10-14, and done

| Decision | Done in |
| --- | --- |
| Automation stays decided by one function (`isAutomated()`); the other places only call it. Wiki fields get no source under automation, as their docs say. | 8e856ec |
| One `isLocalUrl` in the core; taginfo answers parsed with Zod and asked once; debug handles (`__bench`, `__maid`) only in dev and `VITE_BENCH=1` builds | 58a0435 |
| Fetching through TanStack Query on the editor's client; the notes store keeps only client state; PMTiles read through the editor's fetch rules | 8e856ec |
| Zustand stores as TkDodo recommends: private store, named hooks, grouped actions | 8e856ec, 83e59cb |
| Read-only is the absence of a write callback; a context in the relation sections | 823e076 |
| Fallback presets as iD decides (no tags, or only `area`); the type picker opens only for a feature just made | 823e076, 95b4589 |
| The magnifier follows the main map through `useMap` | 823e076 |
| nuqs stays: Maid has no router | (no change) |
| A page has one editor, so module-level state is not an issue | (no change) |
| Duplicated helpers merged (Mapillary token, `canBeArea`, fixture bounds, OSM zoom, draw mode, data source, refusal messages) | 95b4589 |
| Notes load from zoom 12, as in iD; only the notes module decides it | 95b4589 |
| MapLibre's own texts follow the app's language | 95b4589 |
| Parking texts stay in the module, in its own Paraglide project that follows the app's language; stable keys for restriction time ranges | 8cc617b |
| Script names without `:`; one shared Vite tree-shaking block; five floating-ui linter exceptions removed, seven kept with their reason | a294ad5 |

## Decided, not done yet

- **Validation and presets doing work twice:** measure first (on a quiet machine), then fix what costs time. The leads,
  all unverified: `crossing_ways` and `almost_junction` recompute per neighbour and per end what is fixed per run;
  `way-index.near` boxes a way again; several rules compute a location the validator already fills; `shownIssues`
  filters again per call; `outdated_tags` checks presets per entity; `impossible_oneway` passes no `ignored` set to
  `hasValue`; `needsAreaTag` scans again per call; `editor.ts` decides the presets source twice.
- **engine.ts** (about 2,470 lines): split further after the next benchmark on a quiet machine, with an ADR. The rest
  shares private state (channels, highlight and selection, measure, drag) and needs one state object per group.

## Small leads, not decided (unverified)

- The argument order of `presets.search` forces an `undefined` in `Inspector.tsx`.
- Taginfo options that no caller sets; `editor-fetch` reads the time twice.
- The props union of `TagSheet.tsx` is never narrowed; `clipboard.ts` folds read-only keys again after the reducer did;
  `readOnlyKeys` and `showHeader` of the UI package have no caller in the shell.
- The parking module narrows `showMissing` three times; data layers compute `layersOf` twice.
- `module-turn-restrictions` still takes its texts from the app's messages; it could follow the parking module's pattern.
