# Architecture work docs

Proposals for how Maid is built beyond the proof of concept. Written 2026-10-11 after Tobias's notes on the first report. **Nothing here is built unless a chapter says so.** Each chapter ends with what is still open.

The starting point is [the extensibility plan](../extensibility-plan.md): one config object, a headless core, replaceable renderer and UI, and code units that forks add. These chapters go deeper on single topics.

| # | Chapter | In one line |
| ---: | --- | --- |
| 1 | [Naming](01-naming.md) | The code units a fork adds are "Maid modules": core modules in the monorepo, external modules in forks. Decided |
| 2 | [Fork model](02-fork-model.md) | A fork is a small app on Maid's npm packages; missing hooks are patched locally and upstreamed. Agreed |
| 3 | [Packages](03-packages.md) | What comes from Rapid, iD and osm-editor-kit, where packages live, licence |
| 4 | [Rapid review](04-rapid-review.md) | What to copy from Rapid 3's structure and what not; workers |
| 5 | [Data store](05-data-store.md) | Graph, history, undo and spatial index, ported from Rapid with three changes. Agreed |
| 6 | [Filters](06-filters.md) | Filters as ordered data in the config, three states, two stages |
| 7 | [Styles and lenses](07-styles-and-lenses.md) | A lens is a second style; export for an external style editor |
| 8 | [URL state](08-url-state.md) | All parameters in nuqs; translation from and to iD's URLs (built) |
| 9 | [Storage and settings](09-storage-and-settings.md) | Dexie and Zustand; which value wins between URL, stored preference and user action |
| 10 | [UI design](10-ui-design.md) | Tailwind, light and dark, components from the Tailwind Plus kit |
| 11 | [Rust and WASM](11-rust-wasm.md) | Not worth it for today's work; validation is the first candidate; how to test |

## Decided by Tobias on 2026-10-11

- All URL state goes through nuqs. Clean URLs are a priority. iD URLs are translated in and out.
- Code units for forks are added in code only. Never through the UI, never from a URL.
- Maid is a clean new app, structured like Rapid 3. iD fixes are read and re-done, not merged.
- The base layer (geometry, writing OSM data) is taken from Rapid and iD where possible.
- OSM login uses the package from the small projects (`osm-oauth` on `osm-api`).
- Filters are config data with three states (editable, read-only, hidden); order sets precedence.
- Presets in the config are the real presets, changeable by a fork, not a reference to a package.
- The bottom dock is a default feature that a fork can switch off.
- Licence: ISC. Done: `LICENSE.md` and `NOTICE.md`.
- The UI is rebuilt in a modern Tailwind style with light and dark mode. iD's old design goes.
- Tooling follows the FMC tech stack: oxlint, oxfmt, React Compiler. Done.
- Not every package is public; only those useful on their own.
- **The name is "Maid module"**, with core modules (in the monorepo) and external modules (in forks).
- **Fork model agreed**: workspace packages inside the monorepo, Maid's npm packages for external forks. Replacing core UI components ("swizzle") comes later.
- **Speed: accepted.** "The app feels great, the experiment was a huge success until now." The thresholds proposed in iteration 1 are not needed as a gate any more; the benchmark stays as the regression check.
- **Tailwind Plus components may be used**: we hold a proper licence and distribute adapted components in our open-source projects.
- **The MapLibre report is postponed.** The write-up, patch and test case stay in the repo, ready to be referenced.
- **The repository lives at <https://github.com/osm-editor-kit/maid>.**
- **The data store is ported from Rapid as proposed, with lon/lat in the model.** `@rapid-sdk/math` is a pinned dependency, `@rapid-sdk/util` is used selectively.
- **`osm-data` stays unchanged** as the small apps' store. Its only user is the street-space editor. Maid's data package is `maid-model` (entities, graph, actions, history, spatial index in one package, as they depend on each other in Rapid).
- **Package names carry a prefix**: `maid-*` for the editor's own packages, `maid-module-*` for core modules, all under `@osm-editor-kit/`. Packages that work without Maid keep names like `osm-*` ([packages](03-packages.md)).

## Open questions, collected

Needs Tobias:

1. **The release routine** for Maid's npm packages, once the first fork needs them ([fork model](02-fork-model.md)).
2. **When to send the MapLibre report** ([write-up](../upstream/maplibre-updatedata-inconsistent-tiles.md)). Postponed.

Design questions with a proposal in the chapter:

3. Final names and formats of the public URL parameters: `filters`, `lens`, `background`, photo options ([URL state](08-url-state.md)).
4. Whether `id` stays a comma list ([URL state](08-url-state.md)).
5. The shape of a filter's `match`: how much is data, how much may be a function ([filters](06-filters.md)).
6. Whether read-only objects look different by default ([filters](06-filters.md)).
7. The default list of style keys that are copied onto map features for user styles ([styles and lenses](07-styles-and-lenses.md)).
8. Readable names for the feature properties before they become a public schema ([styles and lenses](07-styles-and-lenses.md)).
9. Whether OSM data is cached across sessions ([storage and settings](09-storage-and-settings.md)).
10. Syncing settings to the OSM account ([storage and settings](09-storage-and-settings.md)).
11. Whether a fork may lock a setting, and which ([storage and settings](09-storage-and-settings.md)).
12. The map background and data colours in light mode ([UI design](10-ui-design.md)).
13. The accent colour, and letting a fork set it ([UI design](10-ui-design.md)).
14. How dense the inspector is ([UI design](10-ui-design.md)).

To verify, not to decide:

15. The icon and font licences in `NOTICE.md`.
16. Headless UI together with the React Compiler.
17. Token lifetime and popup flow of `osm-oauth`.
18. Rapid's rebase-on-download and history memory on a long session.
