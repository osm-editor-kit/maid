# Packages: what they are, where they live, where the code comes from

Status: proposal, following Tobias's notes of 2026-10-11.

## Decided by Tobias

- **Maid is a clean new app.** Not a port of iD file by file. Its structure is close to Rapid 3's. Fixes in iD are read and, where they apply, re-done here; they are not merged.
- **The base layer comes from Rapid and iD where possible**: geometry work and writing OSM data are critical and should not be reinvented.
- **Not every package is public.** A package is published when it is useful on its own. The rest are internal to the monorepo.
- **Existing osm-editor-kit packages can be renamed or reshaped.** They are used little, mostly by Tobias.
- **OSM login uses the package from the small projects** (the street-space and parking editor), not a new one.
- **The bottom dock is part of the default editor**, not a module.

## Which code comes from where

| Layer | Source | How |
| --- | --- | --- |
| Entities, graph, difference, geometry | Rapid 3 `data/`, `lib/` | Ported, with `Context` cut out ([data store](05-data-store.md)) |
| Actions (move, split, join, orthogonalise, …) | Rapid 3 `actions/` with its tests; iD for comparison | Ported one by one |
| Geometry and vector math, tiler, extent | `@rapid-sdk/math` | **Used as a dependency**, see below |
| Small utilities | `@rapid-sdk/util` | Used selectively, see below |
| Tagging schema, presets, fields | `@openstreetmap/id-tagging-schema` | Dependency. The data is the standard; the matching code is ported |
| Validation rules | Rapid 3 `validators/` (19 test files), iD | Ported when validation is built |
| Look of the data | iD's CSS | Generated into `packages/style` (done) |
| Rendering | Maid | New (done) |
| UI | Maid | New, React and Tailwind ([UI design](10-ui-design.md)) |
| OSM API, login, upload | `osm-api` and osm-editor-kit's `osm-oauth`, `osm-changeset` | Dependencies, improved where they fall short |
| Imagery | `maplibre-editor-layer-index` | Dependency |
| Street-level photos | `street-imagery`, `street-imagery-react` | Dependencies |
| Presence | `live-touched` | Dependency |

### The Rapid SDK

Agreed by Tobias on 2026-10-11.

Rapid moved the shared math and helpers that iD keeps in `geo/` and `util/` into two packages a while ago. iD never adopted them.

- **`@rapid-sdk/math`** 1.0.0-pre.5, ISC, repository `rapideditor/rapid-sdk`. Extent, vector operations, projection between WGS84 and world coordinates, spherical distance, a tiler. Rapid imports it in about 162 files. Depends on `d3-polygon` and on `@rapid-sdk/util`.
- **`@rapid-sdk/util`** 1.0.0-pre.5, ISC. Array and object helpers, query-string helpers, tag diff, "all nodes of these entities", a session lock. Rapid imports it in about 80 files. Depends on `aes-js` and `diacritics`.

Can we use them? **Yes for `math`.** The ported entities and actions call it everywhere, it is small, tested and ISC, and replacing it would mean rewriting working geometry code for no gain. It is a pre-release and Rapid pins it exactly; we pin it too.

**Selectively for `util`.** Half of it is generic helpers that the language or a line of code covers today, the session lock is the cookie approach we do not want, and it pulls in an AES library. Where ported code needs a helper from it, we take the import; we do not build on it.

**Copy into the monorepo?** Not at first. A dependency keeps us honest about what we changed. If we need to change the math, we fork it into `packages/` then, with its tests, and say so in the notice file. Maid's model is lon/lat ([data store](05-data-store.md)); the world-coordinate parts of the package are simply not used.

## Package names

Agreed by Tobias on 2026-10-11. Everything is published under `@osm-editor-kit/`. The prefix of the name says what a package belongs to:

| Prefix | Meaning | Examples |
| --- | --- | --- |
| `maid-*` | Part of the Maid editor. Released together, built on Maid's data model | `maid-model`, `maid-graph`, `maid-actions`, `maid-core`, `maid-renderer`, `maid-style`, `maid-ui` |
| `maid-module-*` | A core module ([naming](01-naming.md)) | `maid-module-maproulette`, `maid-module-notes` |
| `osm-*` and others | Stands alone and works without Maid | `osm-oauth`, `osm-changeset`, `osm-data`, `street-imagery` |

Why: `osm-model` next to the existing `osm-data` would look like two parts of one thing, and they are two different models ([data store](05-data-store.md)). And a name like `renderer` or `style` says nothing in a shared organisation.

Folders in the monorepo stay short. The package name carries the prefix: `packages/graph` is `@osm-editor-kit/maid-graph`, `packages/module-maproulette` is `@osm-editor-kit/maid-module-maproulette`. Imports always use the package name.

## Where packages live

Three places, by who else could use the package:

| Kind | Where | Published | Examples |
| --- | --- | --- | --- |
| **Useful to others on its own** | Its own package under `@osm-editor-kit/*`, in this monorepo or in its existing repo | Yes | Street-level imagery, the imagery index for MapLibre, `osm-oauth`, `osm-changeset`, later the headless data packages |
| **Maid's own, useful to forks** | This monorepo | Yes, once forks consume Maid as packages ([fork model](02-fork-model.md)) | `maid-core`, `maid-renderer`, `maid-style`, `maid-ui`, the feature UI |
| **Internal** | This monorepo, `private: true` | No | Benchmark tools, the mock API, glue |

Maid lives in the osm-editor-kit organisation: <https://github.com/osm-editor-kit/maid>. Packages that are strong on their own keep their repos, or move in and keep their names; nothing forces one layout on all of them.

Existing osm-editor-kit packages and what the reviews suggest:

| Package | Suggestion |
| --- | --- |
| `maplibre-editor-layer-index`, `street-imagery`, `street-imagery-react`, `live-touched` | Use as they are |
| `osm-oauth` | Make it public (it is private today); this is the login for Maid |
| `osm-changeset` | Add deletes, which it lacks, and conflict handling; make it public |
| `osm-maplibre` | Make the latitude a parameter (fixed at 51° today); it is the natural home for Maid's update engine if other apps want it |
| `osm-map-url` | Give it a router-free core and share the parsers with Maid ([URL state](08-url-state.md)) |
| `osm-data` | Unchanged. It stays the small apps' store; Maid does not build on it ([data store](05-data-store.md)). Decided |
| `osm-way-edit`, `osm-way-chain` | Superseded for Maid by the ported actions; still right for the small apps |
| `osm-ui` | Empty today. Either becomes `maid-ui` or goes |

## OSM login

`osm-oauth` from the street-space editor: OAuth 2 with PKCE on top of the `osm-api` package (4.0.0), with the client id and API host passed in as configuration. That fits Maid's "config object" directly and gives the dev API for free. To check when it is wired in: token lifetime and refresh, and the popup flow.

## Licence

**Decided: ISC**, as iD and Rapid. What that means in practice, so nobody has to think about it again:

- ISC lets anyone use, copy, change and sell the code. The one duty is to **keep the copyright and permission notice** with copies.
- Code ported from iD or Rapid is ISC too. We keep their notice: `LICENSE.md` has Maid's ISC text, `NOTICE.md` lists what came from where, and a ported file starts with one line naming its origin (`// Ported from Rapid modules/lib/Graph.ts, ISC, © Rapid contributors`).
- Data and assets have their own terms, listed in `NOTICE.md`: the tagging schema (ISC); icon sets (Maki and Temaki are CC0; Font Awesome and Röntgen are CC BY 4.0 and need attribution); the label font (Open Sans); OSM data in the fixtures (ODbL, attribution in the repo and in the app).
- Tailwind Plus components are used under our Tailwind Plus licence, copied in and adapted ([UI design](10-ui-design.md)). The kit itself is not republished.

`LICENSE.md` and `NOTICE.md` are in the repo as of this change. The icon licences in the notice are from memory of those projects and should be checked once against their repositories.
