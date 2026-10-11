# Storage and settings

Status: proposal. Based on a review of iD and Rapid 3 and of the libraries (2026-10-11). Library facts are from the npm registry and the projects' docs; points the review could not verify are marked.

## What Maid has to keep in the browser

| # | What | Size | Must survive | Loss means |
| --- | --- | --- | --- | --- |
| 1 | Unsaved edits and the undo history | Up to many MB | Reload, crash, closing the tab | Lost mapping work. The worst case |
| 2 | Settings | Small | Everything | Annoyance |
| 3 | Caches: downloaded OSM data, imagery metadata | Large | Nothing | A slower start |
| 4 | State of a fork's modules (task queues, ignore lists) | Small to medium | Depends | Depends |

## What iD and Rapid do

- **iD** keeps the history as one JSON document in IndexedDB (through `idb-keyval`), saved 100 ms after each change, and small preferences in localStorage. One tab owns the edits; the lock is a cookie that expires after five seconds and is renewed every four.
- **Rapid 3** still keeps the history as one JSON document in localStorage (its own comment says it belongs in IndexedDB), saved one second after a change. Settings are one localStorage key per value, with a **version number and an ordered list of migrations**, and are synced to the user's OSM account.
- Neither splits the history into pieces, neither recovers from a full disk beyond an error message, and neither has migrations for the saved history: Rapid refuses to restore any other version than the current one.

Take from Rapid: versioned settings with migrations. Take from neither: one big document rewritten on every edit, and the cookie lock.

## Libraries

| Library | What it is | Migrations | Verdict |
| --- | --- | --- | --- |
| **Dexie** 4.4 | IndexedDB with tables, indexes, transactions (31 kB) | Yes: `version(n).stores().upgrade()` | **Use for 1, 3 and 4** |
| `idb` 8 | Thin promise wrapper over IndexedDB (1.5 kB) | By hand | Fine below Dexie; we would rebuild what Dexie has |
| `idb-keyval` 6 | Key-value on IndexedDB (0.8 kB) | None | Only for single blobs. What iD uses |
| **Zustand `persist`** | Persists a store, with `version` and `migrate` | Yes | **Use for 2**, on localStorage |
| TanStack Query persister | Saves the query cache as one JSON | A cache-buster string only | Imagery metadata and other small server data. Not OSM data |
| Jotai `atomWithStorage` | Per-atom storage | None | We use Zustand |
| SQLite in the browser (official `sqlite-wasm`, OPFS) | Real SQL (about 470 kB) | SQL | Not now. Needs a worker; one variant needs special server headers, the other fails in a second tab |
| PGlite | Postgres in the browser (3.5 MB) | SQL | No |
| RxDB, TinyBase | Reactive databases with sync | Yes (not verified in detail) | No. We do not sync |
| localForage, absurd-sql, SignalDB, legend-state | | | Stale. No |
| Plain localStorage | 5 MB per origin, synchronous | By hand | Only below Zustand, for settings |

**Write it ourselves or rely on a library?** Rely on Dexie and on Zustand's `persist`. Both are small, maintained, and do the two things that are tedious and easy to get wrong: schema upgrades and transactions. What we write ourselves is the schema and the edit journal on top.

## The four stores

### 1. Edits: a journal, not a document

- One Dexie database per fork. Every edit appends **one small record** (what changed, in order). A snapshot is written now and then so that a restore does not replay everything.
- Appending a record costs the same whether the session has ten edits or ten thousand. Rewriting one multi-megabyte document after every edit does not.
- **One tab owns the unsaved edits**, with the Web Locks API (in all browsers since 2022). A second tab sees "open in another tab" and can view or take over. No cookie.
- At start: ask the browser for persistent storage (`navigator.storage.persist()`), and show a real message when the disk is full.
- Schema versions from day one. Unlike Rapid, an old journal is migrated, not refused.

A warning that belongs in the UI: Safari deletes all script-written storage of a site after seven days without a visit. Unsaved edits are not safe there for long.

### 2. Settings: Zustand with `persist`

One store, on localStorage, with a version and a `migrate` function. Small enough that synchronous reads at start are an advantage: the first paint already has the right theme and language.

### 3. Caches

Dexie tables for downloaded OSM data per tile, with the time of download and of last use, and a size budget checked against `navigator.storage.estimate()`. Imagery tiles belong to the browser's HTTP cache. Whether caching OSM data across sessions is worth it at all is open: stale data in an editor causes conflicts.

### 4. Modules

A module asks the editor for a store and gets a namespaced Dexie table or settings slice. It never opens its own database, so versions, quota and "clear my data" stay in one place.

**Everything is namespaced by a fork id.** Two forks on one origin (for example on a shared preview host) must not read each other's edits or settings.

## Which value wins

This is the part that gets messy if it is not written down, so here it is as one rule.

A setting can come from five places. From weakest to strongest:

| Layer | Source | Lifetime |
| --- | --- | --- |
| 1 | Maid's defaults | The release |
| 2 | The fork's config | The build |
| 3 | The user's stored preference | Until changed |
| 4 | The URL at load | This session |
| 5 | What the user does now | This session, see below |

**Effective value = the strongest layer that has one.**

Two rules make this safe:

1. **A URL never writes to the stored preference.** Opening a shared link with `filters=buildings:hidden` hides buildings for this session. The visitor's own preference is untouched and is back in the next session. (iD partly does the opposite: a custom background from the URL is saved as the user's preference. Rapid does it this way for filters: `URL ?? stored ?? default`.)
2. **A user action writes to the session and to the stored preference**, unless the session started from a URL that set this very setting. Then it writes to the session only.

Rule 2 is the subtle one. Without the exception, following someone's link and adjusting one thing would overwrite your own long-term preference with a mix of theirs and yours.

### Two values at once

Tobias's observation is right: for settings a link can carry, Maid has to hold **both** the user's stored value and the value from the URL. They are layers 3 and 4, kept separately. That makes one more thing possible:

- When the session differs from the stored preference because of the URL, the UI says so near the control: **"From the link. Use mine"**. One click drops layer 4 for that setting. A second action, **"Keep this as mine"**, copies it to layer 3.

No banner across the app; an indicator at the setting.

### Which settings can come from a URL at all

Only "what is shown" ([URL state](08-url-state.md)): background, overlays, filters, lens, photo options. Theme, language, panel layout and the like have no URL layer, so for them it is simply stored preference over fork config over default. `locale` from osm.org is the one hand-over: it is read once and treated as layer 4.

### Fork config: default or lock?

A fork's value is a default the user can change (layer 2). A fork can also **lock** a setting, which removes its control from the UI and makes layers 3 to 5 ignore it. The Radnetz editor would lock its lens list but leave the background free.

## Open

- Sync of settings to the OSM account, as iD and Rapid do through user preferences. Useful across devices; a second source of truth. Proposal: later, as an explicit "sync my settings".
- Whether OSM data is cached across sessions at all.
- How long a journal of unsaved edits is offered for restore, and what is shown when the data underneath has changed on the server meanwhile.
- The shape of the journal records depends on the graph and history design ([data store](05-data-store.md)).
