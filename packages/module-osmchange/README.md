# osmChange module (`@osm-editor-kit/maid-module-osmchange`)

Loads an osmChange file (`.osc`, from Go Map!!, JOSM or another editor) into Maid. Maid asks the server for the current state of each element, merges the file with it, and lists what needs a decision. Nothing is uploaded here: the changes become ordinary edits, and the person saves them with the normal save.

`osmChange({ apiUrl })`: `apiUrl` is the API root the editor reads from (`config.apiUrl`), so the mock API in development and tests.

## What a person sees / can do

- Account menu: "Load changes from a file…" (`account.item`). The file picker takes one `.osc` file.
- Dock tab "Changes from file" (`dock.view`): the review. Groups, in this order: "To decide", "Conflicts resolved automatically", "Changes without conflicts", "New data without conflicts", "Obsolete: already on the server".
- Each decision: "Take the file's" or "Keep the server's" for a tag, a position or a node list; "Delete it" or "Keep it" for a delete; "Use the existing one" or "Create it too" for a new element that the server may already have.
- Each row has "Show" and a note on what was merged and why (for example "Kept the server's position" or "Both moved it, 2 m apart: took the file's position").
- Map (`map.content`): the file's changes in OSMCha's colours: new in teal, changed in yellow, deleted in red, the state before a change dashed, no change in violet. "Highlight differences" switches the marks on.
- After loading, the map moves to the elements that need a decision (else the merged ones, else the rest).
- Changeset: the save form gets `osmchange:created_by` (the file's generator), a comment "Changes from Go Map!! …, merged with the current map in Maid", and the file's own changeset comment and source.
- Refusals with a message: not a file of this kind, more than 10,000 elements, unsaved local edits to an element of the file, an element the server no longer has, a file that is not valid XML.
- Undo: each decision is one undo step ("Decision on …").

## Using it in an editor's config

```ts
import { osmChange } from '@osm-editor-kit/maid-module-osmchange'
// in the modules list of apps/maid-bicycle/src/maid.config.ts:
osmChange({ apiUrl: config.apiUrl }),
```

Only `maid-bicycle` switches it on. Tailwind reads the module from `packages/shell/src/styles.css` (`@source '../../module-osmchange/src';`).

## Parts

| File | What it does |
| --- | --- |
| `src/module.tsx` | `osmChange()`: registers the account item, the dock view, the map content and the `changeset.tags` item; closes the review after an upload |
| `src/parse.ts` | Reads the file with its own small XML reader (no DOM). Checks ids, tags, references and the 10,000 element limit |
| `src/load.ts` | Asks the server (through the editor's fetch) for each element and its base version from the history, in boxes around the positions |
| `src/merge.ts` | Three-way merge of one element: per tag key, per position (3 m: `CLOSE_METRES`), per node list (diff3) and per member list |
| `src/match.ts` | Checks the file's new elements against the server's (the same tags at the same place) |
| `src/plan.ts` | One item per element, in the order the review shows them |
| `src/apply.ts` | Writes a plan into the editor's graph as one action, in iD #10407's order |
| `src/editor-io.ts` | The only place that touches the editor: reads a file into a session, writes what needs no decision, writes each decision |
| `src/osmchange-store.ts` | The open import: the file, the server state, the choices |
| `src/features.ts` | The changes as map features with OSMCha's colours |
| `src/ReviewView.tsx`, `LoadChangesItem.tsx`, `OsmChangeOnMap.tsx` | The dock review, the account item and the map layer |
| `src/types.ts`, `src/message-text.ts`, `src/messages.ts` | Plain data types; message ids of the headless code; the module's texts |
| `messages/` | Texts in en (base), de, fr, es |

## Tests

`bun test packages/module-osmchange`: parsing, loading, the merge rules, matching, plans, apply, map features and the message ids. The tests use hand-written files and the ids of `fixtures/small`. The browser check is `bun run check-osmchange --app bicycle` (uses the mock's older versions in `tools/mock-osm-api/history/`).

## More

- Research: [docs/research/osmchange-upload/README.md](../../docs/research/osmchange-upload/README.md), with [id-and-maid.md](../../docs/research/osmchange-upload/id-and-maid.md), [kyle-hensel.md](../../docs/research/osmchange-upload/kyle-hensel.md) and [streetcomplete.md](../../docs/research/osmchange-upload/streetcomplete.md).
- Decisions and steps: [docs/build-out/steps.md](../../docs/build-out/steps.md), "osmChange files (started 2026-10-23)".
- Open: none listed in the steps.
