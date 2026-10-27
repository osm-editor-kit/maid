# 0012: Private task lists, their progress in the OSM user preferences

Date: 2026-10-27. Planned with Tobias in the project thread "Plan private task lists in MAID" (the Claude Doc
"Private Aufgabenlisten in MAID: Recherche und Plan").

## Context

Tobias wants to work through a list of features to check, as with MapRoulette, but alone and inside the editor. A task
says what to check (Markdown, links, Mapillary images) and may offer several groups of tags; the editor shows the diff
of each before it is applied. Done, ignored and skipped tasks must be remembered across browsers.

## Decision

- **The list is a file**: GeoJSON with a `maid_tasks` member, specified in `packages/tasks/FORMAT.md` (written to be
  given to an LLM that makes such files) and checked by `bun run tasks-check <file>`. It is loaded from a file or with
  `?tasks=<url>`.
- **The progress is in the OSM user preferences** of the account the person is logged in to (Tobias, 2026-10-27; not
  the key-value-db service, not the URL, not only the browser). The browser keeps a copy.
- **Teams use MapRoulette** (Tobias, 2026-10-27). A MapRoulette integration is not part of this work.
- **Layout of the preferences** (`packages/osm-prefs`): a meta key `maid.tasks.<listKey>` (JSON: slot, chunk count,
  task count, revision, last change, order hash) and the statuses as a 2-bit field per task, deflated when shorter,
  base64url, split into values of 255 characters under `maid.tasks.<listKey>.<a|b>.<i>`. A save writes the inactive
  slot first and the meta last, so a failed save leaves the previous state readable.
- **Never `PUT /api/0.6/user/preferences`**: it replaces every preference of the user, also those of other apps. Only
  single keys are set and deleted.
- **Cleanup**: lists unchanged for 30 days are offered for deletion in a dialog; nothing is deleted without a click.
- **The mock keeps preferences in memory** (`tools/mock-osm-api`), with OSM's limits, so the module is tested without
  a server. The map data stays read-only. On the mock's data the module uses the mock's preferences without a login.
- **Modules reach the account through `useOsmAccount` / `usePrefsEndpoint`** of maid-ui (`packages/ui/src/account.ts`),
  provided by the shell. The login asks for `write_prefs` from now on.

## Limits (measured or read)

| Limit | Value | Source |
| --- | --- | --- |
| Key and value | 1..255 characters | Rails model `UserPreference` |
| Number of keys, total size | none found | Rails model and controller, not fully checked |
| 2000 tasks | 2 to 4 keys (all open: 2; random: 4) | `reports/osm-prefs-size.json` |
| 20 000 tasks | 2 to 28 keys | same |

## Open

- The write rate the servers accept: a person checks it on the development server (`?api=dev`). Logins from before
  `write_prefs` do not matter while Maid is alpha (Tobias, 2026-10-28).
- Whether rails PR #6399 (values up to 10 000 characters) is merged; the chunking works either way.
