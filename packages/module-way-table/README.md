# Way table module (`@osm-editor-kit/maid-module-way-table`)

The way table: a dock tab that puts the selected way next to the ways before and after it. Each tag is a row and each way a column, so a person can see where the tags of a road differ from its neighbours, and change them there. Used in `maid-bicycle` and `maid-lanes`. The design is in [docs/research/way-table.md](../../docs/research/way-table.md).

## What a person sees / can do

- A dock tab "Way table" that appears while a way is selected. The dock computes nothing while the tab is closed.
- Columns: the selected way (the reference), then the connected ways of the same kind on each side, up to 3 per side ("Show 3 more" adds 3, up to 9). A building's neighbours are its adjoining buildings. Several selected ways are ordered along the road, along their line or by selection.
- Rows grouped by kind (Name, Road, Lanes, Parking, Cycling, Footway, Water and rail, Building, Other). A group can be folded, and "Only rows that differ" hides the rest.
- Cell colours against the reference: same, different, only here, missing, not set, and "depends on the direction of the way". Directional keys and values are mirrored for a way that points the other way, and the header says so.
- Click a value to change it: Enter saves, Escape cancels, Delete removes the key. Each change is one undo step.
- "Carry" on a row: write the value to the next N ways forward, back or both, with "Fill empty" or "Overwrite different". "Set on N" sets it on every other way of the chain.
- Junctions: where the chain branches, "Which way continues here?" asks.
- "Highlight changes" (key G): what changed in this session, before → after, removed keys as rows.
- A read-only way (a filter keeps it from changing) refuses a plan as a whole. Nothing is written.

## Using it in an editor's config

```ts
import { wayTable } from '@osm-editor-kit/maid-module-way-table'

wayTable(),
```

`wayTable({ maxPerSide })` sets how many ways per side show first (default 3). Apps: `apps/maid-bicycle` and `apps/maid-lanes`. `packages/shell/src/styles.css` lists `@source '../../module-way-table/src';`.

## Parts

| Part | What it does |
| --- | --- |
| `src/module.tsx` | `wayTable()`: the `dock.view` "Way table", available while a way is selected |
| `src/chain.ts`, `src/area-chain.ts` | The ways (and the adjoining buildings) around the reference, pure, from the loaded graph |
| `src/order.ts`, `src/table.ts` | The column order of several features, and the model of what the grid shows |
| `src/rows.ts` | The rows and their groups: patterns of keys, in the preset's order |
| `src/mirror.ts`, `src/cell-state.ts`, `src/cell-tone.ts` | Mirrored keys and values; the state of a cell; its colours and cues |
| `src/plan.ts`, `src/carry.ts`, `src/write.ts` | Writes as plans (one edit, carry, set on all), each applied as one undo step |
| `src/changes.ts` | "Highlight changes": the session's changes against the base data |
| `src/way-table-store.ts` | The table's UI state (a Zustand store): ways shown, junction choices, folded groups, carry settings |
| `src/WayTableView.tsx`, `WayTableGrid.tsx`, `WayTableCell.tsx`, `WayTableBar.tsx`, `WayTableEnd.tsx`, `WayTableLegend.tsx` | The React parts |
| `src/types.ts`, `src/test-graph.ts` | The shared shapes; a graph builder for the tests |
| `messages/`, `src/messages.ts` | The module's texts in en, de, fr and es |

## Tests

`bun test packages/module-way-table`: the chains, the areas, the column order, the mirror, the cell states, the plans, the carry, the changes, the writes and the store.

## More

- Research, the two versions it was taken from, and the design: [docs/research/way-table.md](../../docs/research/way-table.md).
- Steps: [docs/build-out/steps.md](../../docs/build-out/steps.md), entries "Way table: highlight changes" and the 2026-10-15 night.
- Related: [docs/research/street-space-editor-review.md](../../docs/research/street-space-editor-review.md), [docs/research/drawing-tools/0-maid-today.md](../../docs/research/drawing-tools/0-maid-today.md).

Open:

- The open questions of the research doc (section 6) and its list of points not checked (section 8). Among them: the performance numbers are proposals, not measured.
- The shortcuts of `useShortcuts.ts` were not read, so conflicts with them are not known (research doc, section 8).
