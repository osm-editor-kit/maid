# @osm-editor-kit/maid-module-tasks

Private task lists in Maid: the person loads a task file (format: [packages/tasks/FORMAT.md](../tasks/FORMAT.md)), works
through it in the dock, sees each task and its options in the inspector, and the progress stays in this browser and in
their OSM preferences ([packages/osm-prefs](../osm-prefs/README.md)).

`tasks()` returns the module. Setup sends no request.

## What it registers

| Point | Id | What |
| --- | --- | --- |
| `account.item` | `tasks` | "Load task list…": a file picker |
| `dock.view` | `tasks` | The tab "Tasks": head (title, progress, counts, filter, sync), rows (200, then "Show more"), "Next open task", the current task when the inspector does not show it |
| `inspector.section` | `tasks` | At the top, for a feature named by a task: description, links, Mapillary links, options with tag diff and "Apply" (one undo step), status buttons |
| `map.content` | `tasks` | Task geometries by status colour, the current task with a halo |
| `map.content` | `tasks-controller` | Opens the last list, fetches `tasks=<url>` (with `editor.fetch`), syncs with the account, shows the conflict and cleanup dialogs |

URL parameter `tasks=<address>`: `https:` (or `http:` on this computer).

## Files

| File | What |
| --- | --- |
| `src/store.ts` | The zustand store; every transition is a pure `with...` function |
| `src/list.ts` | Counts, filter, next open task, ref index (`way/1` to task indexes), bounds, map colours |
| `src/local.ts` | Local mirror (`moduleStorage`, key `maid:tasks:<listKey>`) and the IndexedDB file cache (dexie) |
| `src/open.ts` | Parse, find saved progress, fill the store, remember the file |
| `src/sync.ts` | Reconcile, debounced push (2 s), conflict, 401/403, order hash check |
| `src/cleanup.ts` | Lists to offer for deletion (30 days, never the open list) |
| `src/markdown.tsx` | The safe Markdown renderer (no raw HTML, https links only) |
| `src/apply.ts` | Applying an option as one undo step |
| `src/TasksController.tsx`, `TasksView.tsx`, `TaskSection.tsx`, `TaskContent.tsx`, `TasksOnMap.tsx`, `LoadTasksItem.tsx` | The React parts |

Under automation (`isAutomated()`) nothing is stored or cached; the account is the mock's.

Tests: `bun test packages/module-tasks`. The markdown and component tests render with `react-dom/server` through the
copy in `packages/ui/node_modules` until `react-dom` is a devDependency here.
