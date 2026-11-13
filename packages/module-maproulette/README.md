# @osm-editor-kit/maid-module-maproulette

MapRoulette challenges in Maid: open a challenge by number or link, or pick one with open tasks near the map view. The
module shows the tasks on the map, and each task in the inspector with its instructions and tag fix. A status goes to
MapRoulette either right away or with the next upload, with a link to the changeset. The calls to MapRoulette, the
earmarks and the tag fix live in the headless package [packages/maproulette](../maproulette/README.md). This module is
the store, the controller and the React parts. It follows tordans/iD PR #4.

`maproulette({ apiUrl, siteUrl? })` returns the module. Setup sends no request. The app `maid-maproulette` uses the mock
(`MOCK_MAPROULETTE_API`, `tools/mock-osm-api/maproulette.ts`) with mock data and `MAPROULETTE_API` otherwise.

## What it registers

| Point | Id | What |
| --- | --- | --- |
| `topbar.panel` | `maproulette` | The MapRoulette button with a badge (the challenge's name, the number of tasks waiting for the upload). The flyout shows the open challenge (description, "Next task nearby"), or a number or link to open and the challenges in view. Below them is the login (a pasted token) |
| `dock.view` | `maproulette` | Tone `maproulette`: the result after the upload, the current task, the tasks in view |
| `inspector.section` | `maproulette` | At the top, for a feature named by a task: the task card with its instructions (Markdown, mustache, shortcodes), the tag fix diff with Accept (one undo step) and Reject, the timing, the comment and the status buttons |
| `map.content` | `maproulette` | Task lines under the OSM data, pins (a click opens the task, `clickLayers`), a halo on the current task. It also keeps the URL in step and reads the tasks of the view after each move |
| `changeset.tags` | `maproulette` | `closed:maproulette`, the challenge's comment with `#maproulette`, and the list of waiting tasks in the save dialog (`component`) |
| hook `changeset.uploaded` | | Sends the included earmarks, with a link to the changeset (`UploadInfo`) |

URL parameter `maproulette=<challenge>` or `maproulette=<challenge>/<task>`.

Login: MapRoulette is changing how editors log in (maproulette-backend #1288, #1289). Until then, a token pasted in the
panel is sent as `Authorization: Bearer …` (`MapRouletteAuth` in the package, easy to swap). Reading needs no login.

## Files

| File | What |
| --- | --- |
| `src/store.ts` | The zustand store, `tasksShown`, `shownStatus` |
| `src/controller.ts` | Loading the view, challenges and tasks; finishing, earmarks, Undo, after the upload; `editorFetch` |
| `src/shared.ts` | What the parts share; `goToTask`, links to MapRoulette |
| `src/url.ts` | The URL parameter and the input "number or link" |
| `src/Panel.tsx`, `TaskCard.tsx`, `TaskSection.tsx`, `DockView.tsx`, `SaveBlock.tsx`, `MapRouletteOnMap.tsx` | The React parts |

Storage (`moduleStorage`, keys `maid-maproulette:token|timing|earmarks`) keeps nothing under automation.

Tests: `bun test packages/module-maproulette`. Browser check: `bun run check-maproulette --app maproulette` (the mock's
made-up challenges, `bun run fixtures-maproulette`).
