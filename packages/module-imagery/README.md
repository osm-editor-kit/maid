# @osm-editor-kit/maid-module-imagery

Imagery under the OSM data: a background (an ELI layer or a custom tile URL template), overlays and a
brightness, chosen in the top bar's "Background" panel. Built on
`@osm-editor-kit/maplibre-editor-layer-index` (0.2.0).

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
- The stored choice is still a layer id, the id of the date. Links (`background=<id>`) and the
  `imagery.used` name (the date's own name) are unchanged.
- Search matches the series name, the category and the date labels.

Overlays are still listed one layer per row. Tests: `series.test.ts` (hand-made layers with `group`,
run through the package's `groupLayers`).

## URL and start

The URL is the live state. The module declares two parameters in iD's names (core's `api.urlParam`):
`background` (an ELI id, `none`, or `custom:<template>`; iD's `layer` is read too) and `overlays` (a comma list in
the order chosen, `none` for an empty list). Both are written with `history: replace` and kept when they equal the
default.

- The start order (`start.ts`, a pure function with table tests) is iD's: the URL, the best layer that covers more
  than half of the view (`coverage.ts`, iD's box rule), the stored choice when it is valid for the view, the fork's
  default (`imagery({ default })`), the first valid layer, else none. It runs once, when the map has its first view
  (`shown.ts`), and only then is the URL written with what is shown. Before that the pending value stands.
- A choice writes the URL and remembers the value for the next visit (`background` and `overlayIds` in
  `maid:imagery`, version 3). A link alone writes nothing to storage.
- A custom template in a link is shown as it is. The panel shows a hint when a part of the template looks like a key
  (`keyLikeNames`), because a shared link includes it.
- Under automation the start does not run and nothing is written; a local template from a link is still drawn.

## Data

The index's data is bundled in the package and loaded in chunks from the app's own build. Nothing is
fetched from OSM or from the index at run time. The tiles of a chosen layer come from that layer's
own server. In an automated browser the panel loads nothing.
