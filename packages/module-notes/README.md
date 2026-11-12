# Notes module (`@osm-editor-kit/maid-module-notes`)

The OSM notes of the editor's API as markers on the map, with a panel to switch them on and list them, and a dock view with the chosen note and its comments. Read-only: the module sends no note to the API.

`notes({ apiUrl })` is the module. `apiUrl` is the API root the editor uses, so the notes come from the same server as the data.

## What a person sees / can do

- "Notes" in the top bar: a "Show notes" switch, an "Also closed ones" switch, and the list of the notes in view (a summary line and Open or Closed for each).
- Markers on the map from zoom 12 (OSM zoom, as in iD). Below that nothing is requested, and the panel says "Zoom in to see the notes".
- A click on a marker, or a row in the list, chooses the note. The dock's "Notes" view shows it: its status, the dates, its position and its comments, as plain text.
- When the view has more notes than the API returns in one request (100), the list is cut and a notice says so. Zoom in to see all.
- A note in the URL (`id=note/<id>`) is chosen by the shell, and turns the notes on in the URL (not in the stored choice).
- URL parameter `notes`: any value turns the notes on, as iD reads it. The stored choice (`maid:notes`) is the default for the next visit.
- Off by default: nothing is loaded until a person switches the notes on. Under automation no request is made.
- Writing notes is not in the module. The dock says so ("Writing notes comes with the login.").

## Using it in an editor's config

```ts
import { notes } from '@osm-editor-kit/maid-module-notes'

// in the modules list, in every app:
notes({ apiUrl: config.apiUrl }),
```

All five apps (`maid`, `maid-bicycle`, `maid-parking`, `maid-indoor`, `maid-lanes`) call it this way. Tailwind needs `@source '../../module-notes/src';` in `packages/shell/src/styles.css` (listed there).

The module declares the extension point `note.selection` (`NoteSelection`, `src/extension-points.ts`): the chosen note, read by the shell's URL `id`. The app's map click handler must return early on the marker layers: `NOTES_LAYER_IDS` (for example with `map.queryRenderedFeatures`), or the OSM feature under the marker is selected too.

## Parts

| File | What it does |
| --- | --- |
| `src/notes.tsx` | `notes()`: the markers on `map.content`, the panel and the dock view, the URL parameter, the zoom gate (`NOTES_MIN_ZOOM`) |
| `src/query.ts` | One TanStack query per grid cell of the view (`wantedCells`). Retries as the editor's rule; none under automation, and paused on a rate limit |
| `src/model.ts` | The request URL, `parseNotes`, the grid cells, the zoom gate and the limit (`NOTES_LIMIT`). Pure |
| `src/store.ts` | The settings (`maid:notes`: on, closed ones) and the session (view, chosen note, notice). Zustand |
| `src/shown.ts`, `src/url.ts` | The `notes` switch and its URL parameter (`useUrlSetting`) |
| `src/note-selection.ts`, `src/extension-points.ts` | `noteSelectionFor`: the chosen note as an extension point for the shell |
| `src/details.tsx` | The dock view: the chosen note with its comments |

## Tests

`bun test packages/module-notes`: the grid cells of a box, the cell queries and what is wanted (off, no view, below the zoom gate), the zoom gate in OSM and MapLibre zoom, the cut notice, the store's stored values, the `notes` parameter, and choosing a note through the editor's fetch.

## More

- [Fetching audit](../../docs/research/fetching-audit.md): section 4c, notes (R3), and the zoom and limit as iD has them.
- [URL state audit](../../docs/research/url-state-audit.md): the `notes` parameter and the stored switch (S22 to S24, S-9).
- [Step D3 in the build-out steps](../../docs/build-out/steps.md): what was built and the test for Tobias.

## Open

- Notes from zoom 14, with a toast when the limit cuts the list (`docs/build-out/steps.md`, "Editing and data").
- Writing notes (needs the login).
- The module's texts are English only (`docs/build-out/steps.md`, "Texts not through Paraglide").
- The shell still imports `NOTES_LAYER_IDS` and the `NoteSelection` type directly, until an extension point covers the click (`docs/build-out/steps.md`, "The shell imports three modules").
