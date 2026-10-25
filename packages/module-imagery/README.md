# @osm-editor-kit/maid-module-imagery

Imagery under the OSM data: a background (an ELI layer or a custom tile URL template), overlays (ELI's and OpenAerialMap images) and a
brightness, chosen in the top bar's "Background" panel. Built on
`@osm-editor-kit/maplibre-editor-layer-index` (0.5.0).

## Series (one row, many dates)

ELI lists every capture date of an area as its own layer, so Berlin has eleven
`Berlin/Geoportal DOP20RGB (…)` entries. The background list shows a series once:

- `eli.ts` (`listView`) filters the layers by the view and the zoom first, then runs ELI's
  `groupLayers()` on the backgrounds. A series offers only the dates that cover the view.
- `series.ts` turns the entries into rows. A series is one row whose dates are always-visible chips
  under it, newest first, labelled with the date (`group.label`); the best date is marked. A click on
  the row selects the default date (ELI's best, else the newest); a chip selects its date.
- The row looks chosen while any of its dates is drawn, and only that date's chip is marked
  (`aria-pressed`). The row is filed under the category of its newest date.
- The stored choice is still a layer id, the id of the date. Links (`bg=<id>`) and the
  `imagery.used` name (the date's own name) are unchanged.
- Search matches the series name, the category and the date labels.

Overlays are still listed one layer per row. Tests: `series.test.ts` (hand-made layers with `group`,
run through the package's `groupLayers`).

## URL and start

The URL is the live state. The module declares three parameters (core's `api.urlParam`):
`bg` (an ELI id, `none`, or `custom:<template>`; iD's name `background`, with iD's `layer` read too), `overlays` (a
comma list in the order chosen, `none` for an empty list; iD's name too) and `bg_display` (the display settings of the
background, Maid's own name: `brightness:70` is 70 %, 20 to 100, and 100 % is left out of the URL). All are written
with `history: replace`. `bg` and `overlays` are kept when they equal the default; `bg_display` is left out while the
default (100 %) is shown and no link asked for it (`omitFallback`).

- `bg_display` is read by `parseAsBgDisplay` (`url.ts`), which reads a generic `name:value` list: an unknown name
  is ignored, and so is an invalid value. A value with no `brightness` entry is no opinion, so the stored brightness
  applies. The brightness is read and chosen through core's `useUrlSetting` (`shown.ts`, `useLiveBrightness`): the
  map layer writes the URL, the panel's slider chooses. A link never writes the stored brightness.

- The start order (`start.ts`, a pure function with table tests) is iD's: the URL, the best layer that covers more
  than half of the view (`coverage.ts`, iD's box rule), the stored choice when it is valid for the view, the fork's
  default (`imagery({ default })`), the first valid layer, else none. It runs once, when the map has its first view
  (`shown.ts`), and only then is the URL written with what is shown. Before that the pending value stands.
- A choice writes the URL and remembers the value for the next visit (`background`, `overlayIds` and `brightness` in
  `maid:imagery`, version 3). A link alone writes nothing to storage.
- A custom template in a link is shown as it is. The panel shows a hint when a part of the template looks like a key
  (`keyLikeNames`), because a shared link includes it.
- Under automation the start does not run and nothing is written; a local template from a link is still drawn.

## Background offset

iD's `offset` (the same name, `east,north` in meters, rounded to two decimals; iD's `background.js`). It is in the
panel's "Imagery offset" disclosure: four nudges of half a screen pixel (`NUDGES`, iD's step, divided by 2^zoom), a field
that takes two numbers (an empty field resets), and a reset. There is no keyboard shortcut: iD has none for the background.

- `offset.ts` is pure: the conversions (iD's `geoMetersToOffset` and `geoOffsetToMeters`, which do not depend on the
  latitude, as iD's do not), the nudge, the text, and the tile arithmetic. `shiftOf` is iD's pixel offset `offset * 2^z`,
  scaled to the tile size; `placements` says which of the up to four source tiles overlap an output tile and where.
- MapLibre has no translate for a raster layer, so a shifted background is drawn tile by tile:
  `offset-protocol.ts` registers a `maid-offset://` protocol once with the map library (`useControl`, as PMTiles does),
  fetches the overlapping tiles through the editor's fetch, draws them on a canvas and returns the canvas. With no offset
  the plain tile URLs are used. Only the background is shifted; overlays are not, as in iD.
- The offset is live state in the URL and is not stored. As in iD, it belongs to the background: for this visit the
  shift of the background being left is kept, and the one of the background chosen comes back (`chooseBackground` in
  `shown.ts`, `offsets` in the store). A link or the start order sets the URL's value and does not swap it.
- A server without CORS cannot be drawn on a canvas. Its tiles fail, the background is marked, and its layer is drawn
  unshifted from then on, with "This imagery cannot be shifted" in the panel.
- Each tile of a shifted layer costs up to four fetches and a canvas draw. A nudge changes the tile URLs, so every
  visible tile is requested again. Not measured yet.

## OpenAerialMap

The single images of [OpenAerialMap](https://openaerialmap.org/) (drones, planes, 360° orthos) are overlays: drawn
above the chosen background, which gives the context around them, since they cover small areas (Tobias, 2026-10-25).
The panel lists them in their own section "OpenAerialMap" before the brightness. They come live from HOT's STAC API
through the layer index's `/oam` entry (`oam.ts` is the only file that calls it), so an image uploaded today is listed
today. ELI's single "OpenAerialMap Mosaic, by Kontur.io" layer stays in the ELI list.

- From zoom 12 on (`OAM_MIN_ZOOM`), the panel asks for the 50 newest images in the rounded view (`listingView`), one
  request per new view, kept for five minutes. Below zoom 12 it says to zoom in. Nothing is asked while the panel is
  closed.
- A row is a checkbox with the title and the capture date; turned on, it shows the provider, the platform, the
  resolution (`gsd`) and the area, and the links (`oam-rows.ts`): "Attribution" is the image's page in HOT's STAC
  Browser, "License" its licence. No thumbnail (Tobias, 2026-10-25). Search matches the title, the provider and the
  date. Several images can be on at once.
- The value is `oam:<item id>` in `overlays`. The start order keeps it (`showable` in `start.ts`) and it is never
  turned on automatically. A link draws the image after one request for its item; an image that is on stays listed
  when it is out of view. An older link with `bg=oam:<item id>` still draws the image as the background.
- Tiles come from HOT's TiTiler, bounded to the image, with MapLibre overzooming past the image's own resolution.
  `imagery_used` is `OpenAerialMap (<title>)`.
- The requests go through the editor's fetch (service `data`), so its gate refuses them under automation.

## Data

The index's data is bundled in the package and loaded in chunks from the app's own build. Nothing is
fetched from OSM or from the index at run time, except the OpenAerialMap list and items (above). The tiles of a chosen layer come from that layer's
own server. In an automated browser the panel loads nothing.
