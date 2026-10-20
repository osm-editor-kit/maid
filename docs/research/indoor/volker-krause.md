# Volker Krause: mapping building interiors in OSM

Research for the indoor and building-levels Maid variant. Read on 2026-10-20. No posts, comments, issues or contact; no edits outside this file; no installs or builds.

**How the sources were read.** Most pages were read through a summarising fetch tool, not as raw HTML. Quotes below are as the tool returned them and were not checked against the live page. Where a claim comes from a search snippet only, or from a fetch that failed, it is marked. Facts marked **[read]** came from a fetched page or file. **[snippet]** came only from search result text. **[inferred]** is my reasoning. Several pages returned 404 (listed under Open questions), so the code-level claims are thinner than the blog-level claims.

Related notes in this folder (not re-verified here): [tagging-model.md](tagging-model.md) (wiki schema), [editors-and-viewers.md](editors-and-viewers.md) (editors and viewers).

## Summary

- Krause's position: the indoor problem is completeness and level assignment, not rendering. Routers need every corridor, door, stair and elevator, because humans fill gaps in a map and routers do not; levels decide whether a router can go up or down at all [read: blog 2025-06-28].
- He relies on Simple Indoor Tagging (SIT) with `level`, `indoor=*`, `repeat_on`, `level:ref`, plus `access`/`entrance`/`exit` on doors. The 2026 community workshop is already moving away from some of his blog-era tags (`indoor=door` to `door=*`), so Maid should not hard-code the 2025 blog tag set [read: wiki workshop 2026; blog 2025-06-28].
- His KDE code (KOSMIndoorMap, LGPL-2.0-or-later [read: source header]) is a renderer and a router, not an editor. Validation happens by eye: the level selector in the Transitous map view and JOSM's own level selector [read: Transitous 2025 post]. He names no validator rules.
- The most reusable ideas for Maid: a level state that filters and dims other floors; a tolerant level parser with edge-case tests; validation rules for missing levels, door-to-wall and routability gaps; "copy to level above/below" with `repeat_on`. The licence is the main blocker for copying code: LGPL-2.0+ against Maid's ISC licence, so reimplement from the schema and treat the KDE code as a reference only, pending a decision.
- The open problems he lists (thin versus thick walls, inclined areas, 2D walls, fractional levels, level domains, service counters, door semantics) are unresolved in the community as of mid-2026, so Maid should flag them in the data, not pick winners [read: FOSSGIS 2026 post; wiki workshop 2026].

## Findings

### 1. Problems he describes

**Geometry and completeness (blog 2025-06-28) [read]**

- Geometry is traced from to-scale plans in JOSM with PicLayer and placed by three-point calibration against the existing building outline: https://www.volkerkrause.eu/2025/06/28/osm-mapping-building-interiors.html
- Walls between rooms are mapped as one-dimensional lines ("thin wall" model). Corridors and open areas must be mapped, and missing outer walls added. Same URL.
- "So completeness is important here." and "Humans tend to automatically fill those in when looking at a map, but routers wont." Same URL.
- Without door nodes, "routers will steadfastly claim rooms are impossible to enter." Doors not meant for the public need `access`, `entrance` or `exit`, otherwise "routers will otherwise happily exploit this new shortcut." Same URL.

**Level handling (blog 2025-06-28; Transitous post 2025-06-14) [read]**

- Stairs, elevators, escalators and ramps need a `level` tag holding the set of floors reachable from them: "Without that routers wont find their way up or down a building." https://www.volkerkrause.eu/2025/06/28/osm-mapping-building-interiors.html
- Floor-level separation is "the OSM aspect that more often needs fixes" in the data he uses for Transitous. Two failure modes: an element on the wrong floor (Bremen Central station: railway tracks shown on the passenger level, though they belong one level up), and an element with no level, which then shows "on all levels". In most cases "adding or fixing the level tag is all that's needed." https://www.volkerkrause.eu/2025/06/14/transitous-adding-data.html

**Routing-blocking gaps (routing observations, Feb 2024) [read: mailing list post]**

- Implicit corridor walls in SIT (`indoor=corridor`) do not match real corridors, which are often open at one end or bordered by shops or platforms. Strict reading makes many stations unreachable; dropping the walls routes people through building walls. https://lists.openstreetmap.org/pipermail/indoor/2024-February/000012.html
- Outer building walls: outlines do not match the ground-floor walls, and some areas open to the outside. https://lists.openstreetmap.org/pipermail/indoor/2024-February/000012.html
- Service counters (bakeries, fast food, ticket offices) are often tagged `indoor=room` with no door, so routing cannot reach the counter. https://lists.openstreetmap.org/pipermail/indoor/2024-February/000012.html
- Stair cut-outs and doors to rooms, staircases and elevator cabins are often missing; the result is "large detours or inaccessible areas". https://www.volkerkrause.eu/2024/03/02/osm-hackweekend-karlsruhe-february-2024.html [read: summary of the post]
- Elevator routing in Kongress was limited because "the map data around elevators isn't good enough yet." https://www.volkerkrause.eu/2024/07/06/kde-kongress-venue-maps.html [read: summary]

**Rendering (Itinerary 2020) [read]**

- The default OSM renderer shows multi-level stations as one flat view; "amenities are spread over three floors which you cannot tell apart". The data is there: "The information on which level things are is all there though." https://www.volkerkrause.eu/2020/06/13/kde-itinerary-osm-indoor-maps.html

**Open problems, 2026 (FOSSGIS and workshop) [read]**

- Third-dimension detail, inclined areas and 2D walls: "none has a good solution yet". https://www.volkerkrause.eu/2026/04/04/osm-fossgis-conferenz-2026.html
- Routing needs graph-based or area-based algorithms and complete barrier data; BIM geometry "must be significantly reduced/simplified" before import. https://www.volkerkrause.eu/2026/07/18/osm-indoor-workshop-july-2026.html
- Area-based routing has trouble with directional costs on inclined ways. Graph-based routing (TU Dresden) handles narrow corridors better and open halls worse. Same FOSSGIS 2026 post.

**Validation (what he says and does not say)**

- The blog post names no validator, no JOSM validator rule and no QA tool. Checking is visual: "An editor that can do floor-level filtering is still useful." https://www.volkerkrause.eu/2025/06/28/osm-mapping-building-interiors.html [read]
- The Transitous map shows a floor selector (lower right, when zoomed in) to see which floor an element sits on or whether it has none; `indoor=` is suggested for small elements; JOSM has a level selector top left. https://www.volkerkrause.eu/2025/06/14/transitous-adding-data.html [read]
- Osmose check item 1300 exists for SIT; the page itself was not readable (404) [snippet, via the SIT wiki summary: https://wiki.openstreetmap.org/wiki/Simple_Indoor_Tagging].

### 2. Tagging schemas and their pitfalls

**Schema he relies on**

| Tag                                                                  | Use in his posts                                                                            | Source                                                            |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `level`                                                              | Floors for every indoor element; the set of floors for stairs, elevators, escalators, ramps | blog 2025-06-28 [read]                                            |
| `indoor=room`, `corridor`, `area`, `door`, `wall`, `level`, `column` | element type; the blog names room, corridor, open area, and door                            | blog 2025-06-28; wiki SIT [read]                                  |
| `access`, `entrance`, `exit` on doors                                | non-public doors                                                                            | blog 2025-06-28 [read]                                            |
| `name`, `ref`, `room`                                                | names, room numbers, room purpose                                                           | blog 2025-06-28 [read]                                            |
| `door` width/opening                                                 | wheelchair routing                                                                          | blog 2025-06-28 [read]                                            |
| `highway=steps`, `highway=elevator`                                  | stairs, lifts                                                                               | blog 2025-06-28 [read]                                            |
| `amenity=toilets`, `tactile_paving`, `handrail`                      | accessibility                                                                               | blog 2025-06-28 [read]                                            |
| `repeat_on`                                                          | identical copies on other floors                                                            | wiki SIT via summary [read]                                       |
| `level:ref`                                                          | signed floor label                                                                          | wiki SIT via summary [read]; also in KOSMIndoorMap source (see 3) |
| `min_level`, `max_level`, `non_existent_levels`                      | building ranges                                                                             | wiki SIT via summary [read]; mapdata.cpp [read]                   |

The blog post does not mention `repeat_on`, `level:ref`, `min_level`, `max_level` or `non_existent_levels` [read: blog summary]. These are the SIT extras his code handles.

**Pitfalls and conflicts found in the sources**

- **`indoor=door` is being phased out.** The 2026 workshop agreed node doors tagged `door=*` remain the standard, way-doors were rejected, and `indoor=door` "should be phased out". The blog still tells mappers to use `indoor=door`. https://wiki.openstreetmap.org/wiki/Indoor_OSM_Workshop_2026 [read: summary]
- **Door semantics are open.** Whether a frame without a door counts as a door, whether folding doors can hold a door, and how to define opening direction for points. Wheelchair routing needs the opening mechanism and direction. https://www.volkerkrause.eu/2026/07/18/osm-indoor-workshop-july-2026.html [read]
- **Inverse ranges (`5-3`) and unordered sets** are "highly discouraged and warned about by validators" but should be read as equivalent by tolerant parsers. https://wiki.openstreetmap.org/wiki/Indoor_OSM_Workshop_2026 [read: summary, quote as returned]
- **Fractional levels (0.5, 1.5) are used in practice but undefined.** The 2026 workshop ran out of time. The KOSMIndoorMap code stores tenths (see 3). https://wiki.openstreetmap.org/wiki/Indoor_OSM_Workshop_2026 [read]; a 2017 talk-list thread asked the same question and got no settled answer [snippet: https://lists.openstreetmap.org/pipermail/talk/2017-December/079904.html].
- **Corridors:** SIT's implicit walls for `indoor=corridor` conflict with real corridors (see 1). The workshop wants an SIT edit saying corridors imply no walls. https://wiki.openstreetmap.org/wiki/Indoor_OSM_Workshop_2026 [read]
- **Thick versus thin walls:** the workshop agreed thin walls are preferred where viable, and that thick walls are needed for complex cases, with door openings in thick walls. A vote was held on Frank's proposal; the result is not on the page. https://wiki.openstreetmap.org/wiki/Indoor_OSM_Workshop_2026 [read]
- **`layer` is not a floor.** The meeting notes say `layer` is legacy renderer tagging and does not imply a floor. `level=*` is allowed everywhere; the meeting moved away from a strict indoor/outdoor split. https://wiki.openstreetmap.org/wiki/Indoor_OSM_user_meeting_at_FOSSGIS-Konferenz_2026 [read]
- **Parser pitfalls in his own code** (KOSMIndoorMap `levelparser.cpp`, read via summary; line numbers approximate):
  - A comma followed by a non-digit is rewritten to `;`; otherwise to a decimal point.
  - The parser multiplies by 10 and rounds, so 0.5 becomes 5 and 1.25 becomes 13.
  - A range steps by 10, so `0.5-2` yields 5 and 15 but not 20: a fractional end point is dropped.
  - Labels are not rejected. `"Level 2"` yields 20, `"A1"` yields 10, `"B-2"` yields -20. A `level:ref` value must never reach the level parser.
  - A leading `;` may read index -1 (a reported out-of-bounds read, not verified).
  - Source: https://invent.kde.org/libraries/kosmindoormap/-/raw/master/src/map/loader/levelparser.cpp [read: summary]
- **Building-level expansion shadows `level`/`repeat_on`** in `mapdata.cpp`: if `building:levels` or `max_level` is set, the function returns early and does not parse the element's own `level` and `repeat_on`. https://invent.kde.org/libraries/kosmindoormap/-/raw/master/src/map/loader/mapdata.cpp [read: summary]

### 3. Tooling he built or proposes

**KOSMIndoorMap (KDE library; renderer and router, not an editor)** [read unless marked]

- Purpose: "OSM multi-floor indoor map renderer", for large train stations and airports. Floors are separated, and users move between floors by stairs, escalators or elevators. Platforms and airport gates are identified. Styling is MapCSS. Used by KDE Itinerary and Kongress. https://invent.kde.org/libraries/kosmindoormap ; https://invent.kde.org/libraries/kosmindoormap/-/raw/master/README.md
- Dynamic style reload in development: style files with the same names in the asset directories override the compiled-in ones, and are reevaluated without a restart. https://invent.kde.org/libraries/kosmindoormap/-/raw/master/README.md
- Level model (mapdata.cpp [read: summary]): elements are placed in a level map; a base level `MapLevel{}` holds elements with no level; `repeat_on` and `level` are parsed by the same callback, so an element with both is added to both sets. Elements whose opacity is below 1 are marked "dependent". `filterLevels()` removes non-base levels where every element is dependent. `level:ref` is the display name; `name` is used only for relations whose members are all `shell` or `buildingpart`.
- Routing (blog and talk summaries [read]): area-based, "solely on areas", no explicit graph; Recast Navigation navmesh [read in FOSSGIS 2026 summary; the Akademy 2024 slides are [snippet]]. Stairs are off-mesh links, so the router can pass through floor cut-outs. Room types get different cost factors, so corridors are preferred to lecture halls. Emergency exits are handled differently from doors. Bollards, gates and turnstiles do not block. https://www.volkerkrause.eu/2024/03/02/osm-hackweekend-karlsruhe-february-2024.html
- Walls are dropped around elevators and stairs with no door nodes, which "may route people in from the wrong side", but "is still better than no access". Same URL.
- Navmesh code (`navmeshbuilder.cpp`, a per-node level map, link direction, escalator and moving-walkway area types) [snippet only: api.kde.org page returned 404].
- Not present in the README: validation, editing, a tag-scheme list, a level-filter UI [read].

**Kongress (event companion app; uses KOSMIndoorMap)** [read: summary]

- Event-specific MapCSS style that imports the default style and changes colours and labels for relevant rooms.
- Temporary content (registration desk, coffee bar, sponsor stand) as an OSM changeset file applied on top of the loaded data, as additions, changes or removals. This is a local overlay, not an upload.
- `opening_hours` is parsed for shops and amenities and can grey out closed places; he suggests generalising it to any tag. https://www.volkerkrause.eu/2024/07/06/kde-kongress-venue-maps.html

**JOSM workflow (blog 2025-06-28) [read]**

- PicLayer for the plan image: auto-calibration by picking three points on the plan, entering the real distances, and matching three OSM nodes. A step-by-step animation is linked from the post (wiki PicLayer auto-calibration gif).
- Angle snapping and measurement plugin for drawing walls. Thin walls as lines. Flatpak JOSM needs filesystem access to open local plan images.
- He does not describe a JOSM level-tagging helper; the JOSM level selector is used [read: Transitous post].

**Transitous map (level viewer)** [read: summary] — floor selector when zoomed in, to check for elements on the wrong floor or with no level. https://api.transitous.org/

**Proposed, not built** [read]

- Floor-level checks through the Transitous viewer and JOSM, and a "multi-day in-person workshop" for the hard cases (FOSSGIS 2026 post).
- Pedestrian and wheelchair routing as well as public transport, with a shared dynamic-data layer (FOSSGIS 2026 post). Out of scope for Maid.

### 4. Ideas for Maid

Each item says what it is, where it comes from, and whether it is my inference. Nothing here has been checked against a Maid design doc.

1. **Level state as a first-class UI.** A current-level control built from the level values present in the view (set membership, not a single number), plus a "show other levels dimmed" mode. Source: KOSMIndoorMap `filterLevels` and dependent-element logic; Transitous floor selector [read]. The dimming is my suggestion [inferred].
2. **A tolerant level parser in the model package**, with unit tests that pin the edge cases above: `0;1`, `0-1`, `-2-5`, `5-3` (warn but accept), `0.5`, `1.5`, `"Level 2"` and `"B-2"` (never parsed as levels), a trailing `;`. Keep fractional values out of the rendered level number: store level and `level:ref` separately. Source: levelparser.cpp [read: summary]; test cases [inferred].
3. **Validation rules** for `packages/validation` (its `crossing-ways` rule is the pattern to follow):
   - Indoor element without `level`, or an element with no level shown on every floor (Transitous post [read]).
   - Door node not on a mapped wall (SIT pitfall [read: wiki summary]).
   - Stairs, elevators and escalators with no level list, or a level list that does not cover the floors their doors reach [read: blog; inferred the cross-check].
   - `indoor=door` (warn: phasing out per 2026 workshop) and `door=*` missing on a door node [read: workshop; inferred].
   - Inverse range and duplicated level values [read: workshop].
   - Room with no door node and no connected corridor: the "impossible to enter" case [read: blog]. This is a routability check [inferred as a rule].
4. **Routability check (editor feedback, not a router).** For each room, is there a door-connected path to a building entrance through the level graph? Report the disconnected rooms and the missing door or stair. Source: his repeated point that gaps make rooms unreachable [read]. The graph itself is my design [inferred].
5. **Copy across levels with `repeat_on`.** Copy a selected element to the level above or below and add that level to the original's `repeat_on`. Matches SIT; the similar "apply" action in JOSM's IndoorHelper is in [editors-and-viewers.md](editors-and-viewers.md) [read there]. [inferred for the exact UX.]
6. **Overlay layer for temporary content.** Event or temporary features applied on top of the base data and clearly separated from the mapped data, as his Kongress diff does. Maid could keep these in a local draft, never uploaded by automation (core rule 1 of AGENTS.md). Source: Kongress post [read]; the fit with Maid is my inference.
7. **Level-aware style hot reload.** A development switch that re-reads style files without a restart, as KOSMIndoorMap does (README [read]). Maid is MapLibre, not MapCSS, so the idea is the workflow, not the format.
8. **Thin-wall default with an explicit thick-wall option**, both rendered, with door openings kept on thick walls, as the 2026 workshop leaned [read]. Keep thin walls as the default. Flag, do not decide, the unresolved cases.
9. **Accessibility layer** (`tactile_paving`, `handrail`, toilets, door width) as optional fields in the same inspector, since he lists them as the next layer after geometry [read].

### 5. Licences

| Source                                                  | Licence                                                                  | Status                                                                                |
| ------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| KOSMIndoorMap source (`mapdata.cpp`, `levelparser.cpp`) | LGPL-2.0-or-later, copyright Volker Krause 2020, from the SPDX header    | [read] per-file. Repo-wide COPYING returned 404, so not confirmed for the whole repo. |
| Maid (this repo)                                        | ISC, `LICENSE.md`                                                        | [read]                                                                                |
| JOSM PicLayer                                           | Not checked this session. A 2009 Debian review said GPL-2+; that is old. | [snippet]                                                                             |
| JOSM IndoorHelper                                       | Not checked.                                                             | -                                                                                     |
| OSM wiki text (SIT, Key:level, workshop pages)          | CC BY-SA 2.0 (Legal FAQ page footer)                                     | [read]                                                                                |
| OSM map data                                            | ODbL (the Legal FAQ text, without a version)                             | [read]                                                                                |
| Recast Navigation                                       | zlib, from memory                                                        | [inferred]; GitHub LICENSE page returned 404                                          |
| Blog and mailing-list text                              | Not stated in what I read                                                | -                                                                                     |

**Implication for Maid [inferred; a licence decision for Tobias].** Maid is ISC and the KDE code is LGPL-2.0+. Copying or porting the parser or the level model would bring LGPL terms into this code. Safer: implement from the SIT schema and the test cases above, and use KOSMIndoorMap only as a reference for behaviour. The same caution applies to the AGPL viewer noted in [editors-and-viewers.md](editors-and-viewers.md). Nothing here is legal advice.

## Open questions

- **Fractional levels:** the workshop left the syntax undefined. Maid's parser needs a decision: store tenths (KDE), keep labels out of the level number, or flag fractions as unsupported. Who decides, and when? [open]
- **Thick-wall vote:** the outcome of Frank's proposal is not on the workshop page. Check the live page or the indoor mailing list. [open]
- **`indoor=door` deprecation timeline:** the workshop says phase out; no date is given. Check the SIT talk page before writing a rule. [open]
- **Level domains and site relations** for connected buildings with different floor heights: "very complex and not yet worked out". [open]
- **`repeat_on` on relations and whether the start level is included:** the SIT summary and the KDE code may differ. Check mapdata.cpp line by line, which I could not do (raw file fetched via summary only). [open]
- **Osmose 1300 rules:** the page returned 404, so I cannot list the checks. [open]
- **KOSMIndoorMap repo-wide licence:** COPYING returned 404. The per-file headers are LGPL-2.0-or-later. [open]
- **Navmesh and routing code:** `navmeshbuilder.cpp` and the API docs returned 404. The routing description rests on blog summaries and a search snippet about the Akademy 2024 slides. [open]
- **Whether KOSMIndoorMap has any editing or validation** beyond the README: none found. [open]
- **Verbatim wording:** every quote here came through a summarising fetch. Re-check any quote before it goes into a doc or a PR. [open]

## Sources

Read directly (fetched and summarised by the fetch tool):

- Blog, indoor mapping, 2025-06-28: https://www.volkerkrause.eu/2025/06/28/osm-mapping-building-interiors.html
- Blog, Transitous adding data, 2025-06-14: https://www.volkerkrause.eu/2025/06/14/transitous-adding-data.html
- Blog, Itinerary OSM indoor maps, 2020-06-13: https://www.volkerkrause.eu/2020/06/13/kde-itinerary-osm-indoor-maps.html
- Blog, Karlsruhe hack weekend, 2024-02/03: https://www.volkerkrause.eu/2024/03/02/osm-hackweekend-karlsruhe-february-2024.html
- Blog, KDE Kongress venue maps, 2024-07-06: https://www.volkerkrause.eu/2024/07/06/kde-kongress-venue-maps.html
- Blog, FOSSGIS 2026, 2026-04-04: https://www.volkerkrause.eu/2026/04/04/osm-fossgis-conferenz-2026.html
- Blog, OSM Indoor Mapping Workshop 2026, 2026-07-18: https://www.volkerkrause.eu/2026/07/18/osm-indoor-workshop-july-2026.html
- Blog archive (search only): https://www.volkerkrause.eu/
- Mailing list, Indoor Routing Observations, 2024-02-26: https://lists.openstreetmap.org/pipermail/indoor/2024-February/000012.html
- Wiki, Simple Indoor Tagging: https://wiki.openstreetmap.org/wiki/Simple_Indoor_Tagging
- Wiki, Indoor OSM Workshop 2026: https://wiki.openstreetmap.org/wiki/Indoor_OSM_Workshop_2026
- Wiki, Indoor OSM user meeting at FOSSGIS 2026: https://wiki.openstreetmap.org/wiki/Indoor_OSM_user_meeting_at_FOSSGIS-Konferenz_2026
- Wiki, OSM Indoor Meeting 2025-06-04 (no level content on the page): https://wiki.openstreetmap.org/wiki/OSM_Indoor_Meeting_2025-06-04
- Wiki, Legal FAQ (licence text): https://wiki.openstreetmap.org/wiki/Legal_FAQ
- KOSMIndoorMap README: https://invent.kde.org/libraries/kosmindoormap/-/raw/master/README.md
- KOSMIndoorMap `src/map/loader/mapdata.cpp` (raw, master): https://invent.kde.org/libraries/kosmindoormap/-/raw/master/src/map/loader/mapdata.cpp
- KOSMIndoorMap `src/map/loader/levelparser.cpp` (raw, master): https://invent.kde.org/libraries/kosmindoormap/-/raw/master/src/map/loader/levelparser.cpp
- KOSMIndoorMap repo page: https://invent.kde.org/libraries/kosmindoormap
- Transitous map view: https://api.transitous.org/
- JOSM PicLayer help (search result only, not fetched): https://josm.openstreetmap.de/wiki/Help/Plugin/PicLayer

Search snippet only (not opened):

- Akademy 2024 slides on Kongress venue maps, Recast Navigation and routing profiles: https://conf.kde.org/event/6/contributions/196/attachments/106/135/kde-akademy2024-kongress-venue-maps.pdf
- Navmesh builder source: https://api.kde.org/kosmindoormap/html/navmeshbuilder_8cpp_source.html (404 when fetched)
- 2017 fractional-level thread, Simon Poole reply: https://lists.openstreetmap.org/pipermail/talk/2017-December/079904.html and https://lists.openstreetmap.org/pipermail/talk/2017-December/079905.html
- Talk page for SIT: https://wiki.openstreetmap.org/wiki/Talk:Simple_Indoor_Tagging

Failed to fetch (404 or not reachable): planet.kde.org FOSSGIS 2026 post (the blog copy was read instead); planet.kde.org FOSSGIS 2025 post; api.kde.org KOSMIndoorMap index; invent.kde.org COPYING; Osmose item 1300 page; Recast Navigation LICENSE on GitHub.
