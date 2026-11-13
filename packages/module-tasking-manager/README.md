# @osm-editor-kit/maid-module-tasking-manager

HOT's Tasking Manager (https://tasks.hotosm.org) in Maid, read only. A link `tm=<project>/<task>` opens one task of a
mapping project: its area and the project's other tasks by status on the map, the task's and the project's instructions
in the dock, and the project's changeset comment (with its `#hotosm-project-…` hashtag) in the save form. Locking a task
and marking it as mapped stay in the Tasking Manager, because they need its own login; the dock links there.
Research and plan: [docs/research/tasking-manager.md](../../docs/research/tasking-manager.md).

`taskingManager({ apiUrl, siteUrl? })` returns the module. Setup sends no request. The app `maid-buildings` uses the
mock (`MOCK_TASKING_MANAGER_API`, `tools/mock-osm-api/tasking-manager.ts`, the made-up project 4242 of `bun run
fixtures-tasking-manager`) with mock data and `TASKING_MANAGER_API` otherwise.

## What it registers

| Point | Id | What |
| --- | --- | --- |
| `dock.view` | `tasking-manager` | The project's name and progress, the task with its status, "Show on map" and a link to the project's tasks in the TM (the TM has no link to one task), the task's instructions with `{x}`, `{y}`, `{z}` filled in, the project's instructions and description. Opens with the link |
| `map.content` | `tasking-manager` | The area of interest dashed in HOT red, the tasks under the OSM data in the colour of their status, the current task with a thick red outline and no fill. The squares take no clicks. It reads the link once, moves the map to the task when the project is read, and keeps the link in step |
| `changeset.tags` | `tasking-manager` | `comment`: the project's changeset comment |

## Files

- `api.ts`: the requests (`projects/{id}/` and `projects/{id}/tasks/` with `Accept-Language`), the parsing, the links.
- `url.ts`: the `tm` parameter (`4242`, `4242/22`, or a TM link with `/projects/4242`).
- `store.ts`, `shared.ts`, `module.tsx`, `TmOnMap.tsx`, `TmView.tsx`.

Check: `bun run check-tasking-manager --app buildings` (in `check-all --app buildings`).
