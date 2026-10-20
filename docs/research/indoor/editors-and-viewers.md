# Indoor editors, plugins and viewers: what exists and what Maid can reuse

Research note, 2026-10-20. Scope: JOSM indoor plugins, dedicated and historic indoor editors, MapLibre-based indoor viewers, recent community tools.

Legend for every claim:

- **[read]** the source page or file was fetched and read in this session.
- **[slides]** text extracted from the 2019 OsmInEdit slide deck (PDF, read with `pdftotext`).
- **[snippet]** only seen in search result text, not opened. Wiki.openstreetmap.org pages were **never fetched**, per the brief; wiki facts below are snippet-only.
- **[measured]** checked in the pinned local iD checkout (`.reference/id`, v2.42.2, commit 0194f39).
- **[inferred]** my reasoning, not stated by a source.

## Summary

- **JOSM is the only desktop editor with level support that I found, and it is thin.** The IndoorHelper plugin (last page change 2021-07-25 [read]) adds level insertion, an "apply" tagger and multipolygon buttons. JOSM core's level filter has been open since 2018 with its min/max-level defect still unresolved as of 2024 [read, ticket #16523].
- **The web editor that tried to fill the gap is OsmInEdit (ISC, Framagit).** Its 2019 deck describes a three-step editing hierarchy (street, building, level), floor-plan import and indoor presets [slides]. Its public mirror shows 166 commits, no releases and few stars [read]; current activity is unverified.
- **The viewer side is where the MapLibre reuse is.** `maplibre-gl-indoorequal` (BSD-3-Clause [read]) gives a level control with `setLevel`, a `levels` list and `levelschange` events on MapLibre. The indoorequal.org app behind it is AGPL-3.0 [read], so copy ideas, not code.
- **Most historic tools faded for reasons the sources repeat:** a schema change (IndoorOSM to Simple Indoor Tagging [snippet]), live-Overpass viewers that load slowly [slides], iD forks that are hard to keep current [slides], and floor-plan permission and copyright limits [slides, forum]. No dedicated editor has a current, maintained release that I could confirm.
- **For Maid:** build on Simple Indoor Tagging (`level=*`, `indoor=*`) and a level state with filters on the MapLibre layers, not on a relation hierarchy. Keep new-object-on-current-level, the three-step scope, and the iD validation exemption for different levels. Do not import code from AGPL projects without a licence decision. Automated runs must use fixtures, so no default tile server or Overpass call in tests.

---

## 1. JOSM plugins and core

### 1a. IndoorHelper (JOSM plugin)

- **What:** Helper plugin for creating, validating and viewing indoor maps with the Simple Indoor Tagging scheme. Source: JOSM plugin help page [read: https://josm.openstreetmap.de/wiki/Help/Plugin/IndoorHelper, a JOSM help wiki, not wiki.openstreetmap.org; last edit 2021-07-25, version 6].
- **Features the help page describes [read]:**
  - "Insert level" button: enter a level (for example 3, 5, -2), draw the first object of that level, and new objects get the current level tag on "apply".
  - "level checkbox": turns off automatic level tagging after first use.
  - "object list": predefined indoor objects with their tags.
  - Multipolygon "outer" and "inner" buttons (simple multipolygons only), a checkbox to turn the multipolygon function off, and an "apply" button that tags a way, node or the whole relation.
- **Not on the help page [read]:** room, door, stair or wall helpers; a level filter or AutoFilter; a validator; a MapCSS style; BIM import; a version number; a minimum JOSM version; a maintainer.
- **Snippet-only (wiki search text, not opened):** the wiki describes an AutoFilter workflow (select level, draw, apply), a recommended drawing order (rooms, corridors, stairs, then doors, then walls), a MapCSS style and a beta BIM import. Treat these as unverified.
- **Tech:** JOSM plugin (Java). Licence not checked. Source is the JOSM SVN tree (`plugins/indoorhelper`); the directory listing I tried returned 404, so I could not confirm its last revision.
- **State:** The help page was last edited 2021-07-25 [read]. Treat as low-activity; not verified further.

### 1b. JOSM core level selector and filter

- **What:** The core filter can show one level at a time. Forum evidence from 2020 says it "misses important features" [read: https://community.openstreetmap.org/t/best-indoor-mapping-tool/91421].
- **Open defect [read]:** Ticket #16523 (opened 2018-07-26, status New, last modified 2024-10-20) reports that the built-in filter ignores `min_level`/`max_level` and that building outlines do not show on the levels in the range. The reporter asks for `level`, `min_level`, `max_level` and `repeat_on` support. No maintainer response on the page.
- **Snippet-only:** Ticket #17109 says the filter does not parse multi-value levels such as `level=0-1` or `level=-1;0`. Ticket #14929, auto-generated numeric filters, is marked closed/fixed.
- **Workarounds the forum names [read]:** custom filters per level; custom MapCSS so that stacked floors get different colours (the 2020 and 2021 replies).

### 1c. JOSM and the broader indoor workflow

- Floor-plan background: JOSM supports image backdrops, but the 2021 forum reply calls it "inconvenient", and permission to use floor plans is the main blocker [read, forum].
- The 2025 KDE post (Volker Krause) says the hard part is geometry (rooms, corridors, walls) and that hand-measuring is laborious [read: https://planet.kde.org/volker-krause-2025-06-28-indoor-building-mapping-in-osm].

---

## 2. Dedicated and historic indoor editors

### 2a. IndoorOSM (tagging schema, not an editor)

- **What:** A 2011-era schema by Gomar1985. The wiki now marks it obsolete because of tag collisions, heavy relation use and direct use of element IDs [snippet].
- **Why it faded [snippet + inferred]:** Simple Indoor Tagging (`level=*`, `indoor=*`, no relations) replaced it as the consensus [slides, read: "No need for relations nor complex tags"].
- **Licence / source / state:** Not applicable (schema).

### 2b. iD-indoor (fork of iD)

- **What:** An iD fork for indoor work with a level selector that filters the map, plus presets for rooms, doors and corridors [snippet]. The 2019 deck calls it "Fork of iD", "hard to follow regular updates", with "basic level filtering and presets" and "no floor plan import" [slides].
- **Tags:** Presets based on OpenLevelUp's tagging; supports both IndoorOSM and Simple Indoor Tagging [snippet].
- **Source:** I could not locate the repository. `github.com/PanierAvide/iD-indoor` returned 404 [read]. Wiki search says the code is still available and that the author no longer maintains it [snippet]. Attribution conflicts: the wiki credits Adrien Pavie, a Polish page names PanierAvide [snippet].
- **Licence:** iD is ISC [measured: `.reference/id/LICENSE.md`]. The fork's licence is presumed ISC but not verified.
- **State:** Unmaintained [snippet, slides]. Successor named as OsmInEdit [snippet].

### 2c. OsmInEdit (web indoor editor, the most complete dedicated tool)

- **What:** A web editor for Simple Indoor Tagging. Presented at SotM 2019 by Adrien Pavie, Andreas Dirks, Hannes Geißelmann and Thomas Sontag [slides].
- **Features and editing model [slides, claims by the authors]:**
  - Floor plan import (slide 11, "Floor plan import").
  - Indoor-specific feature presets (slide 12).
  - A top-down editing hierarchy (slide 13):
    1. **Street mode:** overview only; panning and zooming.
    2. **Editing mode, single building:** edit the building outline and metadata (name, number of levels, height).
    3. **Editing mode, single level:** edit the level outline and its features (geometry, POIs).
  - "Simple and web-based similar to ID" (slide 14).
  - Next steps: 3D preview of edits, geolocated indoor images, semi-automated mapping tools (slide 16).
- **Limits the authors name [slides]:** no accurate GPS indoors; mapping 3D buildings in a 2D editor; floor plans are often private, and reuse may infringe copyright.
- **Community verdict [read, forum 2021]:** "quite polished" with a well-built indoor workflow; main downside is that it is a separate editor from JOSM's wider toolset.
- **Tech:** JavaScript per the mirror's file list (`package.json`, `src/`, `public/`, translation files); framework not confirmed [read]. Hosted at https://osminedit.pavie.info (dev at /dev/) [read, mirror README].
- **Source:**
  - Primary: https://framagit.org/PanierAvide/osminedit (read-only mirror linked from GitHub) [snippet: wiki infobox, not opened].
  - Mirror read: https://github.com/polimappers/OsmInEdit [read]. It states it is a read-only mirror of the Framagit project and a fork by PoliMappers, with 166 commits on master, no releases or packages, 3 stars, 2 open issues. Last commit date not visible. The README says contributors include Adrien Pavie (main developer) and a Daimler AG team as sponsor.
- **Licence:** ISC, copyright Adrien Pavie and Daimler AG, 2019 [read: mirror README; slides "ISC License"].
- **State:** Unclear. A July 2025 community forum thread asks whether it is unavailable [snippet]. No 2026 release found.

### 2d. OpenLevelUp (viewer, historic)

- **What:** A web map for browsing one building level by level. Per the 2015 mailing-list post, it queries Overpass for `indoor=*` plus `level=*` and filters features by the level being shown [snippet, talk-fr list].
- **Features [snippet]:** data filters (hide transcendent objects, show only the building area). No dedicated level-selector filter described on the wiki.
- **Slides [slides]:** "Live data everywhere", "Long loading time", "Not a great user experience".
- **Source / licence [snippet]:** version v3.0-alpha2 dated 2016-09-13, AGPL-3.0-or-later. The Framagit repo returned an anti-bot interstitial, not the project [read: framagit.org/PanierAvide/openlevelup]. The 2015 post also points to a GitHub `openlevelup` folder under PanierAvide.github.io.
- **State:** Last activity 2016 [snippet]. Not verified further.

### 2e. OsmInEdit's peers in the slide deck: OpenStationMap viewer

- Named on the 2019 deck as a viewer built by Roland Wagner and Roland Olbricht. Uses vector tiles, is fast, but is limited and focused on railway stations [slides].
- Wiki snippet: a project for mapping stations (routing, indoor, 3D) with openstationmap.org [snippet]. No repository or licence found [search].

### 2f. Termite (abandoned editor)

- Simple editor aimed at people without technical background, with a data model "loosely based on IndoorOSM" and routing from street into rooms [snippet].
- Development put on hold in October 2013 and "discontinued" per the wiki [snippet]. No release found.

### 2g. Osiris (server, 2016)

- An open-source indoor-map server on MongoDB with a Java REST layer and an Android sample app [read: https://community.openstreetmap.org/t/osiris-project/74924, forum announcement dated 2016-02-08]. No licence stated; no level or editing features described. Stale.

### 2h. osmtools-indoor (room browser)

- **What:** A client-side viewer for rooms in OSM buildings, built on Leaflet and Overpass. Supports `vertical_passage`, clickable stairs and deep links by `room` ref [read].
- **Data model [read]:** `building=yes` outer way with `level=0`, level subrelations `type=level`, rooms as `buildingpart=room` in those relations. This is the relation-based model, not Simple Indoor Tagging.
- **Editing:** none; editing happens in OSM [read].
- **Source:** https://github.com/clement-lagrange/osmtools-indoor (a fork of yarl/osmtools-indoor) [read]. 40 stars, 177 commits on gh-pages, GPL-3.0-or-later [read]. Last commit date not visible.
- **State:** Active by star count and commit count, no archive notice [read]; the README credits student work [read].

### 2i. Why the tools faded [inferred, supported by the sources above]

1. Schema churn: IndoorOSM, then OpenLevelUp's tagging, then Simple Indoor Tagging [snippet].
2. Viewers relied on live Overpass queries, which are slow [slides].
3. iD-based editors were forks that could not keep up with iD [slides].
4. JOSM's level filter defects stayed open for years [read, #16523].
5. Floor-plan permission and copyright limited what could be imported [slides, forum].
6. Geometry is laborious, and no tool made it cheap [read, KDE 2025].
7. Few maintainers. The OpenIndoor website has been down since 2023 [snippet].

---

## 3. MapLibre viewers: IndoorEqual and related

### 3a. maplibre-gl-indoorequal (MapLibre plugin)

- **What:** A plugin for MapLibre GL JS that adds indoor= data (vector tiles from indoorequal.org, or your own) with a level control [read: https://github.com/indoorequal/maplibre-gl-indoorequal].
- **Licence:** BSD-3-Clause [read, repo sidebar].
- **Peer version:** README recommends maplibre-gl 6.0.0 or newer [read]. An older README snippet says 3.0.0 [snippet]; pin the version tested.
- **API [read]:**
  - `new IndoorEqual(map, { apiKey })`, then `map.addControl(indoorEqual)` and `map.removeControl`.
  - Methods: `setLevel(level)`, `updateLevel(level)` (deprecated), `on`, `off`, `remove`, `loadSprite(baseUrl)`, `setHeatmapVisible`.
  - Properties: `level` (string), `levels` (array of levels in the current view).
  - Events: `levelchange` (string), `levelschange` (array).
  - Constructor options: `url`, `geojson` (keyed by layer name), `apiKey`, `layers`, `heatmap` (default visible).
- **Default tile server [read]:** `tiles.indoorequal.org`, needs a free key from indoorequal.com.
- **Not found in the page [read]:** how levels are taken from tags (`indoor=*`, `level=*`, `ref`), the layer and property names, zoom gating. The `src/layers.js` link returned 404 [read], so I could not check the filter expressions.
- **Tech:** npm package, Vite/Parcel/webpack examples in README [read].

### 3b. indoorequal.org (viewer app)

- **What:** A web viewer for indoor= data. Accepts vector tiles, GeoJSON, OSM and IMDF [read].
- **Licence:** GNU AGPL-3.0 [read]. Copy ideas, not code, unless Maid accepts AGPL.
- **Config [read]:** `config.json` with `mapTilerApiKey`, `tilesUrl` (TileJSON), `indoorEqualApiKey` (optional), `indoorMinZoom`.
- **Remote API [read]:** `window.postMessage` commands `preview` (file or URL), `level`, `coordinates`, `levels` (query, returns e.g. `['0','1','2']`).
- **Level selector [snippet]:** shown only when at least one indoor=* feature is in the data. An older OSM diary comment says tiles render only at zoom 17. Verify.
- **Stack [read]:** Yarn, Babel, Parcel, Docker/nginx, Transifex translations. Map library not named in the page; the repo is tagged mapbox-gl-js [read].
- **State [read]:** 697 commits on master, 67 stars, 11 open issues and 2 open PRs. No release date shown.

### 3c. How levels are presented and filtered on MapLibre

From the two repos [read]:

- A level control with `setLevel` and a read-only `levels` list, with events on change.
- A default indoor style and a heatmap layer that marks indoor-mapped areas (toggle with `setHeatmapVisible`).
- Feature selection per level happens in the tile style (filter expressions on the level property). Exact tag and property names are not confirmed.

### 3d. OpenIndoor (3D viewer)

- Repo: https://github.com/open-indoor/openindoor6 [read]. AGPL-3.0 [read].
- Renders building, floors and indoor modes in 3D from Simple Indoor Tagging data, with GeoJSON drag-and-drop preview [read].
- MapLibre GL JS 2.1.6 in the library example [read], so the example is pinned to an old MapLibre; the current app's version was not checked.
- Hosted app: app.openindoor.io [read]. Open issues 28, PRs 2, 55 commits, 75 stars, no release [read]. Wiki says the old domain was unavailable from 2023 [snippet].

### 3e. KOSMIndoorMaps (KDE, Qt/QML)

- **What:** A library and QML component for multi-floor OSM maps, mainly train stations. Floors are split, with stairs, escalators and lifts, and MapCSS styling with picking and an offline tile-cache API [snippet: KDE API docs and package listings; the repo README did not load].
- **Data:** OSM raw tiles from maps.kde.org [read].
- **Licence:** LGPL-2.0-or-later [snippet, package listing]. The KDE repo README did not load [read: invent.kde.org raw README 404].
- **Source:** invent.kde.org/libraries/kosmindoormap, created 2020-10-18, 1,728 commits, 109 tags [read].
- **Relevance:** Qt, not MapLibre. Useful as a reference for level separation and transit-style indoor navigation.

---

## 4. Recent community activity (2025 to 2026)

- **KDE, Volker Krause, 2025-06-28:** Indoor mapping post. Notes that floor-split maps are usable with partial data, but routing needs complete data [read: planet.kde.org].
- **FOSSGIS 2025 "Indoor OSM" BoF (2025-03-28):** Open discussion, speakers Tobias Knerr and Volker Krause. Goals: exchange, indoor tagging, collaboration. No tools named [read: pretalx].
- **Indoor OSM Workshop 2026:** Wiki snippet says 11 and 12 July 2026 in Berlin, covering open tagging issues and compatibility between apps [snippet]. The date has passed (today is 2026-10-20); outcomes not checked.
- **FOSSGIS 2026 KDE post (2026-04-04):** Open issues named: more vertical detail, inclined areas and 2D walls. Recurring theme: "none of that has a good solution yet" [snippet].
- **No new 2025–2026 indoor editor release found** in this search.

---

## Reusable for Maid (MapLibre)

Licence first: Maid's own licence was not checked by this research. Before copying any code, decide whether Maid accepts AGPL-3.0 or GPL-3.0.

| Source                  | Licence             | What to reuse                                                                                                                                                                                                                                                                                            | How                                                                                                                                                                            |
| ----------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| maplibre-gl-indoorequal | BSD-3-Clause [read] | Level control API shape: `setLevel`, `levels`, `levelchange`/`levelschange`; heatmap-over-indoor idea                                                                                                                                                                                                    | Copy the API shape into our renderer package; check the BSD notice before any code copy. Tile server needs a key and is external, so keep out of automated runs (core rule 1). |
| indoorequal.org         | AGPL-3.0 [read]     | Ideas only: `indoorMinZoom`, remote command API via postMessage, GeoJSON preview                                                                                                                                                                                                                         | No code copy unless licence allows.                                                                                                                                            |
| OsmInEdit               | ISC [read]          | Editing hierarchy (street, building, level), floor-plan import, indoor presets                                                                                                                                                                                                                           | Reuse the mode model and the building/level scope rule; check ISC notice for code.                                                                                             |
| iD (pinned checkout)    | ISC [measured]      | Indoor-aware validation: `crossing_ways.js` treats two `indoor` ways on different `level` values as not crossing (lines 40-41 define the test, line 87 applies it); `close_nodes.js` treats indoor ways with a 0.01 tolerance (lines 34, 122); `features.js` classifies `indoor`/`indoormark` (line 135) | Port the rule idea into Maid's validation module, with an iD ISC attribution.                                                                                                  |

Concrete suggestions, each marked inferred where it goes beyond the sources:

1. **Data model:** Simple Indoor Tagging only (`level=*`, `indoor=*`), no relations for rooms. Matches the community consensus [slides, read]. Do not support IndoorOSM [snippet: obsolete].
2. **Level state:** A small store (Zustand, per repo convention) holding the current level, the list of levels present in the view, and an "all levels" option. Filter MapLibre layers with expressions on `level`. Inferred from the IndoorEqual API shape [read].
3. **Current-level tagging:** New objects get the current `level`, as IndoorHelper's "Insert level" and "apply" do [read]. Keep a switch to turn it off, as IndoorHelper's checkbox does.
4. **Stacked floors:** Draw other levels dimmed or in a different colour, as the forum workaround suggests [read, forum].
5. **Scope modes:** Street (overview), building (outline and metadata: name, levels, height), level (features). Inferred from OsmInEdit's hierarchy [slides].
6. **Floor plans:** An image overlay per level, with a clear licence and permission note in the UI, since permission is the blocker [slides, forum].
7. **Fixtures:** Level data in tests comes from frozen fixtures under `tools/mock-osm-api`. No Overpass or indoorequal tile calls in automated runs (AGENTS.md rule 1). Overpass-based viewers are the thing to avoid [slides].
8. **Renderer boundary:** Imperative MapLibre calls for level switching (e.g. `setFilter`) stay in the renderer package, per AGENTS.md.

## Open questions

1. JOSM IndoorHelper: current version, JOSM minimum version, licence and whether the MapCSS and BIM import on the wiki exist. Source: SVN tree, which I could not open (404).
2. iD-indoor: repository location and licence. The GitHub URL 404s; the wiki (not fetched) names the fork.
3. OpenLevelUp: current repository. The Framagit page returned an anti-bot interstitial, not the project.
4. OsmInEdit: current activity and the July 2025 "unavailable?" thread. Last commit date unknown.
5. indoorequal: how levels are derived from tags (layers.js 404; no tile schema page read). Which property decides the level filter.
6. OpenStationMap: repository and licence not found.
7. KOSMIndoorMaps: exact licence (snippet says LGPL-2.0-or-later) and latest release.
8. Whether Maid's own licence allows AGPL or GPL code. Not checked here.
9. Outcome of the Indoor OSM Workshop 2026 (11-12 July 2026, Berlin): not checked.
10. Ticket #17109 and #14929 details (snippet only, not fetched).

## Sources

Read (fetched or extracted):

- JOSM IndoorHelper help: https://josm.openstreetmap.de/wiki/Help/Plugin/IndoorHelper (JOSM help wiki, not wiki.openstreetmap.org)
- JOSM ticket #16523: https://josm.openstreetmap.de/ticket/16523
- maplibre-gl-indoorequal: https://github.com/indoorequal/maplibre-gl-indoorequal
- indoorequal.org: https://github.com/indoorequal/indoorequal.org
- OsmInEdit mirror: https://github.com/polimappers/OsmInEdit
- OsmInEdit 2019 slides (SotM): https://2019.stateofthemap.org/attachments/VAADJ9_Sontag_Dirks_Geisselmann_Pavie_osminedit.pdf
- osmtools-indoor (clement-lagrange): https://github.com/clement-lagrange/osmtools-indoor
- openindoor6: https://github.com/open-indoor/openindoor6
- KOSMIndoorMaps KDE API docs: https://api.kde.org/kosmindoormap/html/index.html (search snippet only, not opened; listed here for reference)
- KOSMIndoorMaps repo: https://invent.kde.org/libraries/kosmindoormap
- Osiris forum announcement: https://community.openstreetmap.org/t/osiris-project/74924
- Forum "Best indoor mapping tool": https://community.openstreetmap.org/t/best-indoor-mapping-tool/91421
- Volker Krause, indoor mapping 2025: https://planet.kde.org/volker-krause-2025-06-28-indoor-building-mapping-in-osm
- FOSSGIS 2025 "Indoor OSM" BoF: https://pretalx.com/fossgis2025/talk/DSHE3R/
- iD pinned checkout (local, measured): `.reference/id` (v2.42.2, commit 0194f39), files `modules/validations/crossing_ways.js`, `modules/validations/close_nodes.js`, `modules/renderer/features.js`, `LICENSE.md`

Not reachable or not found:

- https://github.com/PanierAvide/iD-indoor (404)
- https://github.com/PanierAvide/OpenLevelUp (404)
- https://framagit.org/PanierAvide/openlevelup (anti-bot interstitial)
- https://raw.githubusercontent.com/indoorequal/maplibre-gl-indoorequal/main/src/layers.js (404)
- https://invent.kde.org/libraries/kosmindoormap/-/raw/master/README.md (404)
- https://josm.openstreetmap.de/browser/osm/applications/editors/josm/plugins/indoorhelper (404)

Search snippets only (not opened; wiki pages were never fetched):

- Wiki IndoorOSM, OsmInEdit, iD-indoor, OpenLevelUp, Termite, OpenIndoor, OpenStationMap, Indoor OSM Workshop 2026, Simple Indoor Tagging: https://wiki.openstreetmap.org/wiki/IndoorOSM, https://wiki.openstreetmap.org/wiki/OsmInEdit, https://wiki.openstreetmap.org/wiki/ID-indoor, https://wiki.openstreetmap.org/wiki/OpenLevelUp, https://wiki.openstreetmap.org/wiki/Termite, https://wiki.openstreetmap.org/wiki/OpenIndoor, https://wiki.openstreetmap.org/wiki/OpenStationMap, https://wiki.openstreetmap.org/wiki/Indoor_OSM_Workshop_2026
- JOSM tickets #17109 and #14929: https://josm.openstreetmap.de/ticket/17109 and https://josm.openstreetmap.de/ticket/14929
- OpenLevelUp 2015 mailing-list posts: https://lists.openstreetmap.org/pipermail/talk-fr/2015-March/075561.html
- indoorequal.org OSM diary comment about zoom 17: https://www.openstreetmap.org/user/zby-cz/diary/406992 (not opened)
- KOSMIndoorMaps package listings (licence, version): https://archlinux.org/packages/kde-unstable/x86_64/kosmindoormap

No file other than this one was written. Nothing was posted, commented, opened as an issue, or sent to anyone.
