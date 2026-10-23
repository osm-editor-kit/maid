# OsmChange upload: iD's conflict handling and Maid's current state

Research only, 2026-10-23. Nothing was run or uploaded, no network request was made, and no file was changed except this one.

Sources:
- **iD**: `/Users/tordans/Development/OSM/Maid/.reference/id` (iD 2.42.2, commit `0194f3926a`). The worktree has no `.reference/` directory; the checkout exists only in the main Maid checkout. Paths in Part A are relative to that iD root.
- **Maid**: paths relative to the worktree root.
- **osm-api 4.0.1** (Maid's upload library): `packages/shell/node_modules/osm-api/dist/index.js` (symlink into the bun cache). Cited as `osm-api/index.js`.

Confidence: lines were read in the files. Where a sentence says "reading suggests", the behaviour follows from the code but was not exercised.

---

## Part A. iD

### A1. When iD checks for conflicts

There is no check before the first upload. The first attempt uploads straight away, and the full check runs only after the server answers 409.

- The Save button calls `context.uploader().save(context.changeset)` (`modules/ui/commit.js:399`).
- `uploader.save` (`modules/core/uploader.js:49-99`) keeps the unmodified changes in `_origChanges` (line 81, used by the `.osc` download). On the first attempt it pushes a no-op onto history (lines 86-88), so that later conflict resolution can be popped.
- Lines 91-97: `if (!checkConflicts) upload(changeset); else performFullConflictCheck(changeset);`. The first call has `checkConflicts` unset, so it is a fast upload.
- `uploadCallback` (`uploader.js:319-334`): on `err.status === 409` it calls `uploader.save(changeset, true, true)`, which runs the full check. Any other error goes to `resultErrors`.

So the server's per-element version test decides whether a conflict exists. iD only fetches and compares after a refusal.

### A2. Which elements are fetched before the full check

- Only items with `changeType === 'modified'` from `history.difference().summary()` (`uploader.js:112-119`). Created and deleted elements are not version-checked.
- `summary()` (`modules/core/difference.ts:157-222`) reports a moved vertex's parent ways as modified (`addParents`, lines 210-218), and reports a retagged vertex itself.
- `withChildNodes` (`uploader.js:136-150`) adds the children of each modified way that have a `version` (new nodes have none).
- Fetch: `osm.loadMultiple(ids, loaded)` (`uploader.js:129`, and `202` for follow-ups). `modules/services/osm.js:557-578` issues `GET /api/0.6/{nodes|ways|relations}.json?{type}=id,id,...`, in chunks of 150 ids.
- `loadMultiple` returns no way nodes and no multipolygon members, so `loaded()` (`uploader.js:154-210`) fetches them as well: nodes of visible ways, and members of visible multipolygon relations (lines 176-193).
- The remote state is a separate graph, `new coreGraph(history.base(), true)` (`uploader.js:110`), with the fresh entities replaced into it (line 168).

### A3. Version comparison and what happens next

- `sameVersions(local, remote)` (`uploader.js:234-247`): the entity versions must match. For a way, each child present in both graphs must also match. If they match, the entity is skipped (line 253).
- Otherwise `actionMergeRemoteChanges(id, localGraph, remoteGraph, _discardTags, formatUser)` is applied with `history.replace(merge)` (lines 255-257).
- No conflicts: counted as automatically resolved (lines 259-263). The changeset gets the tag `merge_conflict_resolved=automatically` (lines 298-302).
- Conflicts: an entry is pushed with two choices (lines 265-279). Choice 0 is "Keep mine" (`forceLocal`); choice 1 is "Use theirs" (`forceRemote`). The entry starts with `chosen: 1`.
- The merged entity takes the remote's version: `createEntity(local, { version: remote.version })` (`actionMergeRemoteChanges`, line 225). An accepted upload therefore carries the server's current version.

### A4. Merge rules: `modules/actions/merge_remote_changes.ts`

Signature (line 25): `actionMergeRemoteChanges(id, localGraph, remoteGraph, discardTags = {}, formatUser?)`. Strategy via `withOption('safe' | 'force_local' | 'force_remote')` (lines 269-272); conflict messages via `conflicts()` (275-277).

| Case | `safe` (default, used by the full check) | `force_local` ("Keep mine") | `force_remote` ("Use theirs") |
| --- | --- | --- | --- |
| Remote deleted (`!remote.visible`) | Conflict "This feature has been deleted by {user}" (lines 239-241); no change | Keep local. A way restores its nodes via `mergeChildren`, then `graph.replace(target)` (233-237) | Delete locally with `actionDeleteMultiple` (229-230) |
| Node location (`mergeLocation`, 35-50) | Equal → keep. Different → conflict "moved by both you and {user}" (48-49). Compares local with remote, not with base | Keep local | Take remote `loc` (45) |
| Way node list (`mergeNodes`, 53-88) | `diff3Merge(a=local, o=base, b=remote, excludeFalseConflicts)` (66). A hunk changed on one side is taken. A hunk changed differently on both sides → conflict "Nodes were changed by both…" (81-82) | Keep local nodes | Take remote nodes (58) |
| Way child nodes (`mergeChildren`, 91-144) | A node still used by the way: if local and remote versions differ, take the local node with the remote version (130-139), with `mergeLocation` for moved nodes. A node not used by this way and with no tags or other parents is removed (108-111, `isUsed` 92-99) | Local nodes with the remote version (123-128) | Remote node if visible (120-121) |
| Relation members (`mergeMembers`, 158-168) | Any difference from remote is a conflict "Relation members were changed by both…" (166). No base comparison | Keep local | Take remote members (163) |
| Tags (`mergeTags`, 171-207) | Per key, a three-way check against base (`o`, `a`, `b`). Changed remotely and also locally → conflict "You changed the … tag…" (193-194). Changed only remotely → take the remote value or delete (196-201). Keys in `discardTags` are skipped (184) | Keep local | Take remote tags (176) |

Rules that apply across the table:
- If any conflict is recorded for an entity, the action leaves the graph unchanged for that entity (`if (!_conflicts.length)` at line 261; `mergeTags` at 206 has the same guard).
- Message keys: `data/core.yaml:1055-1061` (`merge_remote_changes.conflict.deleted|location|nodelist|memberlist|tags`).
- iD's own spec covers only the both-changed location case (`test/spec/actions/merge_remote_changes.js:162-176`) and the both-changed member case (`324-339`).

Observation, from reading only (not run): `mergeLocation` and `mergeMembers` compare with the remote, not with the base. So if the remote alone moved a node, or alone changed a relation's members, while the local edit changed only tags, the safe merge still records a conflict. Verify before relying on this.

### A5. The conflicts UI

- Trigger: `upload()` with `_conflicts.length` → `didResultInConflicts` (`uploader.js:291-292`, `355-365`) → `resultConflicts` → `modes/save.js:58-91` `showConflicts`.
- `uiConflicts` (`modules/ui/conflicts.js:18-131`):
  - Header "Resolve conflicting edits" and help text (`data/core.yaml:1044`, `1054`).
  - "Download changes" link exporting `_origChanges` as `changes.osc` (`conflicts.js:80-100`).
  - One conflict at a time, counter "n of N", a link to the entity that zooms to it (`153-177`), the detail messages (`179-198`).
  - Two radio choices (`230-268`). Labels: "Keep mine" / "Use theirs", or for a deleted remote "Restore" / "Leave Deleted" (`data/core.yaml:1048-1051`).
  - Previous and next buttons (`196-225`).
  - Save is disabled while more than one conflict exists (`121`), and enabled once the last one has been shown (`141-151`).
  - Cancel calls `uploader.cancelConflictResolution` → `history.pop()` (`modes/save.js:72-80`, `uploader.js:392-394`).
- Choosing a radio runs `choose()` (`conflicts.js:271-292`), which calls `datum.action()` → `history.replace(forceLocal | forceRemote)` (`uploader.js:216-220`, the `choice` helper). The map is zoomed to the entity.
- Save → `modes/save.js:81-87` → `uploader.processResolvedConflicts(changeset)` (`uploader.js:397-414`). For each conflict with `chosen === 1` it runs `actionRevert` on the entity (and on its way nodes, lines 402-408). Then `save(changeset, true, false)` uploads.
- The changeset tag `merge_conflict_resolved=manually` is set in `didResultInConflicts` (`uploader.js:357`).

**Quirk, from reading only:** `conflicts.js:251` stores the entity id in `ul.__data__.chosen` (`chosen = d.id`). `conflicts.js:264` compares it to `d.id`, and `uploader.js:401` compares it to `1`. So the default `chosen: 1` is never pre-selected in the UI. An unclicked conflict falls into the `chosen === 1` branch, which reverts to the base version (`actionRevert` → `graph.revert`, `modules/core/graph.ts:295-303`). The base version is old, so the upload probably gets another 409, and the conflict screen probably comes back. Not run.

### A6. Building the upload: `osmChangeJXON` and `putChangeset`

Flow (`modules/services/osm.js:584-655`):
1. `PUT /api/0.6/changeset/create` with the changeset tags (`597`).
2. `POST /api/0.6/changeset/{id}/upload` with the osmChange XML (`607-631`). The XML is gzipped when possible (`utilGzip`, `615-629`).
3. `PUT /api/0.6/changeset/{id}/close` (`649-652`). Close is fire-and-forget, and the callback waits 2500 ms (`640`).
- `updateChangesetTags` is `PUT /api/0.6/changeset/{id}` (`658-664`), used for the `merge_conflict_resolved` tag.

The XML is built by `changeset.osmChangeJXON(changes)` (`modules/osm/changeset.ts:51-130`), called at `services/osm.js:615`:
- Root: `<osmChange version="0.6" generator="iD">` with three children (`changeset.ts:121-129`).
- `<create>`: nodes, then ways, then relations (`nest(…, ['node','way','relation'])`). Relations are reordered so that a dependency comes first (`sort`, `69-115`, which follows each relation's members).
- `<modify>`: nodes, ways, relations, not dependency-sorted (`126`).
- `<delete if-unused="true">`: relations, ways, nodes, so a member is deleted before the thing that uses it (`127`).
- Element attributes come from `asJXON(changeset_id)`:
  - `node.ts:306-318`: `id`, `lon`, `lat`, `version = this.version || 0`, `changeset`, `tag`s.
  - `way.ts:462-478`: `id`, `version`, `nd` refs, `tag`s, `changeset`.
  - `relation.ts:186-204`: `id`, `version`, `member` (type, role, ref), `tag`s, `changeset`.
- Ids: `osmIdManager` (`modules/osm/id_manager.ts`) hands out negative ids per type from -1 (`next`, lines 23-28). `osmId()` gives `-1` for a new entity. `isNew()` is `osmId[0] === '-'` (`modules/osm/abstract-entity.ts:86-89`).
- Version of a created entity: `0`, because it has none.
- Tags uploaded: `history.changes(actionDiscardTags(history.difference(), _discardTags))` (`uploader.js:304`). The discard list is loaded from `fileFetcher.get('discarded')` (`uploader.js:39-41`).
- What counts as a change: `coreDifference.checkEntityID` (`modules/core/difference.ts:26-70`) compares `loc`, `nodes`, `members` and `tags` with `deepEqual`.

### A7. Can iD load an `.osc` file?

No. A search of `modules` for `.osc`, `osmChange`, `loadFromFile` and `FileReader` finds only export code:
- `modules/ui/conflicts.js:84-95` and `modules/ui/sections/changes.js:101-110`: "Download changes" links, both named `changes.osc`.
- `modules/services/osm.js:615` and `modules/core/uploader.js:80`: upload and the stored copy.
- The Map Data file loader (`modules/svg/data.js:28-35`, `317`, `343-370`) accepts only `.gpx`, `.kml`, `.geojson` and `.json`. It does not accept `.osc` or `.osm`.

---

## Part B. Maid

### B1. The save flow today: upload without a conflict check

- **Entry**: `uploadEdits` (`packages/shell/src/save/save.ts:58-89`), called from `SaveButton.tsx:125` only on submit.
  - Refused on the mock (`save.ts:69`), and blocked by OSM API limit errors (`70-71`, `uploadErrors` at `28-37`).
  - `pendingChange` (`40-43`) = `toOsmChange(editor.history.changes(), discardedTags)`. The discard list is passed here (`save.ts:2`, `42`).
  - `auth.api()` (`packages/shell/src/auth.ts:96-101`) returns `osm-api` configured with the bearer token.
  - `OSM.uploadChangeset(tags, change)` (`save.ts:78-82`).
  - After success: `selectionAfterUpload`, `editor.history.reset()` (`save.ts:84`), `clearIgnoredIssues()`, `engine.reloadAfterUpload(selection, 2500)` (`save.ts:87`, `packages/renderer/src/engine.ts:766-780`).
- **No pre-check, no merge, no conflict UI.** A 409 rejects with `OSM API: <server text>` (`osm-api/index.js:4184-4187`). `SaveButton.tsx:158-159` shows `error.message` in the form. `save.ts:48-49` documents the behaviour: "A conflict … rejects with the server's message, and then nothing is forgotten."
- **Transport**: `osm-api` calls the global `fetch` (`osm-api/index.js:4169`), not `editor.fetch`. So uploads do not pass through the 'osm' service gate or pause (`packages/core/src/types.ts:199`).
- The library also chunks large uploads (`uploadChangeset`, `osm-api/index.js:4655-4700`) and returns `diffResult` old-to-new ids and versions, which `assignedIds` reads (`packages/shell/src/save/after-upload.ts:33-50`).
- `osm-api`'s `UploadPhase` type has a `"merge_conflicts"` value (`dist/src/api/changesets/uploadChangeset.d.ts`), but `index.js` never emits it in 4.0.1. Nothing in Maid reads it.

### B2. The merge action is ported, but nothing calls it

- `packages/model/src/actions/merge_remote_changes.ts` (370 lines), exported from `packages/model/src/actions/index.ts:47`. A search of `packages`, `apps` and `tools` finds no caller except its test (`packages/model/test/id/actions/merge_remote_changes.test.ts`, which is a port of iD's spec).
- Signature differs from iD: `actionMergeRemoteChanges(id, options)` (line 44), with `options = { localGraph, remoteGraph, discardTags, formatUser, localize, strategy }` (interface at lines 14-22). `strategy` is `'safe' | 'force_local' | 'force_remote'` (line 20; default `'safe'` at line 50). `conflicts(): string[]` (line 31).
- The rules mirror iD (`mergeLocation` at 64, `mergeNodes` at 90, `mergeChildren` at 140, `mergeMembers` at 231-243, `mergeTags` at 257-294, the action at 308-357). The same base-versus-remote caveat from A4 applies.
- Message keys have no entries in `packages/i18n` (a search for `merge_remote_changes` finds only the model package). The `localize` option has no caller.

### B3. Maid's upload element builder

- `packages/shell/src/save/osm-change.ts`:
  - Types: `ChangeElement` (15-26), `OsmChange` (28-32).
  - `element()` (39-59): id from `OsmEntity.toOSM`, so a new entity is negative; `version: entity.version ?? 0`; a copy of the tags.
  - `elements(entities, order)` (61-66): ordered by node, way, relation, then by id. Deletes use order `-1`, so relations come first.
  - `toOsmChange` (87-93): created and modified elements get `cleanTags` and `discardTags`. Deleted elements are sent as they are.
- `osm-api`'s XML (`osm-api/index.js:4302-4317`):
  - `create`: node, way, relation.
  - `modify`: node, way, relation.
  - `delete` with `$if-unused`: reverse order (`createGroup`, `4249-4292`, reverses for delete).
  - Version: `$version: type === "create" ? 0 : f.version` (`4257`). Changeset: `$changeset: csId` (`4258`).
  - osm-api has no dependency sort for relations. iD's `sort` (`changeset.ts:69-115`) does, and Maid's `elements()` does not. So a new relation that is a member of another new relation may be created in the wrong order. Not tested.
- A port of iD's `osmChangeJXON`, including the sort and `if-unused`, exists at `packages/model/src/data/OsmChangeset.ts:102-196`. Only the model tests use it (`packages/model/test/id/osm/changeset.test.ts:24-`). The upload does not use it.
- Stale comment: `osm-change.ts:80-86` says "Maid's save does not pass one yet" (the discard list). `save.ts:42` does pass `discardedTags`, so the comment is out of date.
- Changeset tags: `changesetTags` (`osm-change.ts:140-152`): `created_by`, `comment`, `hashtags`, `source`, `imagery_used`. `createdByValue` (`123-132`).

### B4. Model: history, undo steps, entity ids

- `EditHistory` (`packages/model/src/edit/EditHistory.ts`):
  - `base` (239), `stable` (250), `staging` (260) graph getters.
  - `perform(...actions)` runs on staging (298-301).
  - `commit({ annotation, selectedIDs })` makes one undo step (345-361).
  - `undo()` (440), `redo()` (483), `reset()` (192, clears all state), `merge(entities)` (559, adds to base for loading), `difference()` (744), `changes(action?)` (755-767, returns `{created, modified, deleted}`).
- `Action` (`packages/model/src/actions/types.ts:18-22`): `(graph, t?) => Graph`.
- `Graph` (`packages/model/src/lib/Graph.ts`): constructor from `(context, entities[])` seeds the base (91; the array form calls `rebase`). Also `hasEntity` (213), `entity` (227), `parentWays` (243), `childNodes` (272), `replace` (284).
- New entities: `new OsmNode(context, props)` gets `id = 'n-' + context.next('node')` (`packages/model/src/data/OsmNode.ts:38-50`). The sequence is in-memory (`packages/model/src/Context.ts:31-39`), starting at `n-1`. Way and relation follow the same pattern. Maid's `OsmEntity.toOSM` is at `OsmEntity.ts:305-310`, `osmId()` at `331`, `isNew()` at `339`.
- `actionAddEntity(entity)` (`packages/model/src/actions/add_entity.ts:11`).
- Renderer examples of one undo step:
  - `MaidEngine.addPoint` (`packages/renderer/src/engine.ts:1313-1321`) → private `edit(action, annotation, selectedIDs)` (`1323-1330`): `history.perform(action)` and `history.commit({annotation, selectedIDs})`, inside `engine.change` (`1421-1441`).
  - `setTags` (`engine.ts:907-911`).
  - `TagEdits.changeTags` (`packages/renderer/src/tag-edits.ts:39-56`).
- A module can do this without the engine: `TurnRestrictionsSection.tsx:168-171` calls `editor.history.perform(...step.actions)` and `editor.history.commit({annotation, selectedIDs})` directly. The renderer redraws from the `stagingchange` event (`engine.ts` `onStagingChange`, about line 1447).

### B5. Modules and extension points

- `packages/core/src/types.ts:127-145`: `MaidModule { id, setup(api) }` and `ModuleApi { editor, register(point, item), on(name, listener), urlParam(declaration) }`.
- `defineModule` (`packages/core/src/editor.ts:24-26`). `createEditor` (`28`). `setUp` (`63-104`) runs `setup`, and the cleanup it returns runs at `destroy()`, in reverse order.
- `Editor` (`packages/core/src/types.ts:162-`): `context` (`Context`), `history` (`188`), `fetch` (`199`), `registry`, `queries`, `services`.
- Extension points, declared by merging into `ExtensionPoints`:
  - `packages/renderer/src/extension-points.ts`: `map.layer`, `map.content`, `edit.operation`, `imagery.used`, `draw.constraint`, `draw.tool`.
  - `packages/ui/src/extension-points.ts`: `inspector.section` (`InspectorSection` with `component: ComponentType<InspectorSectionProps>`), `inspector.field`, `dock.view`, `topbar.panel`.
  - `packages/module-notes/src/extension-points.ts`: `note.selection`.
  - Table in `ARCHITECTURE.md:114-137`.
- Example module: `packages/module-surface/src/index.ts:15` (`surface()`). ARCHITECTURE shows a `shapes-rectangle` module at lines 88-99.
- `apps/maid/src/maid.config.ts:64-` builds the `modules` list, one module per line.
- Built-in shell module `packages/shell/src/modules/element-info.tsx`: an inspector section that shows ID, version, changeset, user and timestamp, and "edited, not uploaded" when `staging` differs from `base` (`element-info.tsx:6-50`).

### B6. How the engine fetches elements by id (for reference)

- `MaidEngine.loadEntity(id)` (`engine.ts:405-407`) → `TileLoader.loadEntity` (`packages/renderer/src/tile-loader.ts:223-232`):
  - `n123` → `node/123.json`; `w123` → `way/123/full.json`; `r123` → `relation/123/full.json` (`loadRelation` at 203, `fetchRelation` at 234-241).
  - `fetchElements` (284-307) calls `this.remote(url)`, which is the editor's gated fetch (`engine.ts:240`, `options.fetch ?? standaloneFetch`), and merges the result through `host.merge`.
  - Parent relations: `/api/0.6/{type}/{id}/relations.json` (`packages/renderer/src/parent-relations.ts:18-25`).
- The merge goes to `OsmData.merge` (`packages/renderer/src/data.ts:62-75`). It calls `history.merge(fresh)`, which adds to base and skips ids already loaded (`entitiesFromOsmJson(context, elements, known)`). Loading is not an edit.
- Consequence: `engine.loadEntity` cannot return a remote copy of an element already on screen. A conflict check needs its own fetch and its own graph.
- JSON to entities: `packages/model/src/data/fromOsmJson.ts` (`OsmJsonElement` at 10-25, `entitiesFromOsmJson` at 37).

### B7. `TagDiff`

- Component: `packages/ui/src/TagDiff.tsx:8-27`. Props: `before: Record<string,string>`, `after: Record<string,string>`, `showUnchanged?: boolean` (default false). Renders a `<ul>` of rows. Tones (`29-34`): added is emerald (`+ k=v`), removed is red with a strike (`− k=v`), changed is amber with the old value struck through (`~ k= old → new`), unchanged is grey.
- Row logic (pure, no React): `packages/ui/src/tag-diff.ts:17-30`, `tagDiffRows(before, after)`, sorted by key.
- Exported from `packages/ui/src/index.ts:9`.
- Used only in `packages/shell/src/components/PasteTagsDialog.tsx:78` (import at line 2).
- Not the same thing: the outdated-tags rule has its own `TagDiff` type (`packages/validation/src/rules/outdated-tags.ts:15`, `+`/`-`/`~`), and `packages/shell/src/modules/validation.tsx:296` describes that shape.

### B8. Mock OSM API (`tools/mock-osm-api/server.ts`)

Default port 8090 (`tools/ports.ts:16`). Scene root: `http://localhost:8090/s/<scene>` (`packages/shell/src/config.ts:139-143`).

Served (GET only, under `/s/<scene>`), from `createHandler` (lines 240-340):
- `/api/capabilities(.json)` and `/api/0.6/capabilities` (292-297).
- `/api/0.6/map?bbox=w,s,e,n` (299-305).
- `/api/0.6/notes.json?bbox=…&closed=…&limit=…` (269-283). `/api/0.6/notes/ID(.json)` (285-290). `/api/0.6/notes/search` returns an empty collection (334-336).
- `/api/0.6/{node|way|relation}/ID(.json)` (314-331). `/api/0.6/{way|relation}/ID/full(.json)` (314-331, via `scene.full`).
- `/api/0.6/{node|way|relation}/ID/relations(.json)` (307-312).
- `/api/0.6/user/details` returns 401 (332-333). `/api/0.6/changesets` returns an empty list (337-338).

Not served (404). These are the calls iD and osm-api make for conflict checks and upload:
- `/api/0.6/nodes?nodes=`, `/ways?ways=`, `/relations?relations=` (iD `loadMultiple`, `osm.js:557-578`; osm-api `getFeatures`, `index.js:4922-4927`).
- `/api/0.6/{type}/ID/{version}` (iD `loadEntityVersion`, `osm.js:521-531`; osm-api `getFeatureAtVersion`).
- `/api/0.6/{type}/ID/history`.
- `/api/0.6/changeset/*` (create, upload, close, update).

Any other method gets 405 "The mock OSM API is read-only" (`server.ts:263-265`). Every request is logged (`server.ts:344-350`) and the log is listed at `/requests` (`241`, `245-247`).

### B9. Fixtures

- Location: `fixtures/<scene>.json.gz` plus `fixtures/<scene>.meta.json`. Notes are in `fixtures/notes/<scene>.json`. There is no `.osc` fixture and no changeset fixture.
- Format: the gzip of one OSM API JSON document, `{ version, generator, elements: [...] }`. Elements are `{type, id, version, tags?}` plus `lat`/`lon` for nodes, `nodes` for ways, and `members: [{type, ref, role}]` for relations.
- Loader: `loadScenes` (`tools/mock-osm-api/server.ts:227-235`). Builder: `tools/fixtures/build.ts` (cuts from a local `.osm.pbf` with osmium; a person runs it, per AGENTS.md core rule 1).
- Scenes (`tools/fixtures/scenes.ts:14-50`):
  - `small`: Lichtenrade, residential streets. 12,196 nodes, 1,914 ways, 67 relations (`fixtures/small.meta.json`).
  - `medium`: Mitte, Hackescher Markt.
  - `dense`: Neukölln, street space and parking.
  - `relations`: Köpenick, bicycle, bus and hiking routes, turn restrictions, multipolygons. 19,358 nodes, 3,420 ways, 190 relations.
  - `indoor`: Hauptbahnhof, levels.

Example ids, verified by reading the decompressed fixtures:

| Element | Version | Tags | Where / notes |
| --- | --- | --- | --- |
| node `31354018` | 11 | `highway=turning_circle` | `small`; 52.390045, 13.4053924 |
| node `29658249` | 20 | `highway=crossing`, `crossing=unmarked`, `tactile_paving=no` | `small`; 52.392243, 13.4015949 |
| way `4394952` | 22 | `highway=residential`, `name=Briesingstraße`, `width=8`, `surface=asphalt` | `small`; nodes `3316730880` (v4), `13103664535` (v1), `34648668` (v6) |
| way `25397511` | 15 | `highway=footway`, `lit=yes`, `surface=sett` | `small`; 5 nodes |
| relation `22584` | 493 | `type=route`, `route=road`, `ref=B 96`, `name=Bundesstraße 96` | `small`; 4 members |
| way `10699605` | 33 | `highway=residential`, `name=Freiheit` | `relations`; 3 nodes |
| relation `5415` | 14 | `type=multipolygon`, `name=Dahme` | `relations`; members way `5060709` (inner, **absent from the fixture**), way `28077552` (outer, v100), way `333893458` (inner, v2) |

A test `.osc` can be built on node `31354018` (add a tag, use version 11) or way `4394952` (version 22). The mock rejects every write with 405, so an upload test needs a stubbed client, and the .osc can only be checked for shape.

### B10. Functions a new module would call

Each entry gives the existing function and where it is.

- **Fetch elements by id from the API**:
  - `editor.fetch` (type `RemoteFetch`), the only way to send a request to a remote host (`packages/core/src/types.ts:199`). The OSM host is claimed for the 'osm' service in `packages/shell/src/shell.ts:101-102`.
  - Then `entitiesFromOsmJson(editor.context, json.elements)` (`packages/model/src/data/fromOsmJson.ts:37`), and `new Graph(editor.context, entities)` (`packages/model/src/lib/Graph.ts:91`) for a separate graph. This does not touch history.
  - Alternative: osm-api `getFeature(type, id, full)` and `getFeatures(type, ids)` (`osm-api/index.js:4911-4927`). These use the global fetch, and `getFeatures` is not served by the mock.
  - Avoid `engine.loadEntity` (`packages/renderer/src/engine.ts:405`) for a remote copy. It merges into base.
- **Apply an action as one undo step**:
  - `editor.history.perform(...actions)` (`packages/model/src/edit/EditHistory.ts:298`), then `editor.history.commit({ annotation, selectedIDs })` (`345`). This is how `TurnRestrictionsSection.tsx:168-171` does it.
  - Engine wrappers: `MaidEngine.setTags(id, tags, annotation)` (`packages/renderer/src/engine.ts:907`), `TagEdits.changeTags(ids, change, annotation)` (`packages/renderer/src/tag-edits.ts:39`). Both use `engine.change` (`engine.ts:1421`), which groups the redraws.
  - Undo: `editor.history.undo()` (`EditHistory.ts:440`). Engine: `MaidEngine.undo()` (`engine.ts:1388`).
- **Create entities**:
  - `new OsmNode(editor.context, { loc: [lon, lat], tags })` (`packages/model/src/data/OsmNode.ts:38`), then `actionAddEntity(node)` (`packages/model/src/actions/add_entity.ts:11`) inside `history.perform`. Example: `MaidEngine.addPoint` (`packages/renderer/src/engine.ts:1313`).
  - Ways: `new OsmWay(context, { nodes, tags })` (`packages/renderer/src/draw.ts:245-249`).
- **Render a tag diff**: `TagDiff` from `@osm-editor-kit/maid-ui` (`packages/ui/src/TagDiff.tsx:8`, exported at `packages/ui/src/index.ts:9`). The row logic is `tagDiffRows` (`packages/ui/src/tag-diff.ts:17`).
- **Upload, if a module ever needs it**: `uploadEdits(shell, draft)` (`packages/shell/src/save/save.ts:58`), from a click only, through `auth.api()` (`packages/shell/src/auth.ts:96`).

---

## Gaps and risks for the new module

1. Maid has no conflict detection before or after upload. A 409 shows the raw server text in the save form (`SaveButton.tsx:158-159`). There is no keep-mine and keep-theirs screen. The merge action (`merge_remote_changes.ts`) is ported and exported, but no code calls it.
2. iD's order is: fast upload, then a full check on 409. Maid has no such retry. A module that wants iD's behaviour would have to add the 409 path to `uploadEdits`, which is outside the module system.
3. The upload bypasses `editor.fetch`, so it skips the 'osm' gate and pause (osm-api uses the global fetch, `index.js:4169`).
4. Relation create ordering: iD sorts new relations by dependency (`changeset.ts:69-115`). Maid and osm-api do not (B3). Not tested.
5. The stale comment in `osm-change.ts:80-86` says the discard list is not passed. It is (`save.ts:42`).
6. iD's location and member checks compare with the remote, not the base (A4). Maid copied this (`merge_remote_changes.ts:64-78`, `231-243`). Both are unverified and can cause false conflicts.
7. iD's "Use theirs" default (`chosen: 1`) is probably broken (A5). Maid has no UI for it, so there is nothing to copy.
8. The mock cannot test any conflict path, because it has no per-id version endpoint, no `nodes?nodes=` endpoint, and rejects all writes (B8).
