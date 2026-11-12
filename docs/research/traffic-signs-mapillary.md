# Traffic signs from Mapillary, and the photo viewer (research, 2026-11-12)

Tobias, 2026-11-12: bring traffic signs from street imagery into Maid, under Mapillary in the photos panel with the
same filters, use the detail view of our street-imagery package, and take the viewer out of the bottom dock. Look at iD,
Rapid, the package and the Radnetz fork (FixMyBerlin/iD, branch `radnetz-mapping`).

## What Maid does now (module-street-imagery)

- `mapillary-signs` is a layer of `photo_overlay` (iD's name), under Mapillary in the panel, with the package's sign
  group chips and counts; the date filter applies (iD's rule: seen within the range).
- Sign icons from the sprite source iD and Rapid use, over the package's dots.
- A click on a sign: the package's `useSelectedMapillaryFeature`, `MapillaryFeatureBar`, `lookAt` with the outline, and
  `SelectedMapFeatureLayer` (the Radnetz fork's behaviour, which the package took over).
- The viewer is the package's `FloatingPhotoViewer` over the map.
- Photos coloured by age (default) or type; the date chart shows the photos in view.

## Not done, worth doing next (from the fork, table below)

1. Sign tagging buttons: `traffic_sign=DE:…` (with `:forward`/`:backward` and the side keys), `maxspeed` with
   `source:maxspeed`, and `source:traffic_sign:mapillary=<image>`. Needs the German table and the side and direction
   geometry of the fork (`modules/mapillary/sign_tagging.ts`); best moved into the package first.
2. Auto-show: selecting a feature with an image key opens its photo (fork feature 19).
3. The selected feature's photos always drawn with a ring, past the filters.
4. The selected sign in the URL (`photo_sign`).

Below: the three research reports as the agents gave them (Sonnet, read-only; claims not all checked in a browser).


---

## Traffic signs from street imagery in iD and Rapid


### iD

1. Layers
   - Two sub-layers of the photo overlays, ids `mapillary-signs` ("Traffic Signs") and `mapillary-map-features` ("Map Features"), registered in `modules/svg/layers.ts:~52-54`. Files: `modules/svg/mapillary_signs.ts`, `mapillary_map_features.ts`.
   - UI: Map Data pane, "Photo Overlays" section (`modules/ui/sections/photo_overlays.js:92-130`, collapsed by default). Plain checkboxes; the two rows are indented under Mapillary (`indented` class). The label uses string `photo_overlays.traffic_signs.title`, tooltip `mapillary.signs.tooltip` ("Traffic signs from Mapillary"), and `street_side.minzoom_tooltip` when disabled.
   - Default off (`svgMapillarySigns.enabled = false`). The checkbox is greyed out below zoom 12 (`drawSigns.rendered`, `minZoom = 12`). URL hash `photo_overlay=...mapillary-signs` enables it (`modules/renderer/photos.js:11, 225`; the id is in `_layerIDs`). It is independent of the `mapillary` image layer.
2. Data
   - Vector tiles `https://tiles.mapillary.com/maps/vtp/mly_map_feature_traffic_sign/2/{z}/{x}/{y}?access_token=...` (`modules/services/mapillary.ts:20-25`). Map features use `mly_map_feature_point/2`. Tiles are fetched at fixed zoom 14 (`loadTiles(..., 14, ...)`, `minZoom = 14`).
   - Tile layer `traffic_sign` (parser at `mapillary.ts:~268-290`). Properties read: `id`, `first_seen_at`, `last_seen_at`, `value`, plus the point geometry. The point layer is parsed identically. Features go into an RBush (`_mlyCache.signs`) and are limited to 5 per partition cell (`searchLimited`, `signs()` ~350).
   - Graph API on click or viewer open: `https://graph.mapillary.com//<id>/detections?...&fields=id,value,image` (`getDetections`, ~717). For the viewer outlines: `.../<imageId>/detections?fields=id,image,geometry,value` (`imageChanged`, ~666). The geometry is a base64 MVT with layer `mpy-or`. The URL has a double slash because `apiUrl` ends in `/`.
3. Rendering
   - SVG, not clustered: each sign is a `<g class="icon-sign icon-detected">` with a 24x24 `<use xlink:href="#<value>">` plus a transparent `<rect>` for hit and hover (`mapillary_signs.ts:~100-125`).
   - Icons come from the sprite `mapillary-sprite` (`loadSignResources`, `mapillary.ts:~478`), built by `package.json:35` (`dist:svg:mapillary:signs`) from `node_modules/@rapideditor/mapillary_sprite_source/package_signs/*.svg` into `dist/img/mapillary-sprite.svg`. Map features use `mapillary-object-sprite` (`package_objects`).
   - There is no fallback icon: an unknown `value` gives an empty `<use>`.
   - Style: `css/60_photos.css:257-290`. Opacity is 0.75; hover and `:active` give opacity 1 and a yellow outline on the rect; `.currentView` has a solid yellow outline.
   - Drawing happens only at zoom >= 12. Data loads when `drawSigns` runs, and `loadedSigns` triggers a throttled redraw (1 s).
4. Interaction
   - Click (`mapillary_signs.ts:~62-85`): `centerEase` to the sign, then `getDetections(d.id)` and take `detections[0].image`.
     - If that image is already the active one, it calls `highlightDetection(det).selectImage(image)`.
     - Otherwise it calls `ensureViewerLoaded`, then `highlightDetection`, `selectImage` and `showViewer`, which opens the Mapillary viewer.
   - In the viewer, detections are drawn as `OutlineTag` polygons (`mapillary.ts:~790-840`). White, 30% fill, no text. The highlighted detection is yellow with a label derived from `value` (second or third `--` segment, capitalised). Tags are only added while `showSignDetections` or `showFeatureDetections` is true; the sign layer sets `true` in `drawSigns` when enabled and zoomed in. Tags are cleared on each image change (`resetTags`), and there are none in the WebGL-less fallback viewer.
   - Hover: CSS highlight only. Map features have a `<title>` tooltip with a localised name; signs have no tooltip and no sidebar.
   - The sign has no map selection state. The highlight is passed through the module variable `_mlyHighlightedDetection`.
5. Filters
   - Date filter applies: `filterData` in `mapillary_signs.ts:~88-107` keeps signs with `last_seen_at >= from` and `first_seen_at <= to`. It re-renders on `photos().on('change.mapillary_signs')`.
   - The date slider is shown only when an image layer is on (`renderer/photos.js:157`: mapillary, kartaview, ... but not the sign layers). It does not appear if only signs are on, but a date set earlier still applies.
   - Photo type (flat/pano) filter: not applied to signs, but it only affects image layers and the viewer filter.
   - Username filter: not applicable (it is shown only for KartaView or Panoramax).
   - No per-sign-type filter.
6. Tagging helpers: none for signs. Signs are not turned into OSM nodes and have no preset mapping. Related only: a button to copy a Mapillary photo id into the `mapillary` tag (`ui/photoviewer.js:22`, `addPhotoIdButton`), and a source entry "Mapillary Signs" for the changeset (`renderer/background.js:255`).

### Rapid

1. Layers
   - `mapillary-signs` ("Mapillary Traffic Signs") and `mapillary-detections` ("Mapillary Detected Objects", the equivalent of iD's map features). Classes: `modules/pixi/PixiLayerMapillarySigns.ts`, `PixiLayerMapillaryDetections.ts`. Layer ids are in `core/PhotoSystem.ts:324` and `:342` (`detectionLayerIDs`).
   - UI: `modules/ui/sections/UiSectionPhotoOverlays.ts:~115-190`, checkboxes indented under Mapillary. Strings: `mapillary_signs.title` / `.tooltip`.
   - Default off. Enabling the layer starts the Mapillary service (`enabled` setter). Rendering requires zoom >= 12 (`MINZOOM = 12`). Hash: `photo_overlay=...` (`PhotoSystem.ts:125-128, 245-255`) and `detection=mapillary-signs|<id>` (`PhotoSystem.ts:176`).
2. Data
   - Same tile URLs and token style as iD (`modules/services/MapillaryService.ts:24-35`), fetched at tile zoom 14 (`TILEZOOM`) through `network.fetch` with an MVT worker (`_loadTile`, ~505-540).
   - Tile layers `point` and `traffic_sign` (`_gotTile`, ~589). Properties read: `id`, `first_seen_at`, `last_seen_at`, `value`. They go into the spatial index as a `MarkerData` of type `detection` with `object_type` `traffic_sign` or `point`. `spatial.getFreeLoc` nudges overlapping markers apart (Rapid#1516).
   - Graph API on selection:
     - `https://graph.mapillary.com//<detectionId>?fields=id,geometry,aligned_direction,first_seen_at,last_seen_at,object_value,object_type,images` (`_loadDetectionAsync`, ~982-1022). This gives `images`, from which `bestImageID` is chosen as the nearest image (`_cacheDetection`, ~1349-1370).
     - `<detectionId>/detections?fields=id,created_at,geometry,image,value` for the segmentation polygons (~1095-1105). `<imageId>/detections` is used for all outlines of the current image (~1041).
3. Rendering
   - Pixi WebGL markers (`PixiFeaturePoint`). Not clustered.
   - Signs: a 24 px marker whose image is the sprite symbol `d.props.value` from the `mapillary-sprite` (`PixiLayerMapillarySigns.ts:~100-115`). If the symbol is missing from `#rapid-defs`, a square marker with a "?" icon (`fas-question`) is drawn (Rapid#1518).
   - The sprite is built by `scripts/build_svg.ts:23` from `@rapideditor/mapillary_sprite_source/package_signs`, and loaded in `ui/UiDefs.ts:39`. The object sprite is commented out.
   - Detected objects: a black circle with a green (0x05cb63) icon taken from the matching OSM preset (`getDetectionPresetID`, ~420-466); the selected one is yellow.
4. Interaction
   - Click: selects the marker in `SelectMode`. `modes/SelectMode.ts:~180-190` opens `UiDetectionInspector` (sidebar) and calls `photos.selectDetection('mapillary-signs', id)` (`PhotoSystem.ts:~490-575`).
     - It enables the layer if needed, then `selectDetectionAsync` loads the detection plus its segmentations.
     - It highlights all photos that show the detection (`highlightphoto` class), picks the best photo (the current one if it shows the detection, else `bestImageID`), zooms the map to fit sign and photo, and opens the viewer.
   - Viewer outlines: `OutlineTag` for each segmentation, only for known types (the `_cacheSegmentation` filter at ~1390 accepts the preset lookup or `regulatory|information|warning|complementary`). Colour is Mapillary green 0x05cb63; the selected detection is yellow with a text label. Tags show only if a sign or detection layer is enabled (`_shouldShowSegmentations`, ~888).
   - Hover: `UiSidebar.ts:321-324` shows the same detection inspector in the sidebar (icon, value, first and last seen, "View on Mapillary" link built by `imageURL`, which adds `&trafficSign=all` / `&mapFeature=all`, ~339-343).
   - Selecting a detection is part of the URL hash and is added to the changeset `source` (`photosUsed`, `PhotoSystem.ts:~296`, names "Mapillary Traffic Signs").
5. Filters
   - Date filter applies, but only on `first_seen_at` (`filterMarkers`, `PixiLayerMapillarySigns.ts:~62-78`). Markers with no `first_seen_at` always pass. iD uses both `first_seen_at` and `last_seen_at`.
   - The date UI is shown only when mapillary, kartaview or streetside is on (`PhotoSystem.ts:708`). Photo type and username filters: not applied to signs.
   - No per-sign-type filter.
6. Tagging helpers: none that create OSM features. No "add traffic sign" action. `getDetectionPresetID` maps Mapillary object classes to OSM presets (for example `object--traffic-light--*` to `highway/traffic_signals`, manholes to `man_made/manhole`, crosswalks, barriers). It is used only for icon choice and for filtering segmentations. Signs and lane markings map to the generic `traffic_sign` string. There is no draw-from-detection mode (grep of `UiDetection*` found none).

### Differences

- Renderer: iD draws SVG, Rapid draws Pixi/WebGL.
- Rapid has a selectable data object. Clicking opens a detection inspector in the sidebar (also on hover), with a URL hash and highlighted photos. iD only centres the map, opens the viewer and highlights the outline.
- Rapid fetches the detection's `images` list and picks the best photo by distance. iD takes the first entry of `<id>/detections` and its `image`.
- Rapid shows a "?" placeholder for unknown sign values; iD shows nothing.
- Rapid has fewer layers: the object sprite is disabled and the detected-object layer uses OSM preset icons. iD uses the `mapillary-object-sprite` icons and a localised tooltip.
- Date filter: iD checks `last_seen_at` against the start date and `first_seen_at` against the end date; Rapid checks only `first_seen_at` against both.
- Viewer outlines: iD tags are white (yellow plus label for the clicked one), Rapid tags are green (yellow plus label for the selected one), with line width 3 instead of 2. Rapid's tags are limited to known types.
- Only Rapid exposes sign and detection selection in the URL (`detection=`) and in changeset sources.
- Different Mapillary access tokens (hard-coded in each `mapillary.ts` / `MapillaryService.ts`).

### Unsure

- Whether Mapillary tiles at z14 return all signs when viewed at z12-13 in practice (both fetch many z14 tiles at low zoom); I did not test this.
- `searchLimited(5, ...)` semantics in iD (it limits per partition cell, I believe) were not read in detail.
- Rapid's `getFreeLoc` behaviour (de-overlap distance) was not read.
- Default state of the Rapid layers: I read the `_enabled` setter but not the initial value in `AbstractPixiLayer`; I assume false.
- Whether Rapid's photo-type filter has any effect on sign-triggered viewer selection was not checked.
- The double slash in the Graph API URL (`graph.mapillary.com//...`) exists in both editors; the API apparently accepts it, but this was not tested.

---

## street-imagery consumer guide (Mapillary signs + photo detail view)


Entries (core `@osm-editor-kit/street-imagery`): `.`, `./providers/all`, `./providers/mapillary`, `./providers/mapillary-signs`, `./providers/mapillary-map-features`, (+panoramax, kartaview, mapilio, streetside, vegbilder). React `@osm-editor-kit/street-imagery-react`: `.`, `./viewer`, `./viewer-panels`, `./photo-details`, `./panoramax-web-viewer`.

### 1. Traffic signs on the map
- Providers (ids in `PROVIDER_IDS`, meta in packages/street-imagery/src/providers/meta.ts), both `kind: 'mapFeature'`, `minZoom: 14`:
  - `mapillary-signs`: Mapillary vector tiles `mly_map_feature_traffic_sign`, layer `traffic_sign`, tile zoom 14 (adapters/mapillary-signs.ts). Use this for signs.
  - `mapillary-map-features`: tiles `mly_map_feature_point`, layer `point` (objects: traffic lights, benches ...; `isSignValue()` tells signs from objects).
- Registration (once at boot, before first render; an adapter-less provider shows nothing):
  ```ts
  import { createStreetImageryConfig, setStreetImageryConfig, registerProviderAdapters } from '@osm-editor-kit/street-imagery'
  import { mapillarySignsAdapter } from '@osm-editor-kit/street-imagery/providers/mapillary-signs'
  setStreetImageryConfig(createStreetImageryConfig({ mapillaryToken: '<client token>' }))
  registerProviderAdapters([mapillarySignsAdapter])   // or ALL_PROVIDER_ADAPTERS from '.../providers/all'
  ```
  Config (`config.ts`): `mapillaryToken` (required; sent as `access_token` in tile and Graph URLs, so it is public in the bundle), `panoramaxApiBase`, `googleMapsApiKey`, `bingMapsKey`, `openLinksIn`, `infra3d`. `StreetLevelImagerySourcesAndLayers` also accepts `options.config` and calls `setStreetImageryConfig` in an effect.
- Map component: `StreetLevelImagerySourcesAndLayers` (react root entry), props `{ providers: ProviderId[]; filter?: PhotoFilter; bbox: Bbox|null; zoom: number; options }`. Options: `photoCircleColor` (required), `mapFeatureCircleColor` (required, MapLibre color/expression), `config`, `showSequences`, `showViewfields`, `showViewCone`, `showSelectionHighlight`, `selectedPhoto`, `selectedSequenceId`, `viewerPov`, `viewConeColor/Scale`, `beforeId` (draw below that style layer), `minZoom` (extra min zoom; higher of this and provider min counts). Per map-feature provider it renders react-map-gl `<Source type="geojson" id="features-source-<id>" promoteId="featureId">` + `<Layer type="circle" id="features-<id>">` (radius 1.5 at z10 to 4 at z18). The data comes from `useProviderMapFeatures` (TanStack Query, bbox + zoom keyed, fetch only at zoom >= 14). Hooks: `useMapViewportBbox('<mapId>')`; `useProviderMapFeatures(providerId, bbox, zoom, {minZoom})`; `useAllProviderMapFeatures(providers, bbox, zoom)`.
- Icons: signs are drawn as plain colored CIRCLES on the map, not as sprite symbols. No sprite is added to MapLibre. Icons exist only as `<img>` in UI: `mapillaryIconUrl(value, baseUrl?)` (core) gives `https://cdn.jsdelivr.net/npm/@rapideditor/mapillary_sprite_source@1.8.0/package_signs/<value>.svg` (or `package_objects/`), ~1500 signs; not every value has one (hide on load error). For a symbol layer you would have to load these SVGs into MapLibre yourself (`map.addImage`); the package does not. `baseUrl` lets you self-host.
- Click: pass `interactiveLayerIds={streetImageryInteractiveLayerIds(providers)}` to react-map-gl `Map`; in `onClick` call `queryStreetImageryFeatures(event)` -> `StreetImageryClickFeature[]` `{providerId, kind:'photo'|'mapFeature', photoId?, featureId?, sequenceId?}`; sign: `hits.find(h => h.kind === 'mapFeature')?.featureId`. Layer ids helpers: `featureLayerId(p)`=`features-<p>` etc. (core).
- Feature data shape. Normalized (`NormalizedMapFeature`): `{ providerId, featureId: string, value: string /* e.g. regulatory--maximum-speed-limit-30--g1 */, firstSeenAt: ms|null, lastSeenAt: ms|null, lngLat: [lng,lat] }`. GeoJSON properties on the map = `providerId, featureId, value, firstSeenAt, lastSeenAt`. Tiles carry no direction/facing; `fetchMapillaryMapFeature` (Graph API) adds `facing` (aligned_direction) and `imageIds`.
- Grouping helpers (core): `SIGN_GROUPS` (parking, bike, speed, access, other), `signGroupFilter(['bike','speed'])`, `matchesAnyGroup(groups)`, `countByGroup`, `isSignValue`, `signName`.

### 2. Detection boxes
- Fetching (core `mapillary/detections.ts`, Graph API `https://graph.mapillary.com/`):
  - `fetchImageDetections(imageId, {filter?, signal?})`: GET `/{imageId}/detections?fields=id,value,geometry` -> `MapillaryDetection {id, value, imageId, outline:[x,y][]}`; typically ~500 per image so pass a `filter(value)`.
  - `fetchMapFeatureDetections(featureId)`: GET `/{featureId}/detections?fields=id,geometry,image` -> one outline per image that Mapillary linked to the feature.
  - `geometry` is a base64 MVT (layer `mpy-or`); decoded by `decodeDetectionOutline` into polygon rings in image ("basic") coords, 0..1 (needs `@mapbox/vector-tile`, `pbf`, installed as deps of core).
  - Feature -> images: `fetchMapFeatureImages(featureId, {shape})` -> `{feature, images: TargetImage[], days: TargetImageDay[], detectionIdByImageId}` (feature fields `id,object_value,geometry,first_seen_at,last_seen_at,aligned_direction,images`, then images via `fetchMapillaryImages`, outline merged per image).
- Drawing: `MapillaryPanel` (mapillary-js) draws `OutlineTag` + `PolygonGeometry` via `setMapillaryViewerOutlines(viewer, outlines)` (default color yellow 0xffff00). Props on `StreetLevelImageryViewer`/`MapillaryPanel`: `outlines?: {id, outline, label?, color?}[]` (your own boxes) and `lookAt?: { lngLat, shape?, outline?, value?, label? }`. With `lookAt` the viewer turns/zooms to the target (`turnMapillaryViewerTo`) and, unless you pass `outlines`, outlines the target itself. If no `outline` is known, `value` makes it find the image's own detection of that value (nearest to the computed position).
- Select sign -> open image + highlight (this is host state; nothing automatic):
  ```tsx
  import { targetImageToPhoto } from '@osm-editor-kit/street-imagery'
  import { useSelectedMapillaryFeature, MapillaryFeatureBar, SelectedMapFeatureLayer } from '@osm-editor-kit/street-imagery-react'
  const { data, shownImage, firstImage } = useSelectedMapillaryFeature({ featureId, shownPhotoId: photo?.photoId, minCapturedAt })
  // on featureId change: setPhoto(targetImageToPhoto(firstImage))   (best image of newest day)
  <MapillaryFeatureBar data={data} shownImage={shownImage} onShow={(img) => setPhoto(targetImageToPhoto(img))} />
  <StreetLevelImageryViewer photo={photo} lookAt={{ lngLat: data.feature.lngLat, outline: shownImage?.outline, value: data.feature.value }} ... />
  <SelectedMapFeatureLayer data={data} shownImage={shownImage} providers={providers} bbox={bbox} zoom={zoom} />  {/* after the Sources/Layers; ring + dotted camera->sign line */}
  ```
- "Sign bar": `MapillaryFeatureBar` props `{data: MapFeatureImages, shownImage: TargetImage|null, onShow(image), labels?: Partial<MapillaryFeatureBarLabels>}`: sign icon (`mapillaryIconUrl`), translated name (EN/DE via `mapillaryValueName`), first/last seen, one button per capture day (re-click steps through that day's photos). Not a list of all signs in an image. For "all detections in the image" use `useMapillaryImageDetections(imageId, {filter, filterKey})` and pass as `outlines`; `useMapillaryMapFeaturesNear(lngLat, {radiusMeters, objectValues, enabled})` lists features near a point (Graph API, bbox < 0.01 deg).

### 3. Filters
- No store. Plain props: `StreetLevelImagerySourcesAndLayers filter={{ photoTypes?: ('flat'|'pano')[]; date?: {from?: 'YYYY-MM-DD'; to?: ...}; mapFeatureValue?: (value)=>boolean }}` (keep function identity stable). `useAllProviderPhotos(providers, bbox, zoom, photoTypes, date)`. The preview app keeps them in URL search params (zod, TanStack Router).
- Date applies to signs too (MapLibre filter `lastSeenAt >= from` and `firstSeenAt <= to`, `buildMapFeatureLayerFilter`; `mapFeatureMatchesDateRange` for JS). `photoTypes` only affects photos. Sign type = `mapFeatureValue` (e.g. `signGroupFilter`). No user/creator filter state; `NormalizedPhoto.creatorId` exists, and `createMapillaryHighlightResolver` (core) resolves usernames/orgs to ids to highlight (not filter) captures.
- UI: only `PhotoDateRangeFilter` (react root): props `value: DateRange`, `onChange`, `capturedAt?`, `yearLines?`, `recommendedMaxAgeYears?`, `markers?`, `maxYears?`, `now?`, `dateInputs?: 'collapsed'|'open'|'none'`, `allDatesAction?`, `className?`. Type toggles, sign group checkboxes and user filter must be built by the host (`PhotoCount`, `PhotoDate` are small helpers).

### 4. Viewer / detail view
- `StreetLevelImageryViewer` (`/viewer`, lazy-loads panel so mapillary-js loads on demand). Props: `photo: NormalizedPhoto` (required), `groupPhotos: NormalizedPhoto[]` (required; `[photo]` ok), `onPhotoSelected(selection)` (required; called on mapillary-js prev/next navigation), `onEaseMapToPoint(lng,lat)` (required), `onViewerPhoto?(photo)` (full data incl. creatorName, details, called for each shown image), `onViewerView?(view: PhotoView)`, `lookAtBearing?`, `lookAt?`, `outlines?`, `hideAttribution?`, `panoramaxPanel?`. Renders `MapillaryPanel` for `providerId==='mapillary'`, `PanoramaxPanel` for panoramax, null otherwise. Same components exported from `/viewer-panels`: `MapillaryPanel`, `PanoramaxPanel`, `PanoramaxDataProvider`, `panoramaxPhotoFromItem`, `mapillaryViewFor`, `setMapillaryViewerOutlines`, `turnMapillaryViewerTo`.
- Sizing: the panel is a div `min-h-48 overflow-hidden rounded-lg border bg-slate-900` with `aspect-ratio: 4/3`, fills the parent width (ResizeObserver resizes mapillary-js). Not fullscreen/resizable by itself; the parent decides width. Tailwind classes are used.
- Placement: `FloatingPhotoViewer` (react root) is the container: draggable header, left-edge resize, minimize, Esc/[ ]/Alt+arrows, position persisted in localStorage (`storageKey`). Props: `title`, `titleActions`, `suggestions`, `activeDirectionKey`, `onSelectSuggestion`, `shownPhotoId`, `canGoBack/canGoForward/onBack/onForward`, `onClose` (required), `step`, `toolbar` (e.g. MapillaryFeatureBar), `status`, `children` (the viewer), `footer`, `drawer`, `storageKey`, `defaultPosition`, `position: 'absolute'|'fixed'`, `minVisibleShare`. Render inside a `relative` map container. For a side panel/modal just put `StreetLevelImageryViewer` in your own element (no need for Floating).
- Buttons/extension points: package has no built-in "open in Mapillary", copy id or "use this photo"/tagging buttons. It gives `providerExternalLink(photo, view)` (core; same view/zoom as `onViewerView`), `FloatingViewerInfoButton` + `PhotoDetailsDialog` (`/photo-details`, props `open, photo, onClose`, labels `PHOTO_DETAILS_LABELS`), `LocationPickOnMap`/`getLocationOpeners()` (open place in other services). Add own buttons via `FloatingPhotoViewer` `titleActions`/`toolbar`/`footer`, or around the viewer; use `onViewerPhoto` to know the shown image id. The sign tag helpers: `osmTagKeys.ts` `mapillaryImagesOfTags(tags)` (core) extracts Mapillary image ids from OSM tags (`mapillary`, `mapillary:...`), `MapillaryTagKey`.
- Minimal:
  ```tsx
  import { StreetLevelImageryViewer } from '@osm-editor-kit/street-imagery-react/viewer'
  <StreetLevelImageryViewer photo={photo} groupPhotos={[photo]} onPhotoSelected={(s) => setSel(s)} onEaseMapToPoint={(lng, lat) => map.easeTo({ center: [lng, lat] })}
     onViewerPhoto={setViewerPhoto} lookAt={lookAt} />
  ```
  Build `photo` for a known Mapillary image id: `targetImageToPhoto(image)` or a `NormalizedPhoto` `{providerId:'mapillary', photoId, sequenceId:null, capturedAt:null, isPano:null, heading:null, lngLat:[lng,lat]}` (viewer loads by id; lngLat/isPano are placeholders refined via `onViewerPhoto`; unverified).

### 5. i18n
- `StreetImageryLocaleProvider locale="de"|"en"` (react root) + `messages` overrides per group (`dateFilter`, `viewer`, `viewpointRole`, `compass`, `viewDirection`, `unknownDate`). German exists, default is English. Sign names: `mapillaryValueName(value, 'de')` (German table `MAPILLARY_VALUE_NAMES_DE`), used by `MapillaryFeatureBar`; override via `labels.name`. Dates via `date-fns` (en/de). Detail dialog: `PHOTO_DETAILS_LABELS.de`. Feature bar: `MAPILLARY_FEATURE_BAR_LABELS.de`.

### 6. Peers and CSS
- Core peer: `maplibre-gl ^6` (optional); deps `@mapbox/vector-tile`, `pbf`, `date-fns`.
- React peers: `@osm-editor-kit/street-imagery`, `react ^19`, `react-dom ^19`, `maplibre-gl ^6`, `react-map-gl ^8` (imports `react-map-gl/maplibre`), `@tanstack/react-query ^5` (needs `QueryClientProvider`), `zustand ^5`; optional `mapillary-js ^4` (needed for the viewer and outlines), `@panoramax/web-viewer ^5`.
- CSS: `mapillary-js/dist/mapillary.css` is imported by the panel chunks (bundler must handle CSS imports; no manual import). Tailwind is NOT bundled: classes in the package need `@source '../node_modules/@osm-editor-kit/street-imagery-react';` in your Tailwind CSS (Tailwind v4); without Tailwind the layout/buttons are unstyled. MapLibre CSS is yours.

### Unsure
- Whether non-Tailwind apps look acceptable: no standalone CSS file shipped (checked: `files` is only `dist`).
- A `NormalizedPhoto` hand-built from just an image id: relies on viewer behaviour not verified in a browser.
- GeoJSON property names for sign features were read from source (`data/geojson.ts`), not observed on a running map.
- Detections endpoint behaviour/rate limits are as coded; not called live (no token, no network).

---

## FixMyBerlin iD fork: Mapillary / street imagery UI (research)

Root: `src/fmb_iD` (branch radnetz-mapping). Upstream: `src/openstreetmap_iD`. Paths below are relative to the fork root. Plan and decisions: `WORKDOC.md` features 18 (l.669), 19 (l.698), 20 (l.739), 25 (l.882), 26 (l.938), 36 (l.1529).

### 1. Photo viewer
- The viewer frame is unchanged from upstream: `.photoviewer` is a flex item left of the map, 330x250 px (490x370 from 1600 px screen width), 5 px padding, resizable with three handles (`modules/ui/photoviewer.js` l.38-60, `css/60_photos.css` l.21-44). Mapillary JS fills it. Nothing was added to image fit or zoom in the frame itself.
- Diff vs upstream `photoviewer.js` is small:
  - `addPhotoIdButton` no longer contains `mapillary` (l.22-23). The eyedropper "set photo from viewer" button is gone for Mapillary; Panoramax keeps it.
  - New `photoviewer.hide()` (l.267-280) closes every service viewer, and the close button calls it.
  - RTL handling was dropped (upstream has it).
- `services/mapillary.ts` additions: `imageFailed()` closes the viewer when an image id cannot be loaded (l.725-732 of the fork), `getViewer()`, `setOutlineFilter()`, exported `decodeDetectionOutline()` (l.878-891), `creator_id` / `organization_id` carried from the tiles.
- Added control: a dark **sign bar** (`.mapillary-sign-bar`, `css/99_mapillary_signs.css` l.72-95) positioned `bottom:100%` of the viewer, over the map, so the image stays free. Built in `modules/ui/mapillary_sign_bar.ts`, started from `ui/init.js` l.425-426.
- It shows when the Mapillary viewer is open and either a sign is selected, or an image is shown with one feature selected, or an infra3D link is possible (l.155-209).
- The viewer's X also deselects the sign (l.60-70). There is no X on the bar.

### 2. Traffic signs
**Sign layer** (`modules/svg/mapillary_signs.ts`, upstream already has the layer)
- Fork changes: the group filter in `filterData` (l.86-105), a new click handler (l.66-74), a yellow frame on the selected sign (`mly-sign-selected`, l.174), a dotted line plus dot from the image's GPS marker via Mapillary's computed position to the sign (l.147-170), and an outline filter for the viewer (l.78-83, set at l.205).
- Time filters use the sign's `last_seen_at` / `first_seen_at`.

**Sign groups** (`modules/mapillary/sign_groups.ts`, UI `modules/ui/mapillary_sign_groups.ts`)
- Four chips under the "Traffic signs" layer: bike, speed, access and oneway, other. Each chip shows the count of loaded signs in view. Several can be on. All on, or none chosen, shows everything.
- Grouping is by regex on the Mapillary sign *name* (the middle part of `regulatory--name--g1`), so design variants are covered (l.15-23, `signGroupsOf` l.40). A sign can be in several groups. Anything unmatched goes to `other`.
- Radnetz default is `bike, speed, access` (`other` is 79 % of Berlin detections). URL `photo_sign_groups`, config `mapillaryConfig({signGroups})`.
- The filter also decides which detection outlines the viewer draws. Non-sign objects (cars, trees) show only with the "Map features" layer.

**Sign selection** (`modules/mapillary/sign_select.ts`)
- Click a sign:
  - `selectMapillarySign` (l.126) fetches the Graph API feature with its `images`, then image info in batches of 50 (captured_at, is_pano, creator, computed_geometry), then `/<id>/detections` for outlines. That is 3+ requests per click.
  - Images are grouped by capture day, newest first (`imagesByDay`, `sign_view.ts` l.76).
  - The first image is the best of the newest day inside the age filter, else the best overall.
  - "Best" = an image with an outline, then the one closest to about 10 m from the sign (`compareSignImages`, l.68).
  - `photo_sign=<id>` goes into the URL and is restored on reload.
- `showSignImage` (l.176) moves the viewer, highlights the detection and turns the view to the sign (`turnToSign` l.238):
  - If Mapillary has an outline for the sign, the view is centered and zoomed on it (`viewFromOutline`).
  - Otherwise it uses another detection with the same sign value, the nearest to the estimate.
  - Otherwise it computes the view: 360 images via the viewer's `project` / `unprojectToBasic` plus distance for height and zoom (`viewFromLocation`); flat images via a pinhole model from focal length, compass angle and pitch (`viewFromFlatCamera`, zoom up to 2). If the sign is outside a flat image, no turning.
- The yellow highlighted box is Mapillary JS' own tag. `highlightDetection` marks the selected sign's detection, and `updateDetections` is re-called with the chosen detection (l.282-288).

**Sign tagging** (`sign_tagging.ts` plus `sign_groups.ts` `signMeaning` l.112)
- A table maps Mapillary names to German values: about 40 entries (`bicycles-only`→`DE:237`, shared path→`DE:240`, dual path→`DE:241-30`/`-31` (bike-left first), `pedestrians-only`→`DE:239`, `except-bicycles`→`DE:1022-10`, `no-entry`→`DE:267`, one-way→`DE:220-10`/`-20`, living street→`DE:325.1` ...).
- Speed limits are computed: `maximum-speed-limit-N`→`DE:274-N`, plus the tags `maxspeed=N` and `source:maxspeed=sign`. Zones: `DE:274.1` writes `maxspeed=30` with `source:maxspeed=DE:zone30` (`-20` for zone 20).
- Where it writes (`signButtonKeys` l.23):
  - Base key is `traffic_sign`. For bike signs it is `cycleway:<side>:traffic_sign`, or the `sidewalk:` equivalent, when the sign stands on a side (`sideOfLine` l.98) that has a bike lane or sidewalk.
  - Three keys are offered: plain, `:forward`, `:backward`.
  - The suggested key is chosen by direction. `signDirectionOnWay` (l.61) compares Mapillary's `aligned_direction` + 180 with the way bearing at the nearest segment: within 60 degrees is forward, beyond 120 is backward, otherwise none. On sides the plain key is suggested; on `traffic_sign` the directional key, unless the way is one-way in that direction.
  - Speed tags get a directional variant (`maxspeed:forward`) first when a direction is known.
- Supplementary signs (`DE:10xx-`) are appended: `DE:239,1022-10`. Other signs replace the value (`addSignToValue` l.142). Removal is symmetric.
- Provenance: `source:<key>:mapillary=<imageId>` (e.g. `source:traffic_sign:mapillary`), appended to a `;` list (`signSourceChanges` l.117).
- Button state (`changeLabel` l.149): `✓ key=value` (green, already tagged), `maxspeed=50→30` (orange, would replace), `key=+1586…` (id added to a list).

### 3. Helper buttons
Every write is one `actionChangeTags` undo step (`mapillary_sign_bar.ts` l.433). A green "present" button can be clicked again to undo, but only if the tag was changed in this session (l.386-437).

Tags are written to the single selected way (tag buttons) or entity (image buttons).

See the table. Not buttons but related:
- **Mapillary images field** (`modules/ui/fields/mapillary_images.ts`). It is universal, replaces the schema `mapillary` field and shows once any image key is tagged.
  - One row per image id across all keys. Key grammar (`mapillary/tag_keys.ts` l.230): `[source:][cycleway|sidewalk[:side]:][traffic_sign[:dir]:]mapillary[:forward|backward|n]`.
  - Per row: editable id (a pasted `pKey=` URL is normalized), external link, eye "show in viewer", trash, and a small line "3 months ago · 360°" from the Graph API (`image_info.ts`).
  - "+" in the label adds a row with a key chooser.
  - Focusing a row makes it the "active target" that the viewer bar suggests (`active_target.ts`).
- **infra3D** buttons ("3D" in the sidebar header, "infra3D ↗" in the bar): Berlin only, behind a login (`modules/infra3d/infra3d.ts`). Project-specific.

### 4. Filters and auto-show
- Photo Overlays pane (`modules/ui/sections/photo_overlays.js`; the pane now has no collapse header):
  - Upstream filters are kept: layer toggles, photo type (flat / panoramic / ...), user name text input, date slider.
  - Fork additions:
    - Default "from" date 2024-01-01 (`mapillary/config.ts`, applied in `renderer/photos.js` unless `photo_dates` is in the URL). A marker line with a label shows the default date on the slider (l.317-328).
    - Age colors: the range cutoff..now is split into thirds, giving `outdated` (red), `old` (orange), `mid` (yellow) and `new` (green) (`age_bands.ts`), applied to sequence lines and image dots, with a legend (l.360-376).
    - "Highlight users" and "Highlight organizations" text inputs (l.476+). Highlighted creators get a dot on the marker and a thicker sequence line. `mapillary/highlight.ts` resolves a username to a creator id (`images?creator_username=`) and an org id to a slug (`/{id}?fields=slug`), cached. URL `photo_highlight_users` / `photo_highlight_orgs`.
    - Sign group chips (see 2).
    - Checkbox "Show the way's Mapillary image when selecting it", on by default, pref `mapillary-auto-show-selected`.
- Images of the selected feature are always drawn, even when filtered out, with a magenta ring (`svg/mapillary_images.ts` l.202-235, 296-312; `selected_images.ts`).
- Auto-show (`mapillary/auto_show.ts`): on every mode change to `select` with exactly one entity that has an image key, it enables the Mapillary layer and shows `preferredImageId` (`mapillary:forward`, then `mapillary`, then the first key in display order, first id of a list; `tag_keys.ts` l.312). It skips when a sign is selected or the image is already shown.
- The sign layer has its own min zoom of 12 and the sign filters follow `fromDate` / `toDate` (via `last_seen_at`).

### 5. Other
- `highlight.ts`: pure resolver, see 4. It needs a token. The Graph API token is the public one iD ships (`services/mapillary.ts` l.20, now exported).
- `image_info.ts`: Graph API `captured_at,creator,is_pano` per id, cached per session, "x months ago" via `Intl.RelativeTimeFormat`.
- `selected_images.ts`: ids from all image keys of the selection, looked up in the loaded tile cache (`service.cachedImage`), so only images in loaded tiles are drawn.
- `viewer.ts` (`showMapillaryImage`): enables the layer, loads MapillaryJS, selects the image and shows the viewer (the map recenters on the image).
- `radnetz_customization.ts` l.78-84 only swaps the `mapillary` field to type `mapillaryImages`, `universal: true`. It has no photo logic.
- Related tags (WORKDOC 25): Mapillary keys of another field's key, such as `source:traffic_sign:mapillary`, show as a line below that field with an eye button.
- Everything depends on the Mapillary Graph API with a public token. There is no offline mode and no mock.

### Button table
| button | where | does | worth rebuilding? (judgement) |
|---|---|---|---|
| `key=1586…` image buttons (`imageActionsFor` l.361) | sign bar, one feature selected and an image shown | Appends the shown image id to `;` list of one image key (existing keys, `mapillary[:forward/backward]`, side keys with lane/sidewalk, sign source keys). Suggested = row last focused in field. Disabled if image is more than 100 m away. Toggle off in session. | Yes, core. Easy. The key logic is pure TS (`tag_keys.ts`, `set_photo.ts`), port as is. |
| Day buttons | sign bar head, sign selected | One per capture day, newest first, shows "Aug. 2026 / 2 months ago" and "2/24". Click shows the best image of that day, click again steps through the day. | Yes if signs are rebuilt. Medium: needs the Graph API calls, ordering logic is pure. |
| Sign tag buttons (`maxspeed=30`, zone tags) | sign bar write area, one way selected | Writes `maxspeed` and `source:maxspeed=sign` (or `DE:zone30/20`), directional variant first when direction is known. | Yes for speed, but needs a Germany-specific table. Easy. |
| Sign value buttons (`traffic_sign=DE:237`, `:forward`, `:backward`, side keys) | sign bar, one row per possible sign | Writes or appends the German sign value to the suggested or chosen key. | Yes for a cycling editor; the side and direction detection is the hard part (geometry, about 60 lines). |
| Source button `source:traffic_sign:mapillary=1586…` | sign bar | Appends the shown image id to the source key of the suggested sign key. | Yes. Easy. |
| Direction badge ("forward/backward") | sign bar head | Shows the way direction the sign applies to. | Yes, cheap with the pure function. |
| Sign group chips with counts | Photos pane under Traffic signs | Filters markers and viewer outlines by Bike / Speed / Access / Other. | Yes. Easy, the regex table is portable. Needed to make signs usable. |
| Click on sign: select, turn view | map sign layer | Loads all images and detections, picks the best image, centers and zooms on the sign (outline or computed). | Core of the sign feature, hard: depends on MapillaryJS (`project`, `setCenter`, `setZoom`) and the math. If the new editor uses MapillaryJS, port `sign_view.ts` and `turnToSign`. |
| Eye "show in viewer" | Mapillary images field, per row | Enables the layer, opens the image. | Yes. Trivial. |
| "+" add image with key chooser, trash, id input (accepts URL) | Mapillary images field | Edit the image keys by hand. | Probably; a plain tag editor might be enough at first. |
| Auto-show checkbox | Photos pane | Opens the preferred image when a feature is selected. | Yes, high value for survey/QA, trivial. |
| Highlight users/orgs inputs | Photos pane | Marks images and sequences by username / org with a dot. | Maybe, only if the project has own mappers. Needs extra API lookups. |
| Date slider default 2024 + cutoff marker + age colors | Photos pane, map | Hides old imagery by default, colors by age. | Yes, age colors are cheap and useful. |
| infra3D buttons | sidebar header, bar | Opens infra3D at feature or image. | No (Berlin, login). Optional, a generic "other imagery" link instead. |
| Selected feature's images (magenta ring, ignore filters) | map | Always shows the images tagged on the selected feature. | Yes, easy. |

### Unsure
- I did not run the fork. Behavior comes from code and WORKDOC; the WORKDOC marks "bar on small viewers" and "English-only strings" as open.
- I did not compare `mapillary_images.ts` / `mapillary_map_features.ts` / `mapillary_position.ts` in depth against upstream (only the diff of the images layer). The 330x250 viewer size and resize handles are upstream, not new.
- The way the "present, click again to undo" rule handles a way that was edited and reverted by hand (`renderButtons` l.386-398) is untested.
- Zoom and turning values (`SIGN_SHARE` 0.3, `SIGN_ABOVE_CAMERA` 0.25 m / 1.5 m for flat) are heuristics checked on only two streets (WORKDOC "Tested").
- It is not clear whether `regulatory--bicycles-only` can also be DE:244.1 (WORKDOC open point).
- The sign meaning table is Germany-only and partly derived from a third-party dataset (vizsim) that I did not open.
