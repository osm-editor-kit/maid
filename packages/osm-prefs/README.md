# osm-prefs

Small per-user data kept in the OpenStreetMap user preferences (`/api/0.6/user/preferences`): here, the
status of each task in a private task list. The package is headless (no React, no Maid imports), so it can
later become its own npm package. Nothing in it sends a request on its own: the caller passes a transport.

## Parts

| File                   | What it does                                                                                   |
| ---------------------- | ---------------------------------------------------------------------------------------------- |
| `src/transport.ts`     | The three calls (list, set one key, remove one key): HTTP, and an in-memory one for tests      |
| `src/chunks.ts`        | `splitValue`: cuts a text into values of at most 255 characters (ASCII only)                   |
| `src/codec.ts`         | Task statuses as two bits each, base64url, plain (`b`) or deflated (`z`), whichever is shorter |
| `src/progress.ts`      | One list's progress in the preferences: crash-safe save, load, remove, listing, reconcile       |
| `src/measure.ts`       | `measure(count, pattern)`: what a save writes, measured with the same code                     |
| `scripts/size-report.ts` | Writes `reports/osm-prefs-size.json` (the table below comes from it)                         |

## Key layout

All keys start with the prefix (default `maid.tasks`). A list has an 8-character key, `listKeyOf(listId)`:
FNV-1a of the id, in base 36.

| Key                              | Value                                                         |
| -------------------------------- | ------------------------------------------------------------- |
| `maid.tasks.<listKey>`           | the meta: compact JSON, the commit point                      |
| `maid.tasks.<listKey>.<slot>.<i>` | chunk `i` of the text, in slot `a` or `b` (double buffer)     |

The meta is `{"v":1,"s":"a","n":3,"c":2000,"r":7,"u":1700000000,"h":"<8 chars>","g":"<8 chars>"}`: `v` format
version, `s` active slot, `n` chunk count, `c` task count, `r` revision (+1 per save), `u` time of the save (unix
seconds), `h` hash of the task ids in their order (`orderHashOf`), `g` generation (random when the list is first
saved, then kept). A list that was removed and saved again starts at `r` 1 with a new `g`, so `reconcile` sees it as
changed and not as older; it also tells another account's list from the one a browser agreed with.

Nothing outside the prefix is read for writing or deleted. Other apps' keys (for example `iD.*`) are never touched.

## Limits

| What                      | Limit                                                                 | Source                                      |
| ------------------------- | --------------------------------------------------------------------- | ------------------------------------------- |
| Preference key            | 1 to 255 characters                                                   | Rails `UserPreference` model                 |
| Preference value          | 1 to 255 characters; an empty value is invalid                        | Rails `UserPreference` model                 |
| Number of preferences     | no limit found                                                        | not verified against the live server         |
| Characters per chunk      | 255 (`splitValue` default)                                            | the value limit                              |
| Non-ASCII text in chunks  | refused (`RangeError`), so characters are bytes                       | the codec output is base64url                |
| Meta                      | at most 255 characters; about 66 to 68 characters with these fields   | `formatMeta` throws above 255                |

`validatePref(key, value)` checks both limits and throws `PrefsHttpError` with status 400, as the server does.
Lengths count characters (code points), as Rails does.

## Size for 2000 tasks (measured)

Source: `bun packages/osm-prefs/scripts/size-report.ts`, which runs a real save into the in-memory transport
(`reports/osm-prefs-size.json`). The 2000 tasks use 2 bits each: 500 bytes of statuses before encoding.

| Pattern             | Encoding | Chunk keys | Chunk characters | Keys of the list (meta included) | Characters, keys and values |
| ------------------- | -------- | ---------- | ---------------- | -------------------------------- | --------------------------- |
| all open            | `z`      | 1          | 21               | 2                                | 129                         |
| 10% done (random)   | `z`      | 2          | 263              | 3                                | 394                         |
| random statuses     | `b`      | 3          | 668              | 4                                | 822                         |

For 20 000 tasks: all open 1 chunk (148 characters in all); 10% done 9 chunks (2470); random 27 chunks (7393).
Random statuses do not deflate, so `b` is chosen; the deflated form wins for mostly-open lists.

## The warning: never write the whole collection

`PUT /api/0.6/user/preferences` (no key) replaces **all** preferences of the user, including those of every
other app. Every write here names one key: `PUT .../user/preferences/{key}` and `DELETE .../user/preferences/{key}`.
The tests check that no call of the package is a whole-collection write (`memoryTransport().calls`).

## Saving

`save(listKey, statuses, { orderHash, previous? })`, in this order:

1. The meta is read (from `previous`, or by one `list()` call). A broken meta refuses the save: remove the list first.
2. The statuses are encoded and cut into chunks. The new meta is built and checked before anything is written.
3. The **inactive** slot is written; a chunk that already holds the same text is not written again.
4. The meta is written. This is the commit point: until it is written, `load` still returns the old statuses.
5. The old slot and any chunk left over from a longer save are removed.

A failure before step 4 leaves the previous state readable; a retry of `save` writes only what is missing.
A failure in step 5 throws, but the new state is already committed; the next save or remove cleans up.

`previous` is an optional record from `list()`, read just before the save. A record older than the server's
state can make the save overwrite the active slot, so pass it only when it was read just before.

## Loading and removing

- `load(listKey, all?)`: the meta and the statuses, or `undefined` when there is no meta. It throws when the
  stored data is broken (a chunk missing, text that does not decode, a meta that does not parse).
- `remove(listKey, all?)`: deletes the chunks of both slots first, the meta last. A failure in between leaves
  the list listed by `listAll`, so the removal can be retried.
- `listAll()`: every list under the prefix from one `list()` call, as `{ lists, broken }`. `broken` holds the
  full key of each meta that does not parse.

## Recovery and cleanup

- A broken list (in `broken`, or `load` throws): `remove(listKey)`, then the caller starts it again.
- Lists nobody has saved for a while: `staleLists(lists, nowSeconds, 30)` returns those with `u` older than 30
  days; `remove` them.
- An interrupted save or removal: call it again. Nothing else is needed; `load` never returns a half-written state.

## Reconcile

`reconcile({ localRevision, ackedRevision }, remoteRevision)` decides what to do with one list. Local changes
are revisions above `ackedRevision`; so are remote ones. `remoteRevision` is `undefined` when the server has no meta.

| Local changed | Remote changed | Result     | Meaning                          |
| ------------- | -------------- | ---------- | -------------------------------- |
| no            | no             | `same`     | nothing to do                    |
| yes           | no             | `push`     | write the local state            |
| no            | yes            | `pull`     | take the remote state            |
| yes           | yes            | `conflict` | both changed: the caller decides |

## Codec

`encodeStatuses` and `decodeStatuses(text, count)`. The statuses are `open`, `done`, `ignored`, `skipped`
(`TASK_STATUSES`, the index is the two-bit code). The count is not in the text; the caller keeps it in the meta.
`decodeStatuses` throws for an unknown prefix, characters outside base64url, a byte count that does not match
`count`, padding bits that are not zero, and deflated data that is corrupt or longer than `count` needs.

Deflate uses `CompressionStream('deflate')`, present in browsers and in Bun.

## Not verified

- The OSM API calls follow the brief (`preferences.json`, `PUT` and `DELETE` on the key). Nothing here was run
  against the live server or the mock; the tests use a fake `fetch` and the in-memory transport.
- The memory transport answers a delete of a missing key with 404. This is assumed from the server, not measured.
- `listKeyOf` and `orderHashOf` are 32-bit hashes: two lists could get the same key (rare, not checked for a
  given user).
- No number of preferences per user was found as a limit; the size of a user's preferences is not capped here.

## Tests

`bun test packages/osm-prefs`: codec and chunk round trips (0 to 20 000 tasks, seeded random), limits, the
HTTP calls against a fake `fetch`, the crash-safety scenarios (a failure at every write), removal, listing,
staleness, reconcile, and the size measurement. The tests write no files.
