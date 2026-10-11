# Filtering: which data is on the map, and what can be done with it

Status: proposal, following Tobias's notes of 2026-10-11.

## What iD does

iD has a fixed list of feature categories (points, traffic roads, service roads, paths, buildings, landuse, boundaries, water, rail, power, past and future, others) with a checkbox each. A hidden category is not drawn and cannot be selected. iD also hides points and buildings by itself when there are too many. The rules are functions in `renderer/features.js`; a fork that wants another category patches that file.

The Radnetz Berlin fork adds a third state, read-only, and has to patch hover, lasso and snapping to honour it.

## Proposal

### Filters are data, in the config

A filter is a named rule plus the state it starts in. The list is ordered, and **the first filter that matches an object decides**. Later filters do not apply to it.

```ts
filters: [
  { id: 'cycleways',  match: { highway: 'cycleway' },              state: 'editable' },
  { id: 'roads',      match: { highway: ['residential', '…'] },    state: 'editable' },
  { id: 'buildings',  match: { building: '*' },                    state: 'readonly' },
  { id: 'boundaries', match: { boundary: '*' },                    state: 'hidden'   },
  { id: 'others',     match: '*',                                  state: 'editable' },
]
```

- **Three states** for every filter: `editable`, `readonly`, `hidden`. This is the Radnetz feature made the default.
- Maid ships a default list that reproduces iD's categories (`defaultFilters`). A fork uses it as it is, picks from it, reorders it, or writes its own. The entries are exported one by one so a fork can write `[cycleInfra, ...defaultFilters]`.
- `match` is data where it can be (tag conditions, geometry type) and a function where it has to be. Data rules can be shown in the UI, serialised and compared; functions cannot.
- The user changes the state of a filter in the UI. That choice is a setting and follows the rules in [storage and settings](09-storage-and-settings.md).

### Two stages, with different jobs

| Stage | Where | Decides | Cost of a change |
| --- | --- | --- | --- |
| **1. Data filter** | When features are built for the map | Whether an object gets a feature at all, and its state (`editable` or `readonly`) as a property | The affected features are rebuilt and sent to MapLibre |
| **2. Render filter** | MapLibre's `filter` on layers | What is shown right now among the features that exist | Almost nothing. No data moves |

Rules for which stage does what:

- **Hidden** is stage 1. A hidden object has no feature, so it cannot be drawn, hit, snapped to or counted, and it costs no memory in the renderer. This is also what makes hiding a real performance tool on dense data.
- **Read-only** is stage 1 as a property on the feature. Hover, select, lasso, drag and snapping read that one property. No interaction code needs to know about filters.
- **Stage 2 is for live, temporary narrowing**: a search box, a "show only what I changed" toggle, a lens that dims everything else, a time slider. Things that change while you look.

So the MapLibre filter is never the place where a category is switched off for good, and a category switch never needs a style change.

### Dependents

- A vertex takes the strictest state of the ways it belongs to; a vertex of only hidden ways is hidden.
- A member of a relation is not hidden because the relation is; the relation is a separate object with its own match.
- The selected object is always shown, whatever its filter says, as in iD.

### Automatic hiding

iD's "too many points, hide them all" is not part of this. Maid draws all points as dots and adds pins where they fit ([ADR 0004](../adr/0004-points-as-dots-plus-pins-that-fit.md)). If a density rule is needed later, it is a render-stage rule and says so in the UI.

### In the URL

`disable_features=boundaries,buildings` from iD is read and applied as `hidden`. Maid's own parameter needs three states, for example `filters=buildings:readonly,boundaries:hidden`, listing only what differs from the fork's defaults.

## Open

- The exact shape of `match` (how much can be data).
- Whether read-only objects are drawn differently by default (iD draws nothing special; the Radnetz fork dims them).
- What Rapid's filter system does better; see the [Rapid review](04-rapid-review.md).
