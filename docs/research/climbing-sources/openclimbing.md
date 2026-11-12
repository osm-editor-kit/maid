# OpenClimbing / OsmAPP: how climbing areas, crags, boulders and routes are modelled and edited

Source: `a local clone of zbycz/osmapp` (shallow clone, HEAD `e986aa2` "FeaturePanel: Support linking of multiple Panoramax image entries (#1529)"). All paths below are relative to that repo unless absolute.

Context: `README.md` (line 11, 93-95) says OpenClimbing was forked into a stand-alone repository (`jvaclavik/openclimbing`) in March 2026. This snapshot is the OsmAPP code it was based on. Code may have diverged since; nothing here was checked against the live site or the stand-alone repo (not reachable).

Evidence labels: **[read]** = read in the code; **[measured]** = ran a script over the code's data; **[inferred]** = follows from reading the code, not executed.

---

## 1. Data model

### 1.1 Tags that make a climbing object

| Object | Tags (as found in code) | Where |
|---|---|---|
| Area | `climbing=area` (node, way or relation). Preset `type/site/climbing/area` is offered for new objects in OpenClimbing. | `src/server/climbing-tiles/refreshClimbingTiles.ts` (node/way/relation branches); `src/components/FeaturePanel/EditDialog/EditContent/FeatureEditSection/PresetSelect/useOptions.tsx` (`EMPTY_OPTIONS`) |
| Crag | `climbing=crag` (node/way/relation). Also `climbing=boulder` and `natural=peak` are put into the crag tile class; legacy `sport=climbing` without gym hints is also a crag. | `refreshClimbingTiles.ts` (node branch: `crag`, `boulder`, `natural=peak`; `sport=climbing` fallback) |
| Boulder | `climbing=boulder` **[read]** is treated as a crag by the tile builder. No member-tag mapping for it in the editor (see 1.3). | `refreshClimbingTiles.ts` |
| Route (line) | `climbing=route` on a **way** (drawn as a line on the map). `highway=via_ferrata` ways are also routes in the tile builder. | `refreshClimbingTiles.ts` (way branch) |
| Route bottom | `climbing=route_bottom` on a **node** at the foot of the route. This is the object that carries the topo path. Usually with `sport=climbing`. | `refreshClimbingTiles.ts`; `utils/getEmptyRoute.ts` |
| Route top | `climbing=route_top` on a node (shown as `[top]` prefix in tiles). | `refreshClimbingTiles.ts`; `climbingTilesSource.ts` (`processFeature`) |
| Via ferrata | `route=via_ferrata` or `via_ferrata_scale` on a relation → tile type `ferrata`. | `refreshClimbingTiles.ts` (relation branch) |
| Gym | `leisure` or `building` present, or `sport=climbing` plus gym hints (`opening_hours`, `phone`, `addr:street`, `man_made`, name matching /gym/i). Tile type `gym`. | `refreshClimbingTiles.ts` |
| `climbing=no` | Ignored everywhere in the tile build. | `refreshClimbingTiles.ts` |

Also used: `natural=cliff` ways/nodes get a route count like crags; `sport=climbing` on a route.

The list of valid editor values: `src/components/FeaturePanel/Climbing/utils/climbingTagValues.ts` = `crag, area, route, route_bottom, route_top`.

Where the tile builder's "area / crag / route" classes come from is `refreshClimbingTiles.ts` (one `if` chain per element type). That is the authoritative classification for the map.

### 1.2 Type=site / type=climbing relations

- **[read]** `type=site` + `site=climbing` is only written when a **node** `climbing=crag|area` is converted to a relation: `src/components/FeaturePanel/EditDialog/context/convertToRelationFactory.tsx` (tags `type=site`, `site=climbing`, plus copied `name*`, `climbing*`, `description*`, `wikimedia_commons*`, `website*`, `sport=climbing`). The original node is kept only if it has tags other than the copied ones (`keepNode`), and becomes the first member with empty role.
- **[read]** The tile builder does not read `type=site` for parenting. Parent/child edges in the map come only from relations with `climbing=area` or `climbing=crag` (`overpassToGeojsons.ts`, `addParentIds`). The refresh code has a comment that a natural=cliff way has a `type=site` parent, with a TODO (`refreshClimbingTiles.ts`, "TODO 900 ways").
- Other relations: `climbing=route` relations with `route=via_ferrata` are ferrata; other relations with `climbing=*` are classified like nodes/ways.

### 1.3 Grouping: relation members, roles, order

- **Hierarchy** is plain OSM relations with `climbing=area` (members: crags, or sub-areas) and `climbing=crag` (members: `climbing=route_bottom` nodes and/or `climbing=route` ways, plus sometimes `climbing=route_top`).
- **Member tags the editor creates** (`src/components/FeaturePanel/EditDialog/EditContent/FeatureEditSection/AddMemberForm.tsx`, `getMemberTags`, `CRAG_TAGS`, `ROUTE_BOTTOM_TAGS`):
  - a new member of a **crag** → `climbing=route_bottom`, `sport=climbing`;
  - a new member of an **area** → `climbing=crag`, `sport=climbing`;
  - members of other parents → no tags.
- **Roles**: the code writes `role` as entered, normally empty (`''`). No role-based logic was found for routes or crags. `[read]`
- **Route numbering** is positional: the topo number shown is `routeSelectedIndex + 1` (`ClimbingEditorHelperText.tsx`), so route numbers are the order of the relation's `members` list after filtering to route, route_bottom, route_top (`contexts/osmToClimbingRoutes.ts`, `utils/getDividedFeaturesBySections.ts`). Member order therefore *is* the route numbering.
- **Parents**: `fetchParentFeatures()` (`src/services/osm/fetchParentFeatures.ts`) calls `/api/0.6/{type}/{id}/relations.json`. A child with several parents keeps the last one in the tile builder and logs a warning (`overpassToGeojsons.ts`, `addParentIds`).
- **Children**: `getFullFeatureWithMemberFeatures()` / `fetchWithMemberFeatures()` (`src/services/osm/`) call `/relation/{id}/full.json`, which gives one level of members. For **areas**, `addMemberFeaturesToArea()` (`src/services/osm/osmApi.ts`, ~line 152) uses Overpass `rel(id);>>;out center` to get two levels (area → crag → route). The map README says areas are shown two levels deep (`src/server/climbing-tiles/README.md`).

### 1.4 Grades on objects

- Tags: `climbing:grade:<system>` (e.g. `climbing:grade:uiaa`, `climbing:grade:french`). The system key is the OSM tag suffix, e.g. `yds_class` (not `yds`) and `ice`, `mixed`, `polish`, `norwegian`, `british_traditional`, `british_adjectival`, `french_british`, `hueco`, `saxon`. Source of the list: `src/services/tagging/climbing/gradeSystems.ts`.
- Count tags on crags/routes: `climbing:sport`, `climbing:trad`, `climbing:ice`, `climbing:multipitch` (summed as the route count, `src/server/climbing-tiles/overpass/overpassToGeojsons.ts`, `getRouteNumberFromTags`; a crag without counts gets 1).
- Other climbing tags are edited as multi-key sets in `ClimbingEditor.tsx`: `climbing:boulder|sport|trad|multipitch|toprope|speed|ice|mixed|deepwater`, `climbing:inclination:*`, `climbing:hazard:*`, `climbing:family_friendly`, and `climbing:rock` via `ClimbingRockSelect.tsx` (values from `src/services/tagging/climbing/climbingRockData.ts`).

### 1.5 Finding a route's parent crag in the UI

Route → crag: `getUrlToParentCrag()` / `useGetParents()` (used in `DrawClimbingRoutesBanner.tsx`), i.e. the parent relation fetched via `relations.json`.

---

## 2. Grades

### 2.1 Systems and keys
`src/services/tagging/climbing/gradeSystems.ts`: `GRADE_SYSTEMS` (12 entries: uiaa, french, saxon, yds_class, hueco, british_traditional, british_adjectival, french_british, norwegian, ice, mixed, polish). `DEFAULT_GRADE_SYSTEM = 'uiaa'`. Display names are in the same file (`name`, e.g. "V scale" for `hueco`).

### 2.2 The conversion table
- Source: `src/services/tagging/climbing/gradeData.ts`, a **CSV string** `gradeTableString` (lines 12-~106). The comment says it comes from `https://wiki.openstreetmap.org/wiki/Climbing#Grading`.
- Parsed at load time by `getCsvGradeData()` into `GRADE_TABLE: Record<GradeSystem, string[]>`. The **row index is the shared key**: `GRADE_TABLE[system][i]` is the grade of that system on row `i`. Columns are assigned by position: `transposeArrays` + `GRADE_SYSTEMS[index].key`.
- **[measured]** The CSV has 94 data rows, all with 12 values. 24 UIAA labels occur on more than one row (e.g. `4-` appears on rows 9 and 10, `6-` and `6-/6` several times, `5+` twice). The header line has 16 names separated by `|`, which does not obviously match the 12 value columns. The meaning of the Norwegian / Ice / Mixed / Polish columns was **not verified** against the wiki (see section 7).
- Colours for grades: `gradeColors` in the same file (keys are UIAA labels, light/dark hex). `getDifficultyColor()` converts to UIAA first (`src/services/tagging/climbing/routeGrade.ts`).

### 2.3 Conversion functions
- `src/services/tagging/climbing/routeGrade.ts`:
  - `convertGrade(from, to, value)`: finds `indexInTable` by `GRADE_TABLE[from].findIndex(item => item.startsWith(value))`, then returns `GRADE_TABLE[to][indexInTable]`. **Prefix matching**, so `'6'` matches the first row starting with `6` (the `6-` row).
  - `getDifficulty(tags)`: reads the **first** `climbing:grade*` key in `Object.keys` order (tag order, not sorted). `getDifficulties(tags)` returns all of them.
  - `findOrConvertRouteGrade()`: uses the tag in the wanted system if present, else converts from the first tag, marking `isConverted`.
  - `sanitizeApproximationSymbol()` strips `~`.
  - `getGradeIndexFromTags()` returns the row index.
- Tile builder: `src/server/climbing-tiles/refreshClimbingTilesHelpers.ts` stores `gradeId` = index of the route's grade in its **own** system column (`GRADE_TABLE[gradeSystem].indexOf(grade)`) and `gradeTxt` = raw tag. The browser (`src/components/Map/climbingTiles/climbingTilesSource.ts`, `getGrade`) then reads `GRADE_TABLE[userSystem][gradeId]`. This only works because the row index is shared across systems; duplicate rows are then ambiguous (`indexOf` returns the first).
- Grade system chosen by the user: `src/components/utils/userSettings/mapClimbingFilter.tsx` (`userSystem`), `useVisibleGradeSystems.ts`, `GradeSystemSelect.tsx`.
- Tests: `src/components/FeaturePanel/Climbing/contexts/__tests__/osmToClimbingRoutes.test.ts`, `src/components/FeaturePanel/Climbing/utils/__tests__/photo.test.ts`, `src/server/climbing-tiles/overpass/__tests__/basic.test.ts`. Not run for this report.

---

## 3. Topos: route lines on photos

### 3.1 Storage on the crag and route objects
- **Photos** of a crag or route: `wikimedia_commons`, `wikimedia_commons:2`, `wikimedia_commons:3`, … values `File:<name>.jpg` (`src/components/FeaturePanel/Climbing/utils/photo.ts`). `wikimedia_commons:N` is numbered from 2; the code has a deprecated suffix form `wikimedia_commons3` that is still read (`contexts/__tests__/osmToClimbingRoutes.test.ts` fixture, and the read regex `^wikimedia_commons:?\d*$` in `contexts/osmToClimbingRoutes.ts`).
- **Paths** (the route lines) for each photo: a tag with the photo key plus `:path`, e.g. `wikimedia_commons:path`, `wikimedia_commons:2:path`. Stored on the **route_bottom node** (or on a route way / crag). Example from the fixture:
  ```
  wikimedia_commons:path = 0.8,0.8B|0.573,0.245A
  wikimedia_commons:2:path = 0.1,0.1|0.573,0.245A
  ```
  (`contexts/__tests__/osmToClimbingRoutes.test.ts`)

### 3.2 Path string format (`src/components/FeaturePanel/Climbing/utils/pathUtils.ts`)
- Points separated by `|`. Each point: `x,y` followed by an optional **type code** letter (`src/components/FeaturePanel/Climbing/utils/boltCodes.ts`): `B` bolt, `A` anchor, `P` piton, `S` sling, `U` unfinished. A point with no letter is a plain waypoint.
- `x` and `y` are **fractions of the image width and height, 0 to 1, rounded to 3 decimals** (`utils/positionUtilsFactory.ts`, `roundNumber` in `utils/number.ts`). Despite the name `units: 'percentage'` in `types.ts`, the stored value is a fraction, not a percentage. Coordinates are relative to the photo, so they stay valid if the image is resized.
- Dotted segments: a `:` directly before a `|` marks the segment **ending at the next point** as dotted. `stringifyPath()` writes `:|` before a point whose `previousLineType` is `dotted`; `parsePathString()` reads a trailing `:` on the previous segment. Segments with no marker are solid.
- Non-finite points are dropped on parse. Empty path → no tag (`stringifyPath` returns `undefined`).
- Route number on the photo = positional index of the route (see 1.3). The path is the line from the route's first point; the route is not separately named on the photo.

### 3.3 Mapping photo ↔ key
- `src/components/FeaturePanel/Climbing/contexts/osmToClimbingRoutes.ts`, `getPathsByImage()`: builds `paths[fileName]` and `photoToKeyMap[fileName] = key` (e.g. `'jickovice2.jpg' → 'wikimedia_commons:2'`). The file name has `File:` removed (`removeFilePrefix`).
- Saving keeps the original key for known photos (`photoToKeyMap`), and gives new photos the next free key (`getNextWikimediaCommonsIndex`, `getWikimediaCommonsKey`), see `useSaveCragFactory.tsx`, `getUpdatedPhotoTags()`.

### 3.4 Photos on the server
- Thumbnails: Wikimedia Commons API `imageinfo` with `iiurlwidth` (`src/services/images/getImageFromApi.ts`), resolution from the zoom (`utils/photo.ts`, `getResolution`).
- Image defs for members: `src/services/images/getImageDefs.ts` (ignores `:path` keys; the regex `wikimedia_commons(\d*|:(?!path).*)`).

---

## 4. Editing flow

### 4.1 Entry points
- Routes: `src/components/Climbing/Climbing.tsx` (`router.query.all[2] === 'climbing'`). The crag view and topo photo are URLs such as `…/climbing/photo/<file>` and `…/climbing/edit` (`usePhotoChange.ts`, `DrawClimbingRoutesBanner.tsx`).
- Generic editor: `src/components/FeaturePanel/EditDialog/` (the OSM tag/member editor, the same one used for all objects). Its "Climbing" section is `EditContent/FeatureEditSection/ClimbingEditor/ClimbingEditor.tsx` (grades, rock type, multi-value tags). `DrawClimbingRoutesBanner.tsx` links to the topo editor for crags (with photos) and route_bottoms.

### 4.2 Adding routes to a crag (member editing, generic editor)
- `AddMemberForm.tsx`: one or many lines (batch = one per line). Each line:
  - a line `^[nwr]\d+$` adds an **existing** OSM element as a member (fetched by `fetchFreshItem`);
  - any other line creates a **new node** named by the line, with member tags from 1.3. For crags in batch mode, a trailing grade word is parsed as `climbing:grade:<userSystem>` (`parseGradeFromLine`, only if the word is in `GRADE_TABLE[system]`). Appended to `relation.setMembers`.
- Node → relation: `ConvertNodeToRelation.tsx` (only for node `crag`/`area`), `convertToRelationFactory.tsx`.
- Changes are then saved by the generic EditDialog save path (not by the topo code).

### 4.3 Topo editor (drawing routes on photos)
- State: `src/components/FeaturePanel/Climbing/contexts/ClimbingContext.tsx` holds `routes: ClimbingRoute[]` (built once from `feature.memberFeatures` by `osmToClimbingRoutes`), `paths` per photo, selected route/point, zoom, etc. A small state machine is in `utils/useStateMachine.ts`.
- Actions (from `useStateMachine.ts` and `ClimbingContext.tsx`):
  - `createRoute()`: appends `getEmptyRoute()` (`utils/getEmptyRoute.ts`: `climbing=route_bottom`, `sport=climbing`, a **negative fake id** `n-1`, `-2`, …).
  - Draw: click adds points; `findCloserPoint` snaps to existing points; point types from `Editor/PointTypeButtons.tsx`; solid or dotted line type (`LineTypeButtons.tsx`); undo (`undoPoint`) removes the last point.
  - `deleteRoute()`: removes the route from **local** state only (`updateRouteOnIndex` with no callback).
  - `moveRoute(from, to)`: reorders the **local** `routes` array (drag and drop in `RouteList/RouteListDndContent.tsx`).
- Zoom and pan of the photo: `TransformWrapper.tsx`, `photoZoom` in context; path stroke width is scaled with zoom (`config.ts`).
- Keyboard: `utils/useClimbingViewShortcuts.ts`, `Editor/useFloatingMenuShortcuts.tsx`.

### 4.4 Saving (`src/components/FeaturePanel/Climbing/useSaveCragFactory.tsx`)
1. `getClimbingRouteUpdates(routes)`: for each route with a `feature`, compute `wikimedia_commons*:path` tags (and new photo keys) with `stringifyPath`. Only changed sets become updates.
2. `getClimbingCragUpdates(crag, photoPaths)`: sets `wikimedia_commons`, `wikimedia_commons:2`, … from the crag's photo list.
3. `constructChanges()`: for each update, **re-fetches the fresh item** (`fetchFreshItem`), merges only the changed tags into its existing tags. Comment says "we don't have to compare versions, because only :path tags are changed".
4. `window.confirm('Are you sure you want to save?')`, then `saveChanges(crag, "<n> routes", changes)` (`src/services/osm/auth/osmApiAuth.ts`): opens a changeset, comment `"<n> routes • Edited <crag name> #osmapp #climbing"`, uploads a diff (`getDIffXml.ts`), closes it.
- Diff XML writes the full `members` list of changed relations (`getDIffXml.ts`, `relationItemToXml`), so the member order is whatever the DataItem holds. The topo save path does **not** change members (it re-uses fresh members), so route order and deletions are not written.

### 4.5 What a user can edit, summarised
| Action | Persisted? | Evidence |
|---|---|---|
| Draw / move / delete points on existing route paths | Yes (`:path` tags) | `useSaveCragFactory.tsx` |
| Add photo to a crag | Yes (`wikimedia_commons:N`) | `getClimbingCragUpdates` |
| Add photo to a route | Yes, as a new key | `getUpdatedPhotoTags` |
| Reorder routes in topo list | **No** (local state) | `moveRoute`, `saveCrag` does not touch members |
| Delete a route in topo | **No** (local state) | `deleteRoute` |
| Create a new route in topo (`createRoute`) | **Not as written; see 7.3** | `getEmptyRoute` has a negative id and no `photoToKeyMap` |
| Add/remove members, tags, grades | Yes, in the generic EditDialog | `AddMemberForm.tsx`, EditDialog context |

---

## 5. Map display

### 5.1 Production tiles (`src/server/climbing-tiles/`, `src/components/Map/climbingTiles/`)
- Build: `refreshClimbingTiles.ts` downloads `[out:json][timeout:100];(nwr["climbing"];nwr["sport"="climbing"];);(._;>>;);out qt;` from the `maps.mail.ru` Overpass mirror, classifies elements (section 1.1), writes rows into SQLite (`recordsFactory` in `refreshClimbingTilesHelpers.ts`; table `climbing_features`). Trigger: `/api/climbing-tiles/refresh` (`pages/api/climbing-tiles/refresh.ts`).
- Serve: `/api/climbing-tiles/tile?z&x&y`, zooms **0, 6, 9, 12 only** (`src/server/climbing-tiles/getClimbingTile.ts`, `ZOOM_LEVELS`). Zoom 0/6 use a 500×500 grid and return the feature with most routes per cell; zoom 9 returns crags, areas, gyms (not routes); zoom 12 adds routes (`README.md`).
- Browser: `climbingTilesSource.ts` requests tile Z when the map reaches zoom Z+1 (`README.md`). Tiles are cached in SQLite, the CDN and the browser (`README.md`).
- Layers (`src/components/Map/climbingTiles/climbingLayers/`):
  - `groupsLayer.ts`: area/crag symbols (`climbing gym`: minzoom 9, maxzoom 24; `climbing group`: maxzoom 20). Icons from `consts.ts`: `climbing:area-blue|gray` (`AREA`), `climbing:crag-red|gray` (`CRAG`), `climbing:via-ferrata-gray`, `climbing:climbing-gym-gray`. Blue/red = has photos.
  - `routesLines.ts`: route lines, minzoom 13.
  - `routesPoints.ts`: route bottom points, minzoom 13; labels minzoom 19.
  - `outlinesLayer.ts`: outline of hovered area/crag, built by `constructOutlines.ts`.
- Colours: route colour from the grade in the user's chosen system (`processFeature` / `getColor` in `climbingTilesSource.ts`, `gradeColors`).
- Filters: user-side in `mapClimbingFilter.tsx` (grade interval, minimum routes), applied in `doClimbingFilter`.

### 5.2 Second style set (`src/components/Map/styles/layers/climbingLayers.ts`)
A GeoJSON source named `climbing`, styled with `osmappRouteCount`, `osmappHasImages` and a `sortKey`. It is imported by `src/components/Map/behaviour/useUpdateStyle.tsx`, which updates that source on the main map. (The crag map in 5.3 defines its own `routes` layers and does not use this file.)

### 5.3 Crag map in the feature panel (`src/components/FeaturePanel/Climbing/CragMap.tsx`)
- Its own MapLibre map (`outdoorStyle.layers` + `routes`), with a GeoJSON source `climbing` built from `feature.memberFeatures` (`transformMemberFeaturesToGeojson`). Routes are circles at `route_bottom` points with `{name} {grade}` labels.

### 5.4 3D / terrain
- No climbing-specific 3D. `src/components/Map/behaviour/useToggleTerrainControl.tsx` is the generic terrain toggle (MapTiler `terrain-rgb-v2`, `src/components/Map/consts.ts`); `src/components/Map/styles/layers/buildings3dLayers.ts` is generic building extrusion. `ClimbingBadges.tsx` uses a Terrain *icon* for a badge, not a 3D view.

---

## 6. Ideas for Maid Climbing, and pitfalls

### Copy
1. **Keep the topo format and photo keys as they are.** `wikimedia_commons[:N]` + `:path`, fractions 0..1, 3 decimals, letter codes B/A/P/S/U, `|` separators, `:` for dotted. It is simple, diffable and already used on the map. The parser in `pathUtils.ts` is small enough to port with its tests (`src/components/FeaturePanel/Climbing/utils/__tests__/`).
2. **Relation hierarchy by member tags** (area → crag → route_bottom/route) with the member tags from `AddMemberForm.tsx`. Route number = member order.
3. **Fetch-fresh-then-merge** before writing (`constructChanges`): only the changed tags are written, the rest of the item is kept, and the item version is current.
4. **One changeset comment** with a count and `#climbing`.
5. **Classify in one place**: the if-chain in `refreshClimbingTiles.ts` is the single source of "what is a crag/route". Put it in a shared module and test it against a fixture.
6. **Zoom-gated tiles**: crags/areas from zoom 9, routes from 12-13, labels from 19. Fetch tiles one zoom ahead.
7. **Grades**: keep the OSM tag names (`climbing:grade:<system>`, with `yds_class`, `ice`, …). Keep one row-aligned table as the single source for conversion.

### Pitfalls / things not to copy
1. **Grade conversion is prefix-based and table-row based** (`routeGrade.ts` `convertGrade`, `findIndex(startsWith)`). `'5'` resolves to the first row starting with 5 and duplicated rows (24 labels) make reverse lookups ambiguous. Use exact row matching on an explicit, de-duplicated scale and document the rows.
2. **`getDifficulty` takes the first `climbing:grade*` tag** in insertion order. With several systems on one route, the result depends on OSM tag order. Prefer an explicit preferred system.
3. **Tile grades store a row index** from the route's own system, and the browser reads it back in the user's system. This is only right if the table is row-aligned and duplicate-free. Store the grade string plus the row id you need.
4. **Photo keys renumber** on save. `getClimbingCragUpdates` writes `wikimedia_commons`, `:2`, `:3` from array position, and has a `// TODO this may change order` note. Removing a photo in the UI does not remove its old tag, because the merge keeps fresh tags (inferred, section 7). Keep the key of each photo.
5. **Member order is route numbering but is not saved** by the topo editor (`moveRoute` is local). If Maid allows reordering, write the relation's members in the new order and say so in the UI.
6. **Route deletion is not persisted** from the topo view.
7. **New routes in the topo view are not saved correctly** (section 7.3). Build the create path explicitly, with a real new id and a `route_bottom` node.
8. **Names are misleading**: `units: 'percentage'` holds fractions. Name things for what they are.
9. **Parent conflicts**: a child in two areas gets the last parent silently (only a log line). Show the conflict.
10. **Runtime calls to third parties**: the tile build uses the `maps.mail.ru` Overpass mirror, the area two-level fetch uses Overpass (`osmApi.ts`), member and parent fetches go to the OSM API (production or test server, `src/services/osm/consts.ts`), and thumbnails come from `commons.wikimedia.org`. Under Maid's rule 1 (automated runs send zero requests to OSM infrastructure), all of these must be served from fixtures in tests, benchmarks and agent sessions. Do not copy the Overpass endpoint into Maid's automation path.
11. **Client-side tile merge cost**: `climbingTilesSource.ts` `updateData()` fetches all tiles for the viewport, then runs `processFeature` on each feature, then `setData`. Fine for ~60k rows; measure before copying the approach.
12. **Upstream drift**: OpenClimbing moved to its own repository in March 2026 (README). Re-check any detail here against it before porting.

---

## 7. Unsure / not verified

- **Grade table columns**: the header has 16 `|`-separated names for 12 value columns, and the mapping to `GRADE_SYSTEMS` is positional. The Norwegian, Ice (`WI`), Mixed and Polish columns were not checked against the wiki. Treat the table as "as in code", not as verified data. **[measured]** only that rows = 94, columns = 12, and which labels repeat.
- **Parsing of `ice`/`mixed` values** in batch add (`AddMemberForm.tsx`, `parseGradeFromLine`) depends on `GRADE_TABLE[system].includes(lastWord)`. Not tested.
- **7.1 Photo removal leaves stale tags (inferred)**: `getClimbingCragUpdates` only sets keys for the current photo list, and `constructChanges` merges onto fresh tags. A removed photo's key should survive the save. Not run.
- **7.2 Member-order save (inferred)**: the topo save path reuses fresh members, so reordering is not saved. The member editor has no reorder control either (`setMembers` only appends, `AddMemberForm.tsx`). Not run.
- **7.3 New route save (inferred, likely broken)**: `createRoute` adds `getEmptyRoute()` with `osmMeta.id` negative and no `photoToKeyMap`. In `getUpdatedPhotoTags`, `route.photoToKeyMap[photoName]` is read for every path, so a route with a drawn path should throw a TypeError, and a route without paths is skipped by `areUpdatedTagsSame`. The code comment "TODO new routes" in `getClimbingRouteUpdates` says this is known. The new route is never created in OSM. Not run.
- **Tests**: no unit tests were run for this report (dependencies not installed; not needed for reading).
- **Live OpenClimbing**: not reached. Gallery and behaviour on the site are not verified. The wiki link in `src/server/climbing-tiles/README.md` was not opened.
- **Overpass 'out qt'** and the `>>` recursion were read from the query text only; output size (25 MB, 217k items, "May25") is the README's claim.
- **`boulder`**: classified as crag in tiles; whether the editor offers boulder member tags was not found.
- **Ticks** (`pages/api/climbing-ticks`): server-side storage of user climbs (style OS/FL/RP/… `src/components/FeaturePanel/Climbing/types.ts`). Not studied further.

## Measured vs inferred, short list

- Measured: 94 grade rows / 12 columns; 24 duplicated UIAA labels; prefix conversion examples (`'5'`→`4c` French row 13, `'6'`→`5b` row 17, `'4-'`→`4` row 9); the code paths listed in sections 1-5 (read, not executed).
- Inferred: 7.1, 7.2, 7.3 (save behaviour), the "stale tag" and "route not created" outcomes.
