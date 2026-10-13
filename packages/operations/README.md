# @osm-editor-kit/maid-operations

What the editor can do to the selection, as iD's edit menu offers it: reverse, split, merge, straighten, square, make round, disconnect, extract. Headless: an operation is data and functions on the graph of `maid-model`, with no map and no UI.

```ts
type Operation = {
  id: string
  label: string
  shortcut?: string                                  // iD's key
  applies(context): boolean                          // offered for this selection at all?
  disabled(context): string | undefined              // why not now, as a sentence
  run(context): { actions, annotation, select? }     // one undo step
}
```

The editor registers operations on the `edit.operation` extension point (`operations(defaultOperations)` in `maid.config.ts`), shows the ones that apply and performs what `run` returns. A fork adds its own operation the same way or leaves one out of the list.

`select` is a function of the graph after the actions ran, because the ids of entities that an action creates are only known then.

Compared with iD, what needs the tiles or the filters is left out: "not downloaded" and "connected to a hidden feature". The view is in, as `too_large` (below). Not here yet: move, rotate, copy and paste (they need the pointer or the clipboard), merging a point into a way or area, and joining unclosed ways into a ring before making them round.

## The view: `too_large`

`OperationContext` has an optional `viewExtent`: the box the map shows, as `{ min: [lon, lat], max: [lon, lat] }` (the form of the model's Extent). A turned map is not a box in lon/lat, so the context may also have `viewPolygon`: the same view as its convex corners in lon/lat, in either winding. When it is set, it is the view and `viewExtent` is not read. Without either, nothing is too large. With a view, an operation whose features are less than 80 % in view is disabled with `too_large` (iD's and Rapid's threshold, `<` 0.8: exactly 0.8 is allowed). The share is by area, as iD's `percentContainedIn` for a box. For a polygon the feature's box (its lon/lat bounding box, as iD) is clipped to the convex view (`percentInPolygon`, Sutherland-Hodgman) and the share is the clipped area over the box's area; for a box view this gives the same numbers. A point or a line counts as all in view when all its corners lie in the view, edges included. The features' extent is the union of the selection, as iD's `utilTotalExtent`; a feature without a position is not measured. The sentences are iD's (`core.yaml`, `operations.<name>.too_large`), in the operation's own reason table.

| Operation | iD | Rapid | Maid |
| --- | --- | --- | --- |
| Reverse, split, merge | no rule | no rule | no rule |
| Straighten | after the action's reason; the extent is the selection, or the two picked nodes when two are picked | the same | the same as iD |
| Square (orthogonalize) | after "all blocked"; the extent is the selection | the same | the same as iD |
| Make round (circularize) | after "all blocked"; the extent is the selection | the same | the same as iD |
| Disconnect | after the action's reason; the extent is the disconnected vertices (for ways: the shared nodes, else the other nodes); singular or plural by the selected vertices or ways | the same | the same as iD |
| Extract | first; the extent is the selection | the same | the same as iD |
| Flip long, flip short (reflect) | first; the extent is the selection | the same | the same as iD |
| Delete | first, before the data reasons (part of a relation, incomplete, Wikidata) | the same, but a feature that is new (not saved yet) is exempt | the same as iD: no exemption |
| Move, rotate, copy and paste | `too_large` | `too_large` | not ported yet; `isTooLarge` in `extent.ts` is for them |
| Escape hatch `poweruser.allowLargeEdits` | none | yes | not adopted: a setting would let a feature far out of view be edited |
| Point to area (Maid's own, not iD's) | none | none | no rule |

The app builds the context in the renderer's `operationContext()` and passes `viewExtent` (the map's bounds) and `viewPolygon` (the four canvas corners, unprojected; pitch is 0) there. Nothing in this package reads the map.
