# @osm-editor-kit/maid-module-tasks

Private task lists in Maid: the person loads a task file (format: [packages/tasks/FORMAT.md](../tasks/FORMAT.md)), works
through it in the dock, where the list and the current task with its options stand side by side, and the progress stays in this browser
([ADR 0016](../../docs/adr/0016-task-progress-only-in-the-browser.md)).

`tasks()` returns the module. Setup sends no request.

## What it registers

| Point | Id | What |
| --- | --- | --- |
| `dock.view` | `tasks` | The tab "Task lists (n)", always there (the count is of the lists this browser keeps). Without an open list, or with "<" beside its title, the overview: "Load task list…" (a new list, or a new version of a kept one), the kept lists to open or delete. With a list, two columns: the list (a compact head that stays while the rows scroll: title, progress, the counts as a filter with "Show all", a "⋯" menu with the ignored export and delete rows, 200 then "Show more", the current one kept in view) and the current task (a heading with "Select its feature" and "Next open task" that stays; description, links, options with tag diff and "Apply" on the task's feature even while something else is selected, one undo step; status buttons). Without a current task: "Next open task" |
| `inspector.section` | `tasks` | At the top, for a feature named by a task: a hint with each task's title and status and "Open in the task list", which makes it the current task in the dock (Tobias, 2026-11-26) |
| `map.content` | `tasks` | Task geometries by status colour, the current task with a halo |
| `map.content` | `tasks-controller` | Opens the last list, fetches `tasks=<url>` (with `editor.fetch`), follows undo and redo |

URL parameter `tasks=<address>`: `https:` (or `http:` on this computer).

## Files

| File | What |
| --- | --- |
| `src/store.ts` | The zustand store; every transition is a pure `with...` function |
| `src/list.ts` | Counts, filter, next open task, ref index (`way/1` to task indexes), bounds, map colours |
| `src/local.ts` | Local mirror (`moduleStorage`, key `maid:tasks:<listKey>`) and the IndexedDB file cache (dexie), whose files the dock's overview lists to open again (`ListOverview.tsx`, `overview.ts`) |
| `src/open.ts` | Opening a file; a new version of a list (other tasks or order) takes the statuses of the version before by `task_id` (`carryOver`). |
| `src/open.ts` | Parse, find saved progress, fill the store, remember the file |
| `Markdown` (in `packages/ui`) | The safe Markdown renderer (no raw HTML, https links only), shared with MapRoulette |
| `src/apply.ts` | Applying an option as one undo step |
| `src/TasksController.tsx`, `TasksView.tsx`, `TaskSection.tsx`, `TaskContent.tsx`, `TasksOnMap.tsx`, `LoadTasksItem.tsx` | The React parts |

Under automation (`isAutomated()`) nothing is stored or cached.

Tests: `bun test packages/module-tasks`. The markdown and component tests render with `react-dom/server` through the
copy in `packages/ui/node_modules` until `react-dom` is a devDependency here.
