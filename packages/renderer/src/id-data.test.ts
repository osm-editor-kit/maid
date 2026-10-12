// Adopted from iD test/spec/svg/data.js (ISC, © iD contributors), at commit 0194f3926.
import { describe, it } from 'bun:test'

describe('iD.svgData', () => {
  // covered: GeoJSON drawn as fill, line and circle layers: packages/module-data-layers/src/layers.test.ts
  // ('a GeoJSON URL is one source with a fill, a line and a circle layer'); GeoJSON files: the same
  // file's 'a file layer is drawn from its data, not from a URL' and packages/module-data-layers/src/geojson.test.ts.

  // n/a: iD's test counts the `g.layer-mapdata` SVG group; MapLibre draws the data layers.

  // needs F-svg-3: GPX and KML files as data layers (Maid reads GeoJSON only)
  it.todo('handles gpx files', () => {})
  it.todo('handles kml files', () => {})

  // needs F-svg-4: labels for the features of a data layer, with a switch to hide them
  it.todo('shows labels by default', () => {})
  it.todo('hides labels with showLabels(false)', () => {})
})
