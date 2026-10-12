# @osm-editor-kit/maid-journal

The journal keeps the unsaved edits of an editor in the browser, so that they survive a reload.
It is headless: no React, no DOM beyond IndexedDB and the Web Locks API. It reads an `EditHistory`
from `@osm-editor-kit/maid-model` and writes to IndexedDB through Dexie. It never changes the history.

The design is in [docs/architecture/09-storage-and-settings.md](../../docs/architecture/09-storage-and-settings.md),
section "1. Edits: a journal, not a document".

## Use

```ts
const journal = createJournal({ name: 'maid:dev-api', context, history, onError })

const info = await journal.pending()          // { edits, savedAt } or undefined
if (info && userWantsRestore) await journal.restore()
else await journal.clear()

const stop = await journal.start()            // throws JournalLockedError in a second tab
// ... later, before unload:
await journal.flushed()
stop()
```

`restore()` needs a history without edits. Call `restore()` or `clear()` before `start()`, and
`start()` before the first edit. Once the journal runs, `clear()` is refused: reset the history
instead, which clears the store.

## Records

Database `name`, with two stores. Dexie schema version 1.

| Store | Key | Row | Holds |
| --- | --- | --- | --- |
| `edits` | `index` | `EditRecord` | One row per committed edit. |
| `meta` | `key` (`'state'`) | `MetaRow` | The pointer (the history index now), the id counters, the schema. |

`EditRecord`:

| Field | Meaning |
| --- | --- |
| `index` | Position in the history: `history.index` right after the commit. The first edit is 1. |
| `annotation` | The annotation, for the undo and redo menus. |
| `selectedIDs` | The selection at commit. |
| `changes` | One entry per entity the edit changed: `{ id, after, before? }`. `after` is `OsmEntity#asJSON()` of the new state, or `null` if the edit deleted it. `before` (only in the first record that touches the entity) is the state in `base`, or `null` if the entity was created. |
| `savedAt` | Milliseconds since the epoch. |

`MetaRow`: `{ key, schema, pointer, sequences, updatedAt }`. `sequences` is `context.sequences`
(`node`, `way`, `v`, ...). Restore keeps the larger value, so no id is reused.

Every commit writes one record and the meta row in one transaction. A commit after an undo deletes
the records above its index, which are the ones that can no longer be redone. Undo and redo write
only the meta row.

## Lock

`start()` takes the Web Lock `maid-journal:<name>` with `ifAvailable`. A second tab that asks gets
`JournalLockedError` and can view or take over. The lock is held until `stop()`. Without a lock
provider (tests, old browsers) `start()` takes no lock, and two tabs can write the same journal.

## Not saved

- Work in progress in `staging` that was not committed. A drag that was not finished is lost.
- The data of the base map. Only the base state of the entities the edits changed is stored, so a
  restore can merge them even when they are not loaded.
- Anything when a write fails. `lastError()` returns the error, and `onError` is called. The
  writes go on, but the records that were lost are gone, and so are the base states they carried.
  A restore keeps only the contiguous records from 1 up to the first gap.

## When the schema changes

- The Dexie schema is `db.version(1)`. A new store or index is a new `this.version(2).stores(...)`,
  with an `.upgrade()` if old rows need changing. Dexie runs it when an old database is opened.
- A change of the record or meta format bumps `SCHEMA_VERSION`. `restore()` refuses a journal with a
  newer schema. Schema 1 is the only one so far, so there is no migration code yet: the migration of
  an older journal is written together with the bump, and it runs in `restore()` before the replay.

## Tests

`bun test packages/journal`. The tests use `fake-indexeddb` and the real `EditHistory`.
