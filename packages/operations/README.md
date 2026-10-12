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

Compared with iD, everything that needs the map is left out: "too large to edit here", "not fully visible", "not downloaded". Not here yet: move, rotate, reflect, copy and paste (they need the pointer or the clipboard), merging a point into a way or area, and joining unclosed ways into a ring before making them round.
