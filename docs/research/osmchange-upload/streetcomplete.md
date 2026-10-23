# StreetComplete: conflicts on upload

State of 2026-10-23, read from a local StreetComplete checkout by a subagent (Haiku). Paths are relative to
`app/src/commonMain/kotlin/de/westnordost/streetcomplete/`. "Read" means seen in the code, "inferred" means concluded
from the code flow. Not re-checked line by line by the orchestrator.

## Summary

- Edits are a queue of `ElementEdit` rows. Each holds an `ElementEditAction` with a snapshot of the original element
  and, for tag edits, a `StringMapChanges` diff (ADD / MODIFY / DELETE per key). Stored as JSON.
- Upload is first in, first out, one edit at a time. An edit is built against the local cache first; any
  `ConflictException` (local, or HTTP 409/410/412/404) retries the edit against freshly fetched server data.
- If that also conflicts, the edit is **discarded** with the edits that depend on it, its elements are fetched again
  and the tile is invalidated. No message to the user was found.
- The client does not compare versions itself: it sends the element's version and the whole merged tag set, and the
  server's version check is the lock.
- Tag conflicts are per key. Geometry conflicts are coarse: a node moved more than 30 m, a way's first or last node
  changed, a relation's member list changed.
- New elements get negative ids reserved when the edit is made; after upload the new ids are written into the edits
  still waiting.

## 1. Data model (read)

- `data/osm/edits/ElementEdit.kt:8-33`: id, type, originalGeometry (display only), source, createdTimestamp, isSynced,
  action, isNearUserLocation. The snapshot lives inside the action, not the edit.
- `data/osm/edits/ElementEditAction.kt:7-32`: `newElementsCount`, `elementKeys`,
  `createUpdates(mapDataRepository, idProvider): MapDataChanges`, `idsUpdatesApplied()`.
- `data/osm/edits/update_tags/UpdateElementTagsAction.kt:24-27`: `originalElement: Element` and
  `changes: StringMapChanges`. Its doc (lines 15-22): the diff keeps it robust to conflicts, the original checks geometry.
- `update_tags/StringMapEntryChange.kt`, the per-key three-way rules:
  - ADD (line 21): conflict if the key exists with another value.
  - MODIFY (line 31): `map[key] != valueBefore && map[key] != value`: conflict only if the current value is neither the
    base nor the target. Already applied counts as fine.
  - DELETE (line 41): conflict if the key exists with a value other than `valueBefore`. Already gone is fine.
  - All three check the 255-character limit of keys and values.
- `update_tags/StringMapChangesBuilder.kt`: built against a source map; `set` gives ADD or MODIFY with `valueBefore`,
  `remove` gives DELETE.
- `update_tags/StringMapChangesXt.kt:8-26`: applying turns `IllegalStateException` into
  `ConflictException("Conflict while applying the changes")`.

## 2. Upload flow (read)

- `data/upload/Uploader.kt:55-76`: element edits, then note edits, under one mutex.
- `data/osm/edits/upload/ElementEditsUploader.kt:43-52`: oldest unsynced edit first, `NonCancellable` so an upload is
  never half done.
- `data/osm/edits/upload/ElementEditUploader.kt:28-57`: builds the changes from the local cache and uploads.
  `SplitWayAction` always uses server data (`ApplicationConstants.kt:116-119`, route relations are not stored locally).
  A `ConflictException` falls back to `uploadUsingRemoteRepo` (lines 64-88), which builds the changes again through
  `RemoteMapDataRepository` (a live API call per element) and retries once with a new changeset.
- `data/osm/mapdata/MapDataApiClient.kt:51-84`: 409, 410, 412 and 404 become `ConflictException`, 413
  `ChangesetTooLargeException`.
- `data/osm/mapdata/MapDataApiSerializer.kt:39-72`: version and changeset attributes, and every tag of the element.
- `data/osm/mapdata/MapDataApiParser.kt:79-100` and `MapDataUpdates.kt:17-77`: the `diffResult` (old_id, new_id,
  new_version) maps to updated elements and id changes.

## 3. What counts as a conflict and what happens (read)

- Discard: `ElementEditsUploader.kt:72-96`. `markSyncFailed` deletes the edit and its dependents
  (`ElementEditsController.kt:105-107, 150-185`), the elements are fetched again (404 = deleted), the tile is invalidated.
- Other errors (network, auth) stop the upload and leave the edit in the queue (inferred).
- `MapDataWithEditsSource.kt:469-476`: an edit whose `createUpdates` conflicts is silently left out of the local view.
- Geometry, `update_tags/SpatialPartsOfElement.kt:9-49`: node more than 30 m away (line 21); way whose first or last node
  id differs, only checked for existing nodes (lines 35-42; nodes inside the way may change); relation whose member list
  differs at all, order included (lines 46-49).
- `delete/DeletePoiNodeAction.kt:38-68`: a node that is now part of a way loses its tags instead of being deleted; one in
  a relation gets a fixme.
- `create/CreateNodeAction.kt:38-73`: inserting a node into a way needs both neighbours unchanged (`equalsInOsm`,
  1e-7 degrees, `util/ktx/LatLon.kt:7-9`).
- `split_way/SplitWayAt.kt:52-124`: split points are stored as positions, not indices, and matched again on the current
  way.

## 4. New elements, splits, id mapping (read)

- `ElementIdProviderDao.kt:16-48` reserves `newElementsCount` negative ids per edit.
- `split_way/SplitWayAction.kt:81-247`: the longest piece keeps the way's id and version; relation memberships are
  rewritten, turn restriction roles narrowed with the via node.
- `ElementEditsController.kt:82-103`: after an upload the new ids are written into the waiting edits.

## 5. Granularity

Tags per key; geometry per element; relation members as a whole list; one osmChange upload per edit.

## 6. What Maid can take (inferred)

- The three per-key rules of `StringMapEntryChange` are exactly the tag part of a three-way merge: base = `valueBefore`,
  theirs = current, ours = `value`. "Already applied" is not a conflict.
- The coarse geometry check (30 m, end nodes, member list) as the line between "merge automatically" and "a person looks".
- StreetComplete never merges conflicting keys and never asks: it drops the edit. Maid wants a review instead.
- An osmChange file holds no base element, only the version it was made from. The base must be fetched (history API) or
  approximated (see the design in [README.md](README.md)).

## Tests that document the rules (read, not run)

`app/src/androidUnitTest/.../data/osm/edits/upload/ElementEditUploaderTest.kt`, `ElementEditsUploaderTest.kt`,
`update_tags/UpdateElementTagsActionTest.kt`, `update_tags/SpatialPartsOfElementKtTest.kt`,
`app/src/commonTest/.../update_tags/StringMapChangesBuilderTest.kt`.
