# Decisions

One file per decision: what we decided, why, and what we measured. Number them in order. A decision that is replaced stays; the new one links back.

| # | Decision |
| --- | --- |
| [0001](0001-style-from-id-css.md) | The look is generated from iD's stylesheets and presets |
| [0002](0002-geojson-sources-with-serial-diff-updates.md) | GeoJSON sources, filled with diff updates, one at a time |
| [0003](0003-edit-source-for-changing-features.md) | Features that are being changed live in a small edit source |
| [0004](0004-points-as-dots-plus-pins-that-fit.md) | Points are dots, with pins where they fit |
| [0005](0005-own-store-for-the-proof-of-concept.md) | The proof of concept uses its own small data store |
| [0006](0006-wheel-zoom-finish-delay.md) | Shorten MapLibre's wait after a wheel zoom (bun patch) |
| [0007](0007-workers-and-batched-updates.md) | Four MapLibre workers, and tiles that arrive together go in as one update |
| [0008](0008-live-tier-for-new-and-changed-data.md) | New and changed data go to a small live tier, merged when idle |
| [0012](0012-texts-for-the-device.md) | Texts for the device: message variants by input and system, checked by a test |
| [0013](0013-task-lists-in-user-preferences.md) | Private task lists: a GeoJSON file, the progress in the OSM user preferences (progress part replaced by 0016) |
| [0014](0014-quiet-map-below-zoom-18.md) | Below zoom 18: no nodes on shapes, small hint dots, junctions as iD |
| [0015](0015-oneway-minus-one-hook-arrows.md) | oneway=-1 gets a hook arrow (hook replaced by 0017); the bicycle lines get their riding direction from TILDA |
| [0016](0016-task-progress-only-in-the-browser.md) | Task progress only in the browser; the OSM preferences sync removed (last in 9da9360) |
| [0017](0017-line-direction-glyphs.md) | One glyph per anchor: chevrons for the riding direction, a triangle for the drawing direction (replaces 0015's hook) |
