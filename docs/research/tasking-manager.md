# HOT Tasking Manager in Maid Buildings

Asked by Tobias on 2026-11-13: the HOT Tasking Manager (TM, https://github.com/hotosm/tasking-manager,
https://tasks.hotosm.org) in Maid, with the same mechanics as the MapRoulette edition but on its own. A top bar button
lists projects and links to the TM; a deep link with a project and task opens it; the footer (dock) lists the tasks;
the map shows the task area; the instructions are shown; presets and styles follow the project.

Status: the deep link is built (2026-11-13, `packages/module-tasking-manager`, steps.md "Tasking Manager in Maid Buildings"); the rest of the plan waits.

## Decisions (assumptions sent to Tobias on 2026-11-13, not answered yet)

1. A module `packages/module-tasking-manager`, switched on in `apps/maid-buildings`, not a new edition: most TM projects
   are `mappingTypes: BUILDINGS`. The module has no building code, so another edition can add it.
2. tasks.hotosm.org only; the API base and the site base in the module's options, so another TM server works.
3. Read only. Maid does not lock, unlock, mark mapped or validate: those need a TM session token from the TM's own OSM
   login. Maid links to the TM for them.
4. The project's imagery (`tms[..]:https://…`) is offered as the background.
5. The project's `changesetComment` (with its `#hotosm-project-…` hashtags) is filled into the save dialog.
6. Core rule 1: automation never calls the TM. The mock API serves a made-up TM project on the `small` scene.

## The API (read from the `develop` branch; live shapes not confirmed, see "Open")

Base: `https://tasking-manager-production-api.hotosm.org/api/v2/` (the frontend builds it from `TM_APP_API_URL`). Every
path ends in `/`. Send `Accept-Language` (the project texts come in that locale, falling back to the project's default).
CORS in the backend: `EXTRA_CORS_ORIGINS`, `*` when unset; production's value is not known.

| Request | Login | Use in Maid |
| --- | --- | --- |
| `GET projects/?mappingTypes=BUILDINGS&page=1&omitMapResults=true&textSearch=…` | no | the project list of the top bar button. No bbox filter without login. No match is a 404 `PROJECTS_NOT_FOUND`, not an empty list. |
| `GET projects/{id}/` | no (403 for private and draft) | name, description, instructions, `perTaskInstructions`, `mappingTypes`, `changesetComment`, `imagery`, `idPresets`, `extraIdParams`, `areaOfInterest`, `aoiBBOX`, `priorityAreas`, `difficulty`, `percentMapped`, `percentValidated` |
| `GET projects/{id}/tasks/` | no | a FeatureCollection of MultiPolygons with `taskId, taskX, taskY, taskZoom, taskStatus, lockedBy, mappedBy, validatedBy` |
| `GET projects/{id}/tasks/{taskId}/` | no | one task: status, history, `perTaskInstructions` with `{x}`, `{y}`, `{z}` filled in by the server |
| `POST projects/{id}/tasks/actions/lock-for-mapping/{taskId}/` and the rest | `Authorization: Token …` | not used |

Task statuses: READY (available), LOCKED_FOR_MAPPING, MAPPED (ready for validation), LOCKED_FOR_VALIDATION, VALIDATED
(finished), INVALIDATED (more mapping needed), BADIMAGERY (unavailable), SPLIT.

TM site links: `https://tasks.hotosm.org/projects/{id}` (overview), `/projects/{id}/tasks` (the task map), `/explore`.
There is no per-task link in the TM; Maid links to the project's task map and names the task number.

How the TM opens iD (`frontend/src/utils/openEditor.js`, BSD-2): `#map=zoom/lat/lon` of the selected tasks,
`extraIdParams` appended, `comment=changesetComment`, `background=custom:<tms url without the tms[..]: prefix, {zoom} as
{z}>` or a named layer id, `gpx=` the GPX of the selected tasks, `presets=` the `idPresets` joined by commas. Maid does
the same on its own state: the comment into the save dialog, the imagery as background, the `idPresets` as suggested
favourites, `extraIdParams` read for `disable_features` (as filters) and `background`.

## Plan

First (Tobias, 2026-11-13): only the deep link that opens one task, `?tm=<project>/<task>`: the task area on the map,
the map on it, the instructions, the changeset comment. The project list, the dock tab, presets and styles wait.

The link: `?tm=<project>` or `?tm=<project>/<task>` (the same shape as `tasks=`; `tm-api=` for another server, mock
under automation).

1. **Project list (top bar button "Tasking Manager").** Search with `mappingTypes=BUILDINGS` (switchable to all), text
   search, paging; each row the name, organisation, difficulty, percent mapped and validated, a link to the TM, and
   "Open in Maid". Reuses the MapRoulette button and list rows.
2. **Project open.** `projects/{id}/` and `projects/{id}/tasks/`; the map flies to `aoiBBOX`. On the map: the area of
   interest as a dashed outline, the task grid coloured by status as in the TM (ready white, mapped yellow, validated
   green, invalidated red, locked grey, bad imagery black), the selected task filled. The project's OSM data is loaded
   as usual.
3. **Dock tab "Tasks".** The rows of the tasks with number and status, filters by status, a click flies to the task and
   selects it. The TM's own order (task id). Reuse the private task lists' rows (`module-tasks` `TasksView`) where they
   fit.
4. **Instructions.** A panel (or the inspector's top section when nothing is selected) with the project's
   `instructions` and the selected task's `perTaskInstructions` (`{x}/{y}/{z}` filled in by Maid from `taskX/Y/Zoom`),
   Markdown through `module-tasks`' renderer. Buttons: "Lock and map in the Tasking Manager" (link), "Next task"
   (the next READY or INVALIDATED one).
5. **Presets and style.** `idPresets` as the suggested favourites while the project is open (mapped to Maid's preset
   ids, unknown ids left out); `mappingTypes` choose the lens: BUILDINGS the buildings lens, others the Maid standard;
   `imagery` as the background with a toast.
6. **Save.** `changesetComment` into the comment of the save dialog, unless the person wrote one; the comment carries
   the TM hashtag so the TM's stats count it.
7. **Mock and checks.** A made-up project on the `small` scene in `tools/mock-osm-api` (`/tm/api/v2/...`), built by a
   script as `fixtures-golf` (not OSM data, no person needed); unit tests for the URL, the status colours, the
   instructions; a browser check `check-tasking-manager` (open by link, list, select a task, next task, save comment).

## Open

- Live CORS of the production API: if it does not allow other origins, the list needs a proxy, and Maid on GitHub
  Pages cannot read it. To be tried by Tobias in the browser (agents send no request, core rule 1).
- The exact named imagery ids (Bing, EsriWorldImagery, Maxar-Standard …) and whether Maid's imagery list has them.
- Whether to lock tasks later: it needs the TM's login (its own OSM OAuth app and a session token), out of scope now.
