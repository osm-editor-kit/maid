# Architecture work docs

Proposals for how Maid is built beyond the proof of concept. Written 2026-10-11 after Tobias's notes on the first report. **Nothing here is built unless a chapter says so.** Each chapter ends with what is still open.

The starting point is [the extensibility plan](../extensibility-plan.md): one config object, a headless core, replaceable renderer and UI, and code units that forks add. These chapters go deeper on single topics.

| # | Chapter | In one line |
| ---: | --- | --- |
| 1 | [Naming](01-naming.md) | What to call the code units a fork adds. Proposal: "Maid module". For discussion |
| 2 | [Fork model](02-fork-model.md) | A fork is a small app on Maid's packages; missing hooks are patched locally and upstreamed. For discussion |
| 3 | [Packages](03-packages.md) | What comes from Rapid, iD and osm-editor-kit, where packages live, licence |
| 4 | [Rapid review](04-rapid-review.md) | What to copy from Rapid 3's structure and what not; workers |
| 5 | [Data store](05-data-store.md) | Graph, history, undo and spatial index, ported from Rapid with three changes |
| 6 | [Filters](06-filters.md) | Filters as ordered data in the config, three states, two stages |
| 7 | [Styles and lenses](07-styles-and-lenses.md) | A lens is a second style; export for an external style editor |
| 8 | [URL state](08-url-state.md) | All parameters in nuqs; translation from and to iD's URLs (built) |
| 9 | [Storage and settings](09-storage-and-settings.md) | Dexie and Zustand; which value wins between URL, stored preference and user action |
| 10 | [UI design](10-ui-design.md) | Tailwind, light and dark, the kit as reference; a licence point to settle |
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

## Open questions, collected

Needs Tobias, or the people he wants to ask:

1. **The name** for a fork's code units: module, plugin, or something else ([naming](01-naming.md)).
2. **How forks consume Maid**: published packages, a git dependency, or a submodule ([fork model](02-fork-model.md)).
3. **The Tailwind Plus licence**: may component source sit in a public repository, and which licence (Personal or Team) is it. Until answered, nothing is copied ([UI design](10-ui-design.md)).
4. **Thresholds** for "fast enough", still unconfirmed from iteration 1.
5. **Whether to send the MapLibre report** ([draft](../upstream/maplibre-updatedata-inconsistent-tiles.md)).
6. **Where the repo is hosted**; nothing is pushed.

Design questions with a proposal in the chapter:

7. Final names and formats of the public URL parameters: `filters`, `lens`, `background`, photo options ([URL state](08-url-state.md)).
8. Whether `id` stays a comma list ([URL state](08-url-state.md)).
9. The shape of a filter's `match`: how much is data, how much may be a function ([filters](06-filters.md)).
10. Whether read-only objects look different by default ([filters](06-filters.md)).
11. The default list of style keys that are copied onto map features for user styles ([styles and lenses](07-styles-and-lenses.md)).
12. Readable names for the feature properties before they become a public schema ([styles and lenses](07-styles-and-lenses.md)).
13. Lon/lat or Rapid's world coordinates in the data model ([data store](05-data-store.md)).
14. `osm-data`: stays as fetch-and-parse, or is folded into the graph package ([data store](05-data-store.md), [packages](03-packages.md)).
15. Whether OSM data is cached across sessions ([storage and settings](09-storage-and-settings.md)).
16. Syncing settings to the OSM account ([storage and settings](09-storage-and-settings.md)).
17. Whether a fork may lock a setting, and which ([storage and settings](09-storage-and-settings.md)).
18. Whether a fork may replace a core UI component ([fork model](02-fork-model.md)).
19. The map background and data colours in light mode ([UI design](10-ui-design.md)).
20. The accent colour, and letting a fork set it ([UI design](10-ui-design.md)).
21. How dense the inspector is ([UI design](10-ui-design.md)).

To verify, not to decide:

22. The icon and font licences in `NOTICE.md`.
23. Headless UI together with the React Compiler.
24. Token lifetime and popup flow of `osm-oauth`.
25. Rapid's rebase-on-download and history memory on a long session.
