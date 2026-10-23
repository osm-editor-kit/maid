# Loading an osmChange file into Maid

Study of 2026-10-23 for a Maid module that loads an osmChange file (`.osc`), merges it with the current OSM data,
lets a person review what needs it, and applies it as normal edits that are uploaded with the normal save.

- [kyle-hensel.md](kyle-hensel.md): iD's draft import ([openstreetmap/iD#10407](https://github.com/openstreetmap/iD/pull/10407))
  and Kyle Hensel's conflict fixes ([openstreetmap/iD#12814](https://github.com/openstreetmap/iD/pull/12814)).
- [id-and-maid.md](id-and-maid.md): iD's conflict check at upload (`actionMergeRemoteChanges`, `uiConflicts`), and
  what Maid has: save flow, the unused port of the merge action, history, mock API, fixtures, `TagDiff`.
- [streetcomplete.md](streetcomplete.md): StreetComplete's per-key tag diffs and when it gives up.

## The three approaches side by side

| | iD at upload (and #12814) | iD #10407 (import) | StreetComplete |
| --- | --- | --- | --- |
| When it looks | After the server answers 409 | When the file is loaded | Every upload; on a conflict again with fresh data |
| Detection | Version of each modified entity (and a way's nodes) against a fresh copy | Version in the file against the loaded version | The server's 409, plus its own checks per action |
| Base for three-way | The history's base graph | none | The original element stored in each edit |
| Tags | Per key, three-way; both changed → conflict | Whole tag set replaced | Per key: ADD, MODIFY (from, to), DELETE (from); "already applied" is fine |
| Node position | Local vs remote, no base: any difference is a conflict | Overwritten | Moved more than 30 m → conflict |
| Way nodes | diff3 against base | Replaced | Only the end nodes must stay |
| Relation members | Any difference → conflict | Replaced | Any difference → conflict |
| Deleted on the server | Conflict: restore or leave deleted | Error | Edit dropped |
| Deleted by us, changed on the server | Not checked (fixed in #12814: conflict) | Error on version mismatch | Delete action checks geometry and use |
| What needs a person | Each conflicting entity: "keep mine" or "use theirs" | Everything, by refusing (or Ctrl-click to overwrite) | Nothing: the edit is dropped silently |
| Granularity of a decision | Entity | File | Edit |

What we take: StreetComplete's per-key rules (they are exactly the tag part of a three-way merge and treat "already
applied" as no conflict), iD's diff3 for way nodes (already ported in `packages/model/src/actions/merge_remote_changes.ts`),
#10407's order of work (allocate ids for creates first, resolve references through an id map, fetch before applying),
#12814's list of cases worth a test. What we do not take: overwriting a whole tag set (#10407), the delete actions that
cascade (an osmChange lists every deletion itself), and dropping edits without a word (StreetComplete).

## Proposed design

### Package and entry

`packages/module-osmchange`, factory `osmChange()`, switched on per app in `maid.config.ts`. Headless parts (parse,
merge, plan) are plain TypeScript with unit tests; the UI uses the extension points that exist today, no new one:

- `topbar.panel` "Load changes": file picker (and drop on the panel), the summary after loading, "Apply".
- `dock.view` "Changes from file": the review list, one row per element, with `TagDiff` and the decision controls.

### 1. Parse

`DOMParser` on the file. Keep for each element: action (`create`, `modify`, `delete`), type, id, version, tags,
`lat`/`lon`, `nd` refs, members, `if-unused`. Refuse with a reason (no partial load):

- not an `<osmChange>` document, an unknown element, a `create` with a positive id, a `modify`/`delete` with a
  negative id, the same element twice;
- a reference (way node, member) to a negative id that the file does not create;
- more than 10 000 elements (the API's `maximum_elements`, which Maid already enforces at upload).

A `modify`/`delete` without a version is accepted; its base is unknown (below).

### 2. Fetch the current state

"Current" is what the editor holds now: the loaded data with the person's own unsaved edits on top. Every element the
file modifies or deletes, and every existing element a create refers to, is loaded through the engine
(`loadEntity`: `node/<id>`, `way/<id>/full`, `relation/<id>/full`, through `editor.fetch`). Already loaded elements are
not fetched again. In automation this is the mock API only; the test files use ids that exist in the fixtures. A 404 or
410 means deleted on the server.

### 3. Base: the version the file was made from

- **File version = current version**: base = current. Nothing changed on the server, the file applies as it is.
- **File version < current version**: the server changed since. The base is the element at the file's version from the
  history API (`/api/0.6/<type>/<id>/<version>`), fetched only when a person runs against `osm` or `dev` (question 1).
  The mock does not serve versions; without a base, every difference between file and current is a decision.
- **No version**: base unknown, as above.

### 4. Three-way merge per element (ours = the file, theirs = current)

- **Tags, per key**: only we changed it → ours; only they changed it → theirs; both to the same value → fine; both to
  different values → **conflict** for that key.
- **Node position**: one side moved it → that side; both moved to the same place (1e-7°) → fine; both elsewhere →
  **conflict**.
- **Way nodes**: one side changed the list → that side; both → diff3 (the ported `mergeNodes`); overlapping hunks →
  **conflict**.
- **Relation members**: one side changed → that side; both differently → **conflict**.
- **Modify of an element deleted on the server** → **conflict** (default: skip).
- **Delete**: unchanged on the server → delete. Changed on the server → **conflict** (question 2). Already deleted →
  nothing to do, listed as info. Still used by a way or relation that the file does not change (iD's `if-unused`) →
  **conflict**, default keep.
- **Create**: always applied; a reference to an element deleted on the server → **conflict** for the create.

Each element ends as *clean* (no server change), *merged* (server changed, merged without a question), *conflict*
(needs a decision), *skipped* or *info*. Decisions are per element and per conflicting key: "Use file" or "Keep
current".

### 5. Review

The dock lists conflicts first, then merged, then clean, folded by status. A row: the element's name and type, the
status, a `TagDiff` from current to the result (with the base when there is one), the conflict controls, a button to
select and fly to it. "Apply" is enabled when every conflict has a decision. A person can look at clean rows too.

### 6. Apply

One undo step, "Changes from <file name>" (question 3 if it should be per element). Order as #10407: new entities
first (empty), then tags, positions, node lists, members with ids through the id map, then deletes. A delete removes
exactly the entity (no cascade). New entities get Maid's own negative ids. The result is ordinary history: the person
can change it, undo it and upload it with the normal save, which already blocks above the element limit.

### What is checked automatically

- Unit tests per rule on hand-written `.osc` files in the package, whose ids exist in the `small` fixture
  (node `31354018` v11, way `4394952` v22, see [id-and-maid.md](id-and-maid.md#b9-fixtures)), and the combinatorial
  case of #12814 over every create/modify/delete × server unchanged/changed/deleted.
- A browser check `check-osmchange` (bicycle app, mock API): load a file, a clean element, a merged one, a conflict,
  decide it, apply, the map and data show it, one undo step removes it all. No upload: the mock rejects writes.

## Decisions (Tobias, 2026-10-23)

The case that matters: changes made offline in Go Map!! on version 10, while StreetComplete raised the element to
version 12 online. Refusing such a file is no answer.

1. **Base version**: from the OSM history (`/api/0.6/<type>/<id>/<version>`), read like the current data. For tests
   without a server, the mock answers from hand-written older versions (`tools/mock-osm-api/history/`), not from
   new fixtures. Without a base every difference is a decision.
2. **Delete of an element changed since**: a decision, "keep" chosen at first.
3. **Both moved a node**: less than 3 m apart → the file's position, folded in the review with the reason; further →
   a decision. Way end nodes and relation members: as StreetComplete, a change on both sides is a decision. The
   review shows every row: decisions open, the rest folded with the reason, so the person can look.
4. **Entry**: the account menu ("Load changes from a file…"), as it is rarely needed: a new extension point
   `account.item`. The review in the dock, the changes on the map in OSMCha's colours (osmcha2).
5. **Unsaved changes here** to an element of the file: the file is refused until they are saved or undone.

Built as `packages/module-osmchange` (step in [steps.md](../../build-out/steps.md#osmchange-files-started-2026-10-23)).

After Tobias's first test (2026-10-23): no "Apply". What needs no decision is in the editor right after loading, as
one undo step; each decision is written when it is made, as a step of its own. The review shows and highlights;
undo or a reload takes the changes back.

What the plan above says and the build does differently: the review lives only in the dock (no top bar panel); a
`modify` of an element deleted on the server is skipped with a note, not a decision (restoring a deleted element is
not offered); a create that uses a node the server does not have refuses the whole file.
