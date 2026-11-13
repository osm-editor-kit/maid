# @osm-editor-kit/maid-maproulette

The MapRoulette logic of Maid as pure TypeScript: no UI, no React, no DOM, no globals (no `window`, no
`sessionStorage`). Every request goes through a `fetch` function that the caller injects, and the way a request
signs in (`MapRouletteAuth`) is injected too, so the package can be tested with a fake `fetch` and never talks to
maproulette.org by itself.

Ported from the MapRoulette code of an iD fork (ISC, like iD). What is in it:

| Module           | Holds                                                                                                     |
| ---------------- | --------------------------------------------------------------------------------------------------------- |
| `schema.ts`      | Zod schemas and types of the API: challenge, task, tasks in a box, comments. Tolerant of extra fields.    |
| `status.ts`      | Status numbers and names, open and resolved, the 24 hour rule, the statuses a mapper can set.             |
| `client.ts`      | `createMapRouletteClient`, `MapRouletteError`, and the auth helpers `noAuth`, `bearerAuth`, `apiKeyAuth`. |
| `mustache.ts`    | `{{property}}` replacement for check-in comments, sources and instructions.                               |
| `shortcodes.ts`  | `[select]`, `[checkbox]`, `[copyable]` and the deprecated `{{{...}}}` as a token list a UI can render.    |
| `osm-ids.ts`     | OSM entity ids in task data (`w123`, `way/123`, `@id`) and OSM references in text as data.                |
| `pin-loc.ts`     | Snap a task point onto its line geometry.                                                                 |
| `cooperative.ts` | The tag fix of a cooperative challenge as a list of options with per-entity set/unset operations.         |
| `next-task.ts`   | The pool of open tasks and the nearest, priority and random pick.                                         |
| `earmarks.ts`    | The queue of tasks that are resolved with the save; serialize, parse, resolve after the upload.           |
| `changeset.ts`   | Changeset comment, source, `#maproulette` hashtag and `closed:maproulette*` tags.                         |
| `nearby.ts`      | Challenges near you, from the tasks in view.                                                              |
| `completion.ts`  | The finish buttons, comment limit, update timing and error kinds.                                         |

Not confirmed against the live API: the shape of comments (`commentSchema`), and the auth model (MapRoulette
dropped API keys; `apiKeyAuth` sends the old `apiKey` header, `bearerAuth` an `Authorization: Bearer` header).
