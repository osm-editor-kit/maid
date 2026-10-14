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

- **Validation and presets doing work twice:** measured on 2026-10-14 (the machine had a load of 10 to 17 on 10 cores,
  so the medians of whole-run timings moved by 20 to 30 % even for rules nobody touched; the decisions below rest on
  alternating before/after runs and on CPU time). Dense fixture, validate everything, 174 issues, digest
  `467ff2f4194b3c28` before and after.
  - `crossing_ways`, the segments of the validated way made once per run, not per neighbour, and the neighbours'
    segments kept for the run: **fixed**. Own time about a quarter less (about 1,330 to 1,010 ms, alternating runs). Test:
    one run over four ways gives the same issues as a run for each way.
  - `almost_junction`, per neighbour and per end: **not worth it**. Keeping the neighbours' segments for the run made no
    difference beyond the noise (about 70 ms of own time, +/- 20 ms). Reverted.
  - `way-index.near` boxes a way again: **not worth it**. The query way's box is about 1 % of a validate-everything run.
    Reverted.
  - Rules computing a location the validator fills: **fixed** for `mutually_exclusive_tags`, the one rule that looked up
    the location of every feature before knowing it had a conflict. Own time about a quarter less. The other rules look it
    up after a cheap test that most features fail.
  - `shownIssues` filters again per call: **not worth it**. `issuesFor` takes about 2 microseconds with 174 issues, and
    about 5 with 20 ignored.
  - `outdated_tags` checks presets per entity: **partly fixed**. `presets.match` is about 35 ms of the rule's own time
    (about 15 %) and has to run per feature. The cost was `deprecatedTags` in presets (about 150 ms per run, more than a third of the
    rule's own time): the deprecated entries are now indexed by key and value, with their key lists made once. Own time
    of `outdated_tags` about 40 % less. Test: a scan of the list agrees with the index on 3,000 tag sets with semicolon
    and empty values (a dropped lookup makes it fail).
  - `impossible_oneway` without `ignored`: **no behaviour lost**. iD's `utilCheckTagDictionary` takes no ignore set;
    `isOneWay` reads all tags, and the highway check omits the same keys as iD. The parameter has no caller and the
    default allocates a Set per call, which costs nothing measurable. Not changed; the parameter could be removed.
  - `needsAreaTag` scans again per call: **not worth it**. `applyPreset` with area geometry takes about 0.25
    microseconds, and it runs only when the person picks a feature type, or for a replaced preset in `outdated_tags`.
    No per-feature path, so no micro-bench was added.
  - `editor.ts` decides the presets source twice: **not worth it**. It runs once per editor, and the change would only
    clarify the code.
  - Other costs seen in the profiles, not in the leads, not changed: `Graph.hasEntity` (the model package) is the
    largest self time of a validate-everything run; the segment pairs of `crossing_ways` (99 million for the dense
    fixture, about 18 ns each) are now the largest rule cost, and a spatial index of segments would be the next step;
    `missing_tag` takes about 260 ms, and `parentWays` (it allocates an array per call) shows high in the profile;
    `disconnected_way` takes about 500 ms; each validation run makes the boxes of all ways (about 80 ms at the first edit).
- **engine.ts** (about 2,470 lines): split further after the next benchmark on a quiet machine, with an ADR. The rest
  shares private state (channels, highlight and selection, measure, drag) and needs one state object per group.

## Small leads, not decided (unverified)

- The argument order of `presets.search` forces an `undefined` in `Inspector.tsx`.
- Taginfo options that no caller sets; `editor-fetch` reads the time twice.
- The props union of `TagSheet.tsx` is never narrowed; `clipboard.ts` folds read-only keys again after the reducer did;
  `readOnlyKeys` and `showHeader` of the UI package have no caller in the shell.
- The parking module narrows `showMissing` three times; data layers compute `layersOf` twice.
- `module-turn-restrictions` still takes its texts from the app's messages; it could follow the parking module's pattern.
