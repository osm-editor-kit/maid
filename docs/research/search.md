# Search (coordinates, OSM ids, loaded features, places)

Built 2026-10-13 by a subagent brief; not yet checked in a browser by a person. The top bar has a magnifier button with a flyout (`packages/shell/src/components/SearchButton.tsx`). Ctrl+F or Cmd+F opens it and focuses the input (`useShortcuts.ts`; the browser's find stays off). Escape closes it. Cmd+K is left for a later action bar. The map's "Zoom in to load data" hint has a "Search a place" button that opens the same flyout.

## What one search text gives

Groups, in this order:

1. **Position** (`search/parse.ts`, no request). Pairs of decimals in both orders when both are in range (`52.5, 13.4` gives two rows, like iD), `13.4/52.5`, `17/52.5/13.4` (OSM zoom first), degrees-minutes-seconds with hemisphere letters (`52°30'12"N 13°24'18"E`), `lat=..&lon=..`, and links with `map=zoom/lat/lon` (OSM and iD links, Maid's own URL). OSM zoom is one more than MapLibre's zoom, so a jump subtracts one (`mapZoomOf`), as the URL does (`url/params.ts`).
2. **OSM object** (no request). `n123`, `w45`, `r6`, `node 123`, `way/45`, `Relation:6`, and `openstreetmap.org/way/123` style links. Found in the loaded data: select and zoom to it. Not loaded: a row says so and nothing is fetched.
3. **In the loaded data** (`search/loaded.ts`, no request). Features whose name contains the text, or whose ref does when only the ref matches. The text needs at least two letters. The features nearest the centre of the view come first, at most 20. Each row shows its preset name.
4. **Places** (`search/places.ts`, Nominatim). Asked only when the person presses Enter with no row highlighted, or clicks "Search places" (never while typing). One request per text and language, answers kept in memory for the session, failures not kept. Sent through `editor.fetch`, so the gate, the time limit and the automation refusal apply. The answer is checked with Zod (`display_name`, `lat`, `lon`, `boundingbox`, `type`, `category`). A place with a box fits the map to it; a point flies to it. Under automation (`isAutomated()`) the row is disabled with a hint and nothing is sent.

Enter takes the highlighted row. Without one it takes the first position, or else the first object. Without either it asks for places once, then takes the first loaded feature or place. Arrow keys move the highlight.

The flyout opens by itself once per page load, when the URL has no `map=` and no last position is stored (`search/flyout.ts`). Never under automation.

## Decisions

- Places go through `editor.fetch` with the default service. The service registry has no Nominatim entry, so the request uses the `data` gate (two at a time). Registering Nominatim as its own service would give it its own limit; not done.
- The loaded-data scan runs only for texts of two letters or more. It reads `engine.data.all()` and the engine's `centreOf`, `entity` and `fitTo`. `engine.ts` was not changed.
- The state of the flyout is a small store in `search/flyout.ts` (no store library in the shell package).

## What is left

- **TODO (not in code): fetching an object by id that is not loaded.** It would call the OSM API for the object (`/api/0.6/{type}/{id}.json` on the configured host, through `editor.fetch`, as the editor's live modes do). It is not in this round: the row says "not loaded" and offers nothing. Under automation it must stay off (AGENTS.md, rule 1).
- Decimal commas (`52,5 13,4`) are not read.
- The auto-open ignores the editor's own configured camera (`config.camera`) and a restore prompt for unsaved edits. Both are open points.

## For a person to try in the browser

- Ctrl+F (Cmd+F on a Mac) opens the flyout and focuses the input, also when it is already open. The browser's find does not open.
- A fresh start with no `map=` in the URL opens the flyout once. Reloading after a move does not.
- Escape closes the flyout. Some browsers first clear the text of a search field on Escape (not checked).
- Check the German texts (Du form) and the French and Spanish ones.
- Places: type a name, press Enter once, and confirm one request in the network tab. Pressing Enter again uses memory.
