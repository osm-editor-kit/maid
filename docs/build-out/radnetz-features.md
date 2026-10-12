# Radnetz Berlin: what Maid takes over

The Radnetz Berlin editor is an iD fork (branch `radnetz-berlin` of `tordans/iD`). Its `WORKDOC.md` lists 36 features. This is the list of what `apps/radnetz-berlin` (step D6) takes over, where each one goes in Maid, and what Maid has of it today. Read from the work doc on 2026-10-13; the fork itself was not run.

"Proposal" is a suggestion for Tobias to confirm or change: **yes** (part of D6), **later** (after D6), **no** (not needed in Maid). Rows marked with Tobias's name and a date are decided; the others are still proposals.

"In Maid today" says what exists as of 2026-10-13: **done**, **partly**, or **nothing**.

## Generic: belongs in Maid itself or in a Maid module

| # | Feature in the fork | Where in Maid | In Maid today | Proposal |
| --- | --- | --- | --- | --- |
| 1 | Several custom backgrounds | D1, `maid-module-imagery` on `maplibre-editor-layer-index` | nothing | yes |
| 4 | Custom data layers: several, from URLs, GeoJSON and PMTiles, tag filter | D3, data layers module | nothing | yes |
| 5 | Lenses (a restyling of the map for one theme), import and export | D5 | nothing | yes |
| 12 | Read-only feature categories | `maid-filters` | done (three states per filter, in the URL, stored) | yes, done |
| 13 | No labels under toolbar buttons | UI setting | partly (labels go away on phones only) | **no** (Tobias, 2026-10-13: Maid has tooltips) |
| 22 | Access field: every tagged access key, add a mode of transport | field `access` (U7 step 13) | being built | yes |
| 23 | Compact sidebar, feature type as its header | `maid-ui` | done | yes, done |
| 25 | Related tags below their field (`source:*`, `note:*`, `check_date:*`) | field row (U7) | done 2026-10-13: lines under the field for source, note and check date, add buttons in the label bar, an editor box; without the Mapillary, TILDA and surface parts | **yes** (Tobias, 2026-10-13) |
| 30 | One pane per job: Map Data, Map Display, Photos | top bar flyouts and dock | partly (filters flyout; no panes for data and photos yet) | yes, with D1 to D3 |
| 31 | No bottom bar | `maid-ui` | done | yes, done |
| 34 | What is in the URL | each module declares its parameters | partly (`map`, `id`, `filters`) | yes, per module |
| 3 | Favourite presets with number shortcuts | preset picker | done 2026-10-13: hearts in the type picker, favourites first, keys 4 to 9 and 0 (1 to 3 are the draw modes): change the selected feature's type, or add a feature of that type | **yes** (Tobias, 2026-10-13) |
| 7 | Side indicator: arrows on the left or right of the way while a side field has the focus | field-driven map overlay | nothing (the preview layer of U8 can carry it) | yes |
| 10 | Width band on the map while a width field has the focus; width fields per side | field-driven map overlay, preset changes | nothing | yes |
| 21 | Measuring tape for width fields | field button plus a map tool | nothing | **yes, build now** (Tobias, 2026-10-13: in a way that fits Maid) |
| 6 | Way-as-table: compare the tags of connected ways | a dock view | nothing | later |
| 11 | Live edits of others nearby (`@osm-editor-kit/live-touched`) | a module with a map layer | nothing | **no** (Tobias, 2026-10-13: ignore) |

## Street-level photos: D2, on `street-imagery` and `street-imagery-react`

| # | Feature in the fork | Where in Maid | In Maid today | Proposal |
| --- | --- | --- | --- | --- |
| 18 | Mapillary layer: age colours, own users highlighted, the selected way's images | `maid-module-street-imagery` config | nothing | yes |
| 19 | Mapillary image fields for all image keys, several images, show in the viewer | field type plus the viewer | nothing | yes |
| 20 | "Set photo from viewer" for every image key | viewer bar buttons | nothing | yes |
| 26 | Mapillary traffic signs: filter, see the sign, map it | module layer plus traffic sign field | nothing | later |
| 36 | infra3D links (sidebar and viewer bar) | link helper of `street-imagery` | nothing | yes, small |
| 24 | Surface and smoothness chosen by photo (`@osm-editor-kit/surface-smoothness-data`) | a field type in its own module | nothing | later |

## Traffic signs: a module of its own

| # | Feature in the fork | Where in Maid | In Maid today | Proposal |
| --- | --- | --- | --- | --- |
| 2 | Traffic sign field (`@osm-traffic-signs/id-field`) | a field type from a module | nothing | yes |
| 27 | Traffic sign fields for the way, the bike lanes and the sidewalks | preset changes plus the field | nothing | yes, after 2 |

## Radnetz and TILDA only: modules of `apps/radnetz-berlin`

| # | Feature in the fork | Where in Maid | In Maid today | Proposal |
| --- | --- | --- | --- | --- |
| 15 | Preset changes and the missing fields (separation, marking, buffer, `is_sidepath`, ...) | `presets: withChanges(...)` in the app's config | nothing (the config hook is planned, not built) | yes |
| 8 | TILDA bike infrastructure helper (`@tilda-geo/bicycle-infrastructure`) | an inspector section | nothing | yes |
| 32 | TILDA checklist: defaults to check, `oneway:bicycle`, wrong `cycleway:*:oneway` | the same section plus a validation rule | nothing | yes, with 8 |
| 33 | "I checked this" and "Verified", stored in the key-value DB | the same section; needs the login | nothing | later (needs the account) |
| 17 | Extract a side into a separate way | an operation | nothing (Maid has operations and their preview) | yes |
| 28 | Merge a cycleway and a footway into one path | an operation | nothing | yes |
| 9 | QA rules from TILDA and infraVelo | validation rules and a lens | nothing | later (a plan in the fork too) |
| 5b | The "Radnetz QA" lens | a lens in the app | nothing | yes, with D5 |
| 29 | Internal notes from TILDA | a notes provider (D3) | nothing | later (needs the TILDA login) |
| 35 | Progress tracking for the lines of a data layer | data layers module plus the key-value DB | nothing | later |
| 16 | Data index infraVelo, TILDA, OSM | reference for the rules, no code | – | no (stays a document) |
| 14 | Mapillary image from the field | replaced by 19 in the fork | – | no |

## What this asks of Maid before D6

These are the hooks the list needs that Maid does not have yet. Each is added when its first user is built, not earlier.

- Preset changes from the app's config (15, 27).
- Field types from modules (2, 19, 24) and buttons on a field row (20, 21).
- Map overlays driven by the field that has the focus (7, 10).
- A module's own URL parameters and stored settings (34).
- An account a module can use: the OSM login for the key-value DB (33, 35) and the TILDA login (29).

## Order proposed for D6

1. The app with its config: locale, brand, filters, preset changes (15).
2. D1, D3 data layers and D5 with the Radnetz QA lens (1, 4, 5).
3. D2 with the Mapillary settings and image fields (18, 19, 20, 36).
4. The two operations (17, 28).
5. Traffic sign field (2, 27).
6. TILDA section and checklist (8, 32), side indicator and width band (7, 10).
7. Everything marked "later".
