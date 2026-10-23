# Kyle Hensel's work in iD: osmChange import and conflicts

State of 2026-10-23, read from GitHub (PR pages and diffs, read-only `gh`) by a subagent (Haiku); the PR states, file
lists and `modules/actions/import_osmChange.js` of #10407 were re-read by the orchestrator. "Measured" means read in
the PR or diff, "inferred" means concluded from it.

## Summary

- [openstreetmap/iD#10407](https://github.com/openstreetmap/iD/pull/10407) "Support importing osmChange files": open,
  draft since 2024-08-12, one commit, no tests. A button in the Map Data pane loads an `.osc`, fetches the current
  version of every modified or deleted element, refuses on a version mismatch (Ctrl-click overrides) and applies the
  file as one history step.
- [openstreetmap/iD#12814](https://github.com/openstreetmap/iD/pull/12814) "fix the merge-conflict resolution UI getting
  stuck in an infinite loop": open since 2026-08-31, stacked on
  [openstreetmap/iD#12813](https://github.com/openstreetmap/iD/pull/12813) (uploader in TypeScript). Fixes three bugs in
  iD's conflict check, handles local deletions, about 30 test cases. Claims to close 15 old conflict issues.
- Merged around upload: gzip ([#11353](https://github.com/openstreetmap/iD/pull/11353)), the 10 000-element limit
  ([#11388](https://github.com/openstreetmap/iD/pull/11388)), the tab-close guard
  ([#12930](https://github.com/openstreetmap/iD/pull/12930), Maid has it since commit 8f81bfc), `merge_conflict=yes` on
  the changeset ([#9636](https://github.com/openstreetmap/iD/pull/9636)), a restore crash
  ([#12176](https://github.com/openstreetmap/iD/pull/12176)).
- His fork has the branch [k-yle/iD kh/import-osmChange](https://github.com/k-yle/iD/tree/kh/import-osmChange), whose
  one commit is #10407. No conflict branch in the fork. The deployment on kyle.kiwi was not opened.

Related issues: [#7109](https://github.com/openstreetmap/iD/issues/7109) (feature request: load osmChange),
[#8036](https://github.com/openstreetmap/iD/issues/8036), [#7199](https://github.com/openstreetmap/iD/issues/7199)
(endless conflict loop), [#11044](https://github.com/openstreetmap/iD/issues/11044),
[#10713](https://github.com/openstreetmap/iD/issues/10713) (see what others changed before uploading).

## 1. #10407: importing an osmChange file

22 files, +795/−5 (measured). Commit
[09b8a16](https://github.com/openstreetmap/iD/commit/09b8a16bffcbd9647e5a5e91291a2d82e1201e3d).

Discussion (measured): bhousel suggested it for Rapid too; a request for drag and drop instead of a button; tyrasd
(2026-07-09) wants `.osc` only, no GeoJSON/osmPatch, and maybe the entry in the Map Data menu; matkoniecz requested
changes without a text. The diff still carries `modules/actions/import_osmPatch.js` (268 lines).

Data flow (measured from the diff):

1. `modules/ui/sections/import_file.js` adds a button to the Map Data pane (`data_layers.js`). Ctrl-click sets
   `allowConflicts`.
2. `modules/operations/import_file.js` opens a file picker (`.osc,.osmPatch.geo.json`) and parses with
   `parseOsmChangeXml` of the `osm-api` npm package.
3. The `<changeset>` tags of the file go into `context.defaultChangesetTags()`, which the commit pane spreads into the
   new changeset.
4. Every modified or deleted element is loaded in full from the API (`context.loadEntity`, made async, chunks of 10).
5. `history.appendImageryUsed('.osmChange data file')`, then one `context.perform(actionImportOsmChange(...))`.
6. `modules/actions/import_osmChange.js`, four passes over the graph:
   - unless `allowConflicts`: the graph's version of each modify/delete must equal the file's `version`, else it throws
     `Conflicts on <id>`;
   - every `create` becomes an empty placeholder (`osmNode`/`osmWay`/`osmRelation` with tags), and an id map records
     file id → new iD id;
   - `create` and `modify`: `actionChangeTags` with the file's whole tag set, then `actionMoveNode`,
     `actionReplaceWayNodes` or `actionReplaceRelationMembers` (both new) with ids through the map;
   - `delete`: `actionDeleteNode/Way/Relation`.
7. An error shows a new `modules/ui/error_modal.js`.

What it does not do (measured/inferred):

- No merge: a newer server version is all or nothing — refuse, or overwrite with Ctrl-click (inferred: the file's whole
  tag set replaces the server's, so another mapper's change is lost silently).
- No review: the person sees the result only on the map.
- iD's delete actions cascade (deleting a way deletes its untagged nodes, deleting a node removes it from ways). An
  osmChange lists every deletion itself, so the cascade can delete more than the file says (inferred, not tested).
- Not checked whether `loadEntity` overwrites an entity the person had already edited locally.
- No tests.

## 2. #12814: the conflict resolution UI

15 files, +1365/−33, one commit
[c7c2d12](https://github.com/openstreetmap/iD/commit/c7c2d129ebbe5616388c5d86afb4db5c1b79af9b) (measured). Base is
`kh/conflicts2` (#12813).

Three bugs fixed (measured from the PR body and diff):

1. Both buttons of a conflict sent "keep mine": the choice was read from the wrong field. Now an enum
   `ConflictChoiceType` (`KEEP_LOCAL`, `KEEP_REMOTE`) in `modules/core/uploader.ts`, read in `modules/ui/conflicts.js`.
2. Untagged vertices were never checked: the list came from `coreDifference.summary()`, which is made for the upload
   panel and leaves them out. Now `difference.modified()` and `difference.deleted()`.
3. Local deletions were never checked. They are now; the local side falls back to `localGraph.base().entities[id]`, and
   a new `modules/core/rebaser.ts` (`rebaseRemoteChangesIntoBaseGraph`) writes the server versions into the base graph
   and rebases the history with `force`. The PR says this rewrites history and cannot be undone.

`modules/actions/merge_remote_changes.ts` gets a branch for a locally deleted entity: deleted on the server too → revert;
"keep mine" keeps the deletion; "keep theirs" restores the rebased base; otherwise a new conflict message
`merge_remote_changes.conflict.deleted_locally`. `modules/actions/revert.ts` restores locally deleted child nodes
recursively. Equal versions skip the merge. Cancelling conflict resolution stays broken (documented, `history.pop`
only).

Tests (measured): `test/spec/actions/merge_remote_changes.js` (+76), `test/spec/actions/revert.js` (+50),
`test/spec/core/rebaser.ts` (+50), `test/spec/core/uploader.ts` (+1017, with a real context): about 30 cases, among them
"local delete + remote edit → conflict", "local delete of a way vs remote edit of its child node" and one combinatorial
case over every local/remote edit/delete pair.

## 3. What Maid can take

- From #10407: parse first, give every `create` a new id before any reference is resolved, keep an explicit id map,
  fetch the current version of every modify/delete before applying, carry the file's changeset tags, apply as one undo
  step, refuse a reference to an id that is neither in the file nor loadable. The entry point in the data/upload area
  rather than a new top-level button (tyrasd's review).
- Not from #10407: overwriting the whole tag set and the cascading deletes. Maid applies the file's *difference* to its
  base version (three-way) and deletes exactly what the file lists.
- From #12814: the conflict cases worth a test each (local delete vs remote edit, a way's child node edited remotely,
  both deleted, equal versions), and its combinatorial test as a model for ours. Maid's own conflict check at upload is
  a separate step (see [id-and-maid.md](id-and-maid.md)).
