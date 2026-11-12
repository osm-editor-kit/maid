# Terrain and hillshade sources for an OSM editor

Research note, 2026-11-12. Read-only on `a clone of tordans/iD` and `a clone of osm-editor-kit/maplibre-editor-layer-index`.

Legend: **[measured]** = read from a file or API response in this session. **[inferred]** = my reading of code or knowledge, not run. **[unsure]** = could not verify.

## Summary

- **No source in either repo can drive `map.setTerrain` or a MapLibre `hillshade` layer.** Both need a `raster-dem` source with RGB-encoded heights (Terrarium or Mapbox). [measured] The ELI package has no `dem` type and no Terrarium/Mapbox-encoded URL; every elevation row is a rendered shaded-relief image or a contour overlay. [inferred] MapLibre's `hillshade` layer and `setTerrain` both require `raster-dem` (maplibre.org was not reachable, so this is from knowledge).
- **The only DEM in the sources is Mapterhorn** (`https://tiles.mapterhorn.com/{z}/{x}/{y}.webp`, Terrarium, 512 px, z0-15), used by the iD PR. [measured] Its licence is **not verified**: mapterhorn.com did not resolve from this session, and the PR's `permission_osm: "explicit"` claim is not backed by any file here.
- **For a hillshade image overlay in MapLibre (no 3D), ELI has usable rows.** For Germany, Austria, Switzerland and Czechia, the best-documented candidates are listed in section B.4. Each still needs a person to read its `licenseUrl` before it is used in an OSM editor, because ELI in this package carries no OSM-permission field.
- **Missing:** a licence-cleared, Terrarium- or Mapbox-encoded DEM covering DACH with a documented OSM permission. Options are in section D.

---

## A. iD PR tordans/iD#3 (Mapterhorn elevation panel and hillshade)

### A.1 Provenance [measured]

- Branch `cursor/mapterhorn-hillshade-926a`, FETCH_HEAD `a427055f7becca96eecbb02a1931a4be25f88498`, 5 commits in the fetched history. PR state open, base `32c05ed6f78c83c7f551f27bfc8bb13076613ebf` (`gh api repos/tordans/iD/pulls/3`).
- 31 files changed, +1608 / -9 (`gh api repos/tordans/iD/pulls/3/files`). The base commit is not in the shallow clone, so `git diff base..FETCH_HEAD` does not work; the per-file patches come from the GitHub API.
- PR body credits "https://mapterhorn.com/examples/terrain/" and says "Note to self: Edit redirect URL" for an OAuth app. The PR is an exploration, not merged.

### A.2 Tile URL, encoding, size, zoom [measured]

- `modules/elevation/constants.ts`:
  - `MAPTERHORN_TILE_TEMPLATE = 'https://tiles.mapterhorn.com/{z}/{x}/{y}.webp'`
  - `MAPTERHORN_TILE_SIZE = 512`
  - `MAPTERHORN_ZOOM_EXTENT = [0, 15]`
  - `PROFILE_TILE_ZOOM = 14`, `PROFILE_SAMPLE_STEP_METERS = 15`
- `data/imagery.json` entry `mapterhorn-hillshade`: `type: "dem"`, `encoding: "terrarium"`, `overlay: true`, `tileSize: 512`, `zoomExtent: [0, 15]`, `terms_url: https://mapterhorn.com/attribution`, `terms_text: "Mapterhorn"`.
- `data/manual_imagery.json` entry of the same id adds `attribution: {text: "Mapterhorn", url: "https://mapterhorn.com/attribution", required: true}` and `permission_osm: "explicit"`. [measured] Nothing in this repo or the fetched files shows that permission; the value is the PR author's claim.
- Attribution text: "Mapterhorn" (link to mapterhorn.com/attribution). Licence text: not read (unreachable).

### A.3 Elevation decoding [measured]

- `modules/elevation/terrarium.ts`: `height = R*256 + G + B/256 - 32768` (standard Terrarium). Test `test/spec/elevation/terrarium.js` checks sea level (128,0,0) = 0 and (130,0,0) = 512.
- `elevationAtTileCoord` does bilinear interpolation over the 512 px tile, using `fracX * (tileSize - 1)`.
- `modules/elevation/profile.ts`: `densifyLine` samples every ~15 m along the way; each sample's tile is fetched at z14 and decoded. Tiles are cached in `DemTileCache` (`tile_cache.ts`, max 120, only successful fetches cached, retried on failure). Tiles are decoded by drawing the WebP into a 512 canvas and reading `getImageData`.
- [unsure] WebP lossy vs lossless: if Mapterhorn WebP is lossy, the decoded heights carry compression error. Not checkable here (mapterhorn.com unreachable).

### A.4 Hillshade [measured code, inferred behaviour]

- `modules/elevation/hillshade.ts` `hillshadeFromTerrarium(data, w, h, azimuth=315, altitude=45)`: Horn-like central differences `dzdx = (e[x+1]-e[x-1])/2`, `dzdy` likewise, no division by ground pixel size. `slope = atan(sqrt(dzdx²+dzdy²))`, standard Lambert shade, alpha 200.
- [inferred] Because `dzdx` is height per **pixel**, not per metre, the computed slope equals the true slope times metres-per-pixel. Metres-per-pixel depends on zoom and cos(latitude) (about 2.4 m/px at z15 on the equator for 512 px tiles, about 76 m/px at z10). So shading contrast is zoom- and latitude-dependent; it is too strong at low zoom and too weak at high zoom. Fix: divide by cell size in metres (`mpp = 40075016 * cos(lat) / (512 * 2^z)`).
- [inferred] The loop runs from `y=1..h-2`, `x=1..w-2`, so the outer one-pixel border of each tile is left at alpha 0 (possible seam).
- `modules/renderer/hillshade_layer.js`: a canvas-per-tile renderer, separate from `tile_layer`. It draws the shaded ImageData at `tileSize` from the source, looks up parent tiles (`lookUp`) when a child fails, and reuses `_rendered` ImageData on pan.
- `modules/renderer/background.js`: `d.type === 'dem'` picks `rendererHillshadeLayer`; a `dem` overlay adds class `layer-overlay-hillshade`; opening the panel with the Mapterhorn overlay on calls `ensurePanelOpen()`.
- `modules/renderer/background_source.js`: `dem` sources get the same `{x}/{y}` substitution as `tms`.

### A.5 MapLibre 3D terrain [measured: absent]

- `git grep` for `setTerrain`, `exaggeration`, `maplibre`, `terrain` in the PR tree finds only the names of existing iD imagery (`basemap.at-terrain`, Stamen Terrain, etc.) and the elevation constants. **iD does not use MapLibre and the PR adds no 3D terrain.** The "terrain" in the PR is 2D canvas hillshade plus a profile chart.

### A.6 Elevation panel and UI [measured]

- `modules/ui/panels/elevation.ts` draws the profile as an SVG polyline (250 x 90 viewBox), hover finds the nearest point with `profilePointAtDistance`, and the map marker is `svg/elevation_auxiliary`.
- Overlay toggle reuses the Background overlay list, bound to `overlays=mapterhorn-hillshade` in the URL (`API.md`).

---

## B. ELI for MapLibre (`@osm-editor-kit/maplibre-editor-layer-index`)

Path: `a clone of osm-editor-kit/maplibre-editor-layer-index/packages/maplibre-editor-layer-index/` (abbreviated `pkg/` below). Commit `27fadc2`, data from ELI `sourceCommit 9d2097a8…`, generated 2026-11-09 (`pkg/src/data/manifest.json`).

### B.1 Does ELI contain DEMs? [measured]

- `pkg/src/core/types.ts`: `EliLayerType = 'tms' | 'wms' | 'wmts'`; `pkg/scripts/transform.ts` `SUPPORTED_TYPES` drops everything else. `pkg/scripts/schema.ts` accepts upstream types `tms, wms, wmts, bing, scanex, wms_endpoint, pmtiles` and a `category` enum that includes `elevation`. Upstream `dem` does not appear.
- `manifest.json` counts: 1764 upstream, 1746 published, dropped `bing: 1`, `wms_endpoint: 17`. No DEM type is counted.
- `grep -ri 'terrarium|mapterhorn|rgb-?dem|raster-dem|terrain-?rgb'` over `pkg/src`, `pkg/scripts`, `pkg/tests`, `apps/preview`: **no hits**.
- `pkg/src/data/locator.json`: 90 rows with `category: "elevation"`: 69 `wms`, 21 `tms`, all `tileSize: 256`, all with a `details` entry. 5 are overlays (`hu-hillshade`, `kartverket-fjellskygge`, `kartverket-hoydekurver`, `GEOSN-DGM-CL`, `tirol.gv.at-contourlines`, `Vicmap-el_contour` is category `other`). No row needs an API key (`requiresKeys` empty for all 90).
- Every elevation URL is a PNG, JPEG or WebP shaded-relief image, a contour overlay, or a slope colour raster (`IGN slope`, `USGS slope`, `MassGIS Slope`). **Not one returns height values.** A shaded PNG cannot be decoded to height; its RGB is a grey or colour ramp of illumination.

### B.2 How the package exposes layers [measured]

- Entry points: `/react` (`useEditorLayerIndex`), `/maplibre` (`addEditorLayer`, `removeEditorLayer`), `/oam`, and root (`loadLayersInViewport`, `layersInViewport`, `layersForCountry`, `getLayerHydrated`) (`pkg/README.md`).
- `getRasterSourceSpec(layer, {apiKeys, pixelRatio})` returns `{type: 'raster', tiles, tileSize, scheme?, minzoom?, maxzoom?, attribution?}`; `getRasterLayerSpec` returns `{id, type: 'raster', source, minzoom?, maxzoom?, paint?}` (`pkg/src/core/specs.ts`). **Both are always `raster`; there is no `raster-dem` output and no `encoding` field.**
- `addEditorLayer(map, layer, opts)` adds source + raster layer (`pkg/src/maplibre/index.ts`). Idempotent.
- `EliCategory` filter: `categories: ['elevation']` works (`pkg/README.md` filter table).
- WMS URLs get `WIDTH/HEIGHT` scaled by device pixel ratio; `{bbox-epsg-3857}` is a MapLibre token.
- Coverage: `bboxes`, `countryCodes` (from real coverage polygons, so a row listing `AT` for a Slovak source means the polygon touches Austria), `continents`.

### B.3 Licence and permission fields [measured]

- The package has `attributionHtml`, `attributionText`, `attributionUrl`, `licenseUrl` (`pkg/src/core/types.ts`). **No `permission_osm`, no OSM-compatibility flag.** README licence section: "ELI imagery metadata is © its respective providers; see each layer's attributionHtml and licenseUrl."
- Some `licenseUrl` values point at OSM-wiki permission pages or permission PDFs, e.g. `basemap.at` "Permission_to_Incorporate_basemap.at_Into_OpenStreetMap", `DE:Permissions/2025-lvermggeo-rlp`, `Permission_City_of_Berne_Orthophotos`, `Kartverket` "fornyet tillatelse" (forum thread). These suggest per-provider OSM permission was requested, but the package does not say whether it was granted.
- [measured] Two URL templates carry literal API keys: Klimadatastyrelsen (`apikey=` parameter on `wms.datafordeler.dk`), and LINZ (`?api=` on `basemaps.linz.govt.nz`). The package's `extractRequiredKeys` only reads `{placeholder}` tokens, so these keys are not declared and not swapped. An editor shipping these URLs would expose a key. (I did not copy the values.)
- [measured] `ign-bl-slope` and `us-pr-slope` point at `proxy.slopes4osm.workers.dev`, a third-party worker, not the data owner.

### B.4 Elevation rows relevant to DACH [measured from locator and details; licence reading is my summary of `licenseUrl`/attribution]

Coverage uses ELI `countryCodes`. "Shade" means a hillshade or relief image; "contour" means lines.

| id | type, zoom | coverage (countryCodes) | content | licenceUrl / attribution (as stored) |
|---|---|---|---|---|
| swisstopo_swissalti3d | tms, max 18 | CH, LI | multidirectional shade of swissALTI3D (`reliefschattierung`) | swisstopo free-geodata page; "Federal Office of Topography swisstopo" |
| swisstopo_swisssurface3d | tms, max 18 | CH, LI | shade of surface model | same |
| Aargau-AGIS-2014-Hillshade | tms, 2-19 | CH, DE | 50 cm DTM shade | OSM wiki Switzerland/AGIS; AGIS 2014 |
| basemap.at-terrain | tms, 1-19 | AT, DE, HU, IT, SI | grey terrain (`bmapgelaende`) | OSM-permission PDF; basemap.at |
| gis.stmk.gv.at-terrain | wms | AT, SI | Steiermark shade | OSM "Special CC BY statement" PDF; (c) GIS-Steiermark |
| tirol.gv.at-DGM | wms | AT, CH, DE, IT | Tirol shade | tiris Gelaende terms |
| vogis.cnv.at-DGM | wms | AT, DE | Vorarlberg 50 cm terrain shade | Vorarlberg open-data terms |
| South-Tyrol-DTM_2013 / DSM_2013 | wms | IT (DTM/DSM 2006 also AT) | 0.5 m and 2.5 m hillshades | CC0-1.0 per metadata |
| Bern-dtm-hillshade-2015 / dsm | wms, min 1 | CH | 50 cm LiDAR relief | Bern AGI terms PDF; (c) Amt fuer Wald |
| OGDLidarZH-DTM-2014/2017/2022 | wms, min 9 | CH, DE | Zurich terrain shade | geo.zh.ch terms of use |
| Solothurn-sogis2014/2018/2019 DTM/DSM | wms | CH (and DE/FR) | 50 cm relief | OSM wiki SOGIS_WMS |
| Kanton-Schaffhausen-DSM-2013 | wms, min 10 | CH, DE | relief 2013 | sh.ch page |
| Geneve-dtm-2014...2023 | wms, min 2 | CH, FR | SITG shade | sitg.ge.ch terms |
| Brandenburg-DGM | wms | DE, PL | DGM 1 m shade | OSM wiki Brandenburg/Geoportal legal; dl-de/by-2-0 |
| mv-DGM | wms | DE, PL | DGM1 shade and contours | laiv-mv FAQ; CC-BY 4.0 |
| Rheinland-Pfalz-DGM | wms | DE, FR | shade 1 m | OSM wiki DE:Permissions/2025-lvermggeo-rlp; dl-de/by-2-0 |
| nrw_dtm_wms | wms | DE | NRW DGM shade | NRW licence PDF; no attribution |
| GEOSN-DGM-SG | wms | DE, CZ | Saxony standard relief | OSM wiki GeoSN Open Data |
| GEOSN-DGM-CL | wms, overlay | DE, CZ | Saxony contours | (contours, not shade) |
| Klimadatastyrelsen_Terrain_Shadow_40cm | wms, max 20 | DE, DK, SE | Denmark shade (DE in coverage) | datafordeler terms; **key in URL** |
| CzechCUZKdmr5g | wms, 1-20 | CZ, PL | DMR 5G greyscale hillshade | OSM wiki Freemap / CUZK |
| dtm5-sk-shading, dtm5-sk-shading-light, dsm1-sk-shading, dtm-sk-shading-light | tms | AT, CZ, HU, PL, SK, UA | Slovak DMR shade (CZ/AT listed through coverage overlap) | OSM wiki WikiProject_Slovakia; UGKK SR |
| Geoportal2-PL-shaded_relief_WMS | wms, max 23 | CZ, DE, PL, RU, UA | Poland shaded relief | OSM wiki Geoportal.gov.pl |
| hu-hillshade | tms, max 18 | AT, BA, CZ, HR, HU, RO, RS, SI, SK, UA | Hungary shade (SRTM based, overlay) | **no licence URL**; attribution "SRTM" |
| ign-bl-slope | tms, 11-16 | FR | slope colour | third-party worker proxy |

Not DACH but relevant for permission patterns: `fr.ign.mnslidarhd` and `fr.ign.mntlidarhd` (IGN LiDAR HD shadow tiles, z0-18, Etalab Licence Ouverte), `DV_DHMV_II_HILL_25cm` (BE/FR/NL).

---

## C. Recommendation

1. **3D terrain (`setTerrain`) and MapLibre's `hillshade` layer: no ELI source qualifies.** Need a `raster-dem` source. The only candidate in the sources is Mapterhorn (A.2), and its licence and OSM permission are not verified. A person must read mapterhorn.com/attribution and its terms from a network that resolves it, and must confirm that OSM use (including the editor shipping the tiles) is allowed, before anyone wires it into `apps/*` or the tile proxy.
2. **If the licence is cleared**, Mapterhorn can drive `setTerrain` and a `hillshade` layer directly: `{type: 'raster-dem', tiles, tileSize: 512, encoding: 'terrarium', maxzoom: 15}` (MapLibre spec from knowledge, [unsure] until checked). Its `tileSize` must match its tiles, not ELI's 256.
3. **For a 2D hillshade image overlay**, use ELI rows through `addEditorLayer` with `categories: ['elevation']` and `countryCodes: [...]`. Best-documented DACH candidates: swisstopo swissALTI3D/swisssurface3d (CH), South Tyrol (CC0), mv-DGM (CC-BY 4.0), Brandenburg / Rheinland-Pfalz (dl-de/by-2-0), Steiermark (CC-BY per linked PDF), CUZK (CZ, linked to Freemap OSM permission). Each still needs its `licenseUrl` read by a person before use in an OSM editor; ELI does not state OSM permission. Exclude the rows with embedded keys and the proxy rows unless they are rehosted.
4. **Do not** feed ELI shaded PNGs to `setTerrain`. Their pixel values are shading, not heights.
5. **Fix before reuse** of iD's hillshade code: scale slope by metres per pixel (A.4).

## D. What is missing

- A licence-cleared Terrarium or Mapbox DEM over DACH with a recorded OSM permission. ELI has none. Mapterhorn is the only one found, unverified.
- A `dem` type or `encoding` field in the ELI package; it drops non-`tms/wms/wmts` types.
- Permission data (`permission_osm`-like) in ELI for the package to filter on. The PR's `permission_osm: "explicit"` is not from ELI.
- If none of the above is cleared: cut Terrarium tiles from an open DEM (for example the swisstopo or Bundeslaender DGM downloads) with a script, and host them. This is inferred work, not checked.

## E. Found / unsure / measured vs inferred

Found [measured]: all PR and ELI file paths and values above; 90 elevation rows; 0 DEM rows; 0 Terrarium or Mapbox URLs in ELI; no `setTerrain` in the iD PR; Mapterhorn URL, encoding, size, zoom.

Unsure:
- Mapterhorn licence, OSM permission, lossy vs lossless WebP, attribution wording beyond "Mapterhorn" (mapterhorn.com unreachable: DNS failure, `getaddrinfo ENOTFOUND`; mapterhorn.com needs to be allowed in the session network settings).
- MapLibre `raster-dem` / `hillshade` / `setTerrain` requirements (maplibre.org unreachable: DNS failure; `maplibre.org` needs to be allowed). Stated from knowledge only.
- Whether each ELI licence allows OSM use.
- Coverage precision: `countryCodes` come from ELI polygons, but I did not check specific border tiles.
- hu-hillshade licence (no URL).

Inferred:
- Hillshade contrast depends on zoom and latitude because slope is not divided by metres per pixel (A.4). Not measured by rendering.
- The one-pixel border of each hillshade tile is transparent.
- ELI `locator.json` counts and `countryCodes` are the package's build output; not re-verified against ELI upstream.

Paths read: `a clone of tordans/iD/modules/elevation/{constants,terrarium,hillshade,tile_cache,profile,manager,geometry}.ts`, `a clone of tordans/iD/modules/renderer/{hillshade_layer.js,background.js,background_source.js}`, `a clone of tordans/iD/modules/ui/panels/elevation.ts`, `a clone of tordans/iD/data/{imagery,manual_imagery}.json` (via PR patches), `a clone of tordans/iD/test/spec/elevation/*.js`, `a clone of osm-editor-kit/maplibre-editor-layer-index/packages/maplibre-editor-layer-index/{README.md,src/core/{types,specs}.ts,src/maplibre/index.ts,src/data/{locator.json,details/*.json,manifest.json},scripts/{schema,transform}.ts}`.
