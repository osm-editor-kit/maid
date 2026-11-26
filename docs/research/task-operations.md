# Task options that run editor operations (draft)

Date: 2026-11-26. Built the same day as described here (`packages/tasks/FORMAT.md`, `packages/module-tasks/src/apply.ts`). Asked for by Tobias through the session "One-Way Geometrien im Seitenraum" (infravelo-radnetz):
a task list of separate cycleways in Berlin that are drawn the wrong way round needs the answer "Reverse the way".
Tobias wants this to be general: an option that runs editor operations, for example Reverse and Square (iD's
Orthogonalize, key Q), without a new format for each one. Not built yet; this is the concept to settle first.

## Today

`packages/tasks/FORMAT.md`: an option is `tag` (`set`/`remove`), `create` or `delete`. "Moving features or changing
their geometry is not possible." Every option changes something: a `tag` option needs `set` or `remove`, so an answer
"the data is right" has to use "ignored".

Maid already has iD's operations as plain data (`packages/operations`): each `Operation` has `applies(context)`,
`disabled(context)` (a sentence, or undefined when it can run) and `run(context)` (actions and an annotation), on an
`OperationContext` with the selection and the graph. The edit menu uses exactly these. A task option can call them
the same way, with the option's features as the selection.

## Proposal

A new optional field `operations` on a `tag` option: a list of operations that run in their order, before `set` and
`remove`, all in one undo step with one preview.

```json
{
  "id": "reverse",
  "label": "Reverse the way",
  "osm": ["way/123"],
  "operations": [{ "op": "reverse" }],
  "set": { "oneway": "yes" }
}
```

- `op` names an operation from a fixed list (below). Unknown names fail `tasks-check`, so a list made for a newer Maid
  is refused instead of half applied. Each list entry is an object, so an operation can get parameters later without a
  new format (none has one now).
- The operations run on the option's `osm` features, or without `osm` on the selected task feature, as `set` does.
- **All or nothing.** Before anything runs, Maid asks each operation `applies` and `disabled` on the graph left by the
  ones before it. When one does not apply or is disabled ("not squarish", "too large", "not loaded"), the button is
  disabled with that sentence as its tooltip, as iD greys out the operation. Nothing is changed in part.
- Features that are not loaded are loaded first, as for `delete`.
- Then `set` and `remove` change the tags of the result. With `operations`, `set` and `remove` may both be empty.
- The preview (hover on the option) shows the result of all steps; Apply is one undo step with the option's label as
  its annotation.

### Operations in the first version

From Maid's ports, the ones that keep the feature and its id and need no further choice:

| `op`          | For                              | Maid's operation | Disabled when (iD's reasons)                         |
| ------------- | -------------------------------- | ---------------- | ---------------------------------------------------- |
| `reverse`     | lines; nodes with a direction    | `reverse` (V)    | never (a feature without direction does not apply)   |
| `square`      | closed ways, lines with corners  | `square` (Q)     | not squarish, too large, not loaded, …               |
| `straighten`  | lines; several points            | `straighten` (S) | too bendy, not loaded, …                             |
| `circularize` | closed ways                      | `circularize` (O)| not closed, too large, …                             |

`reverse` does what V does in iD: it turns the nodes round and swaps the direction in the keys and values that depend
on it (`:left`/`:right`, `:forward`/`:backward`, also inside a key, `direction`, `incline`). It does **not** change
`oneway` values: `oneway=yes` after `reverse` means the other direction on the map. So the two cases of the cycleway
list are:

- drawn the wrong way with `oneway=-1`: `"operations": [{"op": "reverse"}], "set": {"oneway": "yes"}` keeps the riding
  direction and only normalises the drawing;
- drawn the wrong way with `oneway=yes`: `"operations": [{"op": "reverse"}]` turns the riding direction round.

Not in the first version, because they change ids, need a choice or more than one feature: split, merge, disconnect,
extract, delete segment, continue, line to area. `delete` stays its own `action`.

### An answer without a change

`"action": "none"`: an option that changes nothing and only records the answer (the task counts as done with that
option, like the others). No `set`, `remove`, `operations` or `geometry`. For "The direction is right" or "Checked, the
data is right" next to the fixing options, where "ignored" would say the task was skipped.

### FORMAT.md draft

Under `options[]`:

| Field        | Type             | Rule                                                                                          |
| ------------ | ---------------- | --------------------------------------------------------------------------------------------- |
| `action`     | string           | optional. `"tag"` (the default), `"create"`, `"delete"` or `"none"`.                          |
| `operations` | array of objects | `tag` only, optional, at most 5. Each `{ "op": <name> }`, `op` one of `reverse`, `square`, `straighten`, `circularize`. |

> **Operations.** A `tag` option may run editor operations on its features before it changes their tags: the same as
> the editor's commands (Reverse V, Square Q, Straighten S, Circularize O), in the order given. With `operations`,
> `set` and `remove` may be empty. When one of the operations cannot run on the features (iD's reasons: not squarish,
> too large, …), the option cannot be applied and its button says why; nothing is changed in part. `reverse` turns
> the way and swaps `:left`/`:right` and `:forward`/`:backward`, but keeps `oneway` as it is: to keep the riding
> direction of a way with `oneway=-1`, add `"set": {"oneway": "yes"}`.
>
> **`"action": "none"`**: an answer that changes nothing. No `set`, `remove`, `operations` or `geometry`.

The sentence "Moving features or changing their geometry is not possible" becomes "Moving features is not possible;
the operations below change the shape of a feature in place."

## Effort

| Part                                                                                              | Estimate |
| ------------------------------------------------------------------------------------------------- | -------- |
| Zod schema, `task-file.schema.json`, FORMAT.md, `tasks-check` messages                            | 1 h      |
| Apply: build the `OperationContext`, ask `applies`/`disabled` step by step, run, then `set`/`remove`, one undo step | 1.5 h |
| Button: disabled with the reason, preview of the result                                           | 1 h      |
| `"action": "none"`                                                                                | 0.5 h    |
| Tests (unit for each operation and for a disabled one), a fixture task, the `tasks` browser check | 1.5 h    |
| **Together**                                                                                      | **~5.5 h** |

`reverse` alone first, then the other three, adds little: the code is the same for every operation.
