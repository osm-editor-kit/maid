# Draft for the street-imagery packages: fetching

Date: 2026-10-13. A draft for Tobias, written while Maid's photo module was moved to careful fetching ([fetching-audit.md](../research/fetching-audit.md)). Nothing was sent anywhere. Found by reading the installed packages `@osm-editor-kit/street-imagery` and `@osm-editor-kit/street-imagery-react`; nothing was measured against a live service.

What an editor that hosts the packages cannot do today, and what would let it:

1. **A `fetch` option.** The packages call the global `fetch` in about 14 places (tile reads through one helper, image metadata, sequences) and none takes a replacement. An editor that wants one place for time limits, a limit of requests in flight, a pause on "too many requests" and a block in automated runs has no way in. Wanted: `fetch` in the config or per adapter, used at every site.
2. **Query options.** The React hooks key their queries by the raw bounding box and zoom, so every map move is a new query. Wanted: keys per tile, or at least `staleTime` and a `queryClient` as options. Maid works around it by snapping the box to the z15 tile grid before it reaches the hooks and by setting query defaults for the packages' key prefixes, which breaks silently if a prefix is renamed.
3. **One request per Mapillary tile.** The same `mly1_public` tile is fetched once for the photo layer and once for the sequence layer; sign and point tiles add two more paths. Mapillary allows 50,000 tile requests a day for a whole access token. Wanted: one fetch per tile, split into layers after decoding.
4. **Small.** `tilesForBbox` includes the east and south tile when the box ends exactly on a tile line. The tile cache holds 60 entries or 800,000 items with no option.

Not traced: the requests the viewers make themselves (mapillary-js, the Panoramax web viewer).
