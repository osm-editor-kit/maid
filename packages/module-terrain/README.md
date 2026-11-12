# Terrain module (`@osm-editor-kit/maid-module-terrain`)

The ground's relief under the OSM data and the ground in 3D, for editors where height matters (Maid Climbing). Research: [docs/research/climbing.md](../../docs/research/climbing.md), "Terrain".

## What a person sees / can do

- A top bar panel "Terrain" (Gelände) with Off, Relief and 3D.
- Relief: a MapLibre `hillshade` layer under the OSM data.
- 3D: `map.setTerrain` with a height scale (×1, ×1.5, ×2) and the map tilted to 55°; tilt buttons (0°, 30°, 45°, 60°) and two-finger tilt. Leaving 3D lays the map flat.
- While terrain is on, an amber notice: the elevation is Mapterhorn's, a composite of 153 sources, and not all of their licences are known to be compatible with OSM, so no OSM data should be derived from it. A link goes to mapterhorn.com/attribution. The source attribution "© Mapterhorn" is in the map's attribution.
- URL: `terrain=relief|3d`; the tilt is the fifth number of `map=`.
- Under automation (`isAutomated()`) nothing is drawn or requested, and the panel says so (core rule 1).

## Why Mapterhorn and not the editor layer index

ELI has no elevation source that gives heights: its 90 elevation rows are shaded-relief, slope and contour images (WMS/TMS, `raster`), which MapLibre cannot use for `raster-dem`, `hillshade` or `setTerrain`. Those images can still be shown as overlays in "Background". Mapterhorn is the one Terrarium DEM found (`https://tiles.mapterhorn.com/{z}/{x}/{y}.webp`, 512 px, zoom 0 to 15).

## Using it in an editor's config

```ts
import { terrain } from '@osm-editor-kit/maid-module-terrain'
terrain(),
```

It registers `map.view` with `maxPitch: 60` (MapLibre's default; the OSM tile cover grows fast above it, see docs/research/rotate-and-tilt.md): the shell keeps every other editor flat.
