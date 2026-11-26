# 0016: Task progress only in the browser

Date: 2026-11-26. Decided by Tobias. Replaces the part of [ADR 0013](0013-task-lists-in-user-preferences.md) that kept the progress in the OSM user preferences; the file format, the options and the rest of 0013 stay.

## Context

ADR 0013 kept the status of each task in the OSM user preferences of the logged-in account, so the same list showed the same progress on any device. That brought costs:
- the login had to ask for `read_prefs` and `write_prefs`;
- logins from before that change failed with a 403 on every save;
- the code split values into 255-character chunks, reconciled versions and handled conflicts;
- the mock API had to imitate the preferences.

Tobias works through the lists on one device, so having the same progress everywhere did not pay for this.

## Decision

- **The progress is kept only in this browser**: localStorage (`maid:tasks:<listKey>`, the statuses as before) and the file in IndexedDB, as `packages/module-tasks/src/local.ts` already did as its copy. Progress saved by earlier versions stays readable.
- **No requests to `/api/0.6/user/preferences`.** The login no longer asks for `write_prefs`; it keeps `read_prefs`, which `GET /api/0.6/user/details` (the name after the login) needs, with `write_api` and `write_notes`.
- `packages/osm-prefs`, the sync, the account endpoint for modules (`usePrefsEndpoint`), the conflict and cleanup dialogs, and the mock's preferences are removed. The status codec and the list key moved into module-tasks.

## Building it again

The last commit with the whole sync is **9da9360** (2026-11-26). To get it back:

```bash
git show 9da9360 --stat
git checkout 9da9360 -- packages/osm-prefs packages/module-tasks/src/sync.ts packages/module-tasks/src/sync.test.ts packages/module-tasks/src/cleanup.ts
```

The sync also touched `TasksController.tsx`, `store.ts`, `TasksView.tsx`, `packages/ui/src/account.ts`, `packages/shell/src/account.ts`, `packages/shell/src/mount.tsx`, `packages/shell/src/auth.ts`, `tools/mock-osm-api/server.ts` and `tools/bench/tasks-check.ts`. ADR 0013 and `packages/osm-prefs/README.md` at that commit describe the layout of the keys, the save order and the limits.

### Gotchas we found

- **Never `PUT /api/0.6/user/preferences` without a key.** It replaces every preference of the user, including those of iD, StreetComplete and other apps. Set and delete single keys only.
- **No dots in keys.** The OSM website's route for a single preference answers 404 for a key with a dot (found 2026-11-26). Until then no save to the real server had gone through.
- **Keys and values are 1 to 255 characters**, and an empty value is invalid. Longer data has to be cut into chunks (keep them ASCII, so characters are bytes). Rails PR #6399 (values up to 10 000 characters) was open.
- **The scopes**:
  - `write_prefs` must be ticked on the OAuth app of each server, or the login fails;
  - a token from before the scope was added gets a 403 on every save;
  - the person has to log out and in again, and the UI must say so.
- **Saving has to survive a crash**: write the inactive one of two slots first and the meta key last (the commit point), then remove the old slot.
- **Two devices** can save at the same time. Without a hash of the whole value in the meta, a read can mix chunks of both. Telling "older" from "changed elsewhere" needed a revision and a random generation per list, plus a conflict dialog.
- **The preferences only grow.** Lists unchanged for 30 days were offered for deletion; nothing may be deleted without a click.
- **List keys are 32-bit hashes** (FNV-1a of the list id), so two lists could collide. This was never checked.
- **Not measured**: how many writes in a row the servers accept, and whether there is a cap on the number of keys per user.
- **Automation must not reach OSM** (AGENTS.md, core rule 1), so the mock had to keep preferences in memory, with OSM's limits.
