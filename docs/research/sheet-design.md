# Sheet: a small spreadsheet-like editing grid, and the Tags section built on it

Design of 2026-10-13. Read for it: `TagList.tsx`, `TagRow.tsx`, `AddTag.tsx`, `Inspector.tsx` (the Tags disclosure), `engine.setTag`/`setTags`, `Combo.tsx`, `combo-logic.ts`, `DraftInput.tsx`, `logic.ts`, `useShortcuts.ts`, the hotkey library's input test (`@tanstack/hotkeys` 0.11 `_event-target.js`), iD's `raw_tag_editor.js` and `entity_editor.js` `changeTags` at the pinned commit, ADR 0009, `fetching-audit.md` 5.7, `radnetz-features.md` row 6. Not run: nothing. "(inferred)" marks what was not read.

## 1. Verdict

- Right: the raw tag list is a two-column sheet already. Paste and copy of `key=value`, an always-present empty last row and one undo step per gesture remove the add form and iD's text view in one move.
- Right: the second use (way as a table) needs the same cells, selection, clipboard and suggestions, so a headless core plus one React grid is worth it. The two differ in what a paste means, which is a host option, not a fork.
- Hard: focus and keys (a grid cell that is not a text field would let `M`, `Delete` and the arrows reach the map); the paste semantics for tags (records by key, not positions); row identity through a key rename; sort without rows jumping under the cursor.
- Hard: the mixed state and async suggestions, both kept behind types from day one but built last.
- Leave out of version 1: disjoint selections (Cmd+click), column selection, fill handle, column resize and reorder, virtualisation, formulas, taginfo, the way table itself, a multi-line cell editor.

## 2. Component boundary

All in `packages/ui/src/sheet/`. Nothing imports the renderer, the app or a module.

```
sheet/types.ts            public types (written first, by the orchestrator: it is the contract)
sheet/core/state.ts       SheetState, sheetReducer, selectors (pure)
sheet/core/keys.ts        actionForKey(state, key): SheetAction | 'native' | undefined (pure)
sheet/core/clipboard.ts   parseTsv, serializeTsv, planPositionalPaste, selectionText (pure)
sheet/tags/tags-clipboard.ts  parseTagText, serializeTags (pure)
sheet/tags/tags-rows.ts   rowsFromTags, planTagPaste, applyBatch, orderRows (pure; closes F-ui-18)
sheet/Sheet.tsx           the grid: roles, roving focus, delegated pointer/key/clipboard handlers
sheet/SheetRow.tsx, SheetCell.tsx   motion row, one <input> per cell, the cell-local draft
sheet/SuggestList.tsx, useSuggestions.ts   one floating list for the active cell; debounce, cancel, cache
sheet/SheetStatus.tsx     live region: paste result, refused lines, length counter of the active cell
sheet/tags/TagSheet.tsx   the Tags use, ready to mount: <TagSheet tags onChangeTags suggest ... />
```

```ts
export type RowId = string
export type ColId = string
export type CellRef = { row: RowId; col: ColId }

/** A cell's value. `mixed`: several selected features disagree; undefined in `values` = key absent. */
export type CellValue =
  | { kind: 'value'; text: string }
  | { kind: 'mixed'; values: { text: string | undefined; count: number }[] }

export type SheetCellData = {
  value: CellValue
  readOnly?: boolean
  /** A message makes the cell invalid (red, aria-invalid). The column's `validate` adds to it. */
  invalid?: string
  tone?: 'default' | 'muted' | 'differs' | 'changed'   // a fixed set, so every sheet looks alike
}
export type SheetRow = { id: RowId; label: string; cells: Record<ColId, SheetCellData>; readOnly?: boolean }

export type SheetSuggestion = { value: string; label?: string; hint?: string }
export type SuggestContext = { cell: CellRef; row: SheetRow; text: string }
export type Suggest = (ctx: SuggestContext, signal: AbortSignal) => SheetSuggestion[] | Promise<SheetSuggestion[]>

export type SheetColumn = {
  id: ColId
  header: string                 // always in the a11y tree; `showHeader` on the sheet hides it visually
  width: string                  // a grid track: '2fr', 'minmax(6rem,1fr)', '8rem'
  role?: 'rowheader'             // the way table's key column
  readOnly?: boolean
  mono?: boolean
  /** A text typed here that equals another row's text moves the focus to that row instead (tags: the key). */
  unique?: boolean
  /** Runs on the committed text and on the draft. Returns a message when invalid. Never changes the text. */
  validate?: (text: string, row: SheetRow) => string | undefined
  /** Applied on commit (trim, NFC). Must not shorten: over-long text stays and is invalid. */
  clean?: (text: string) => string
  suggest?: Suggest
  suggestDelay?: number          // ms; 0 for local lists, 300 for anything that makes a request
}

export type SheetChange =
  | { type: 'set'; row: RowId; col: ColId; text: string }
  | { type: 'clear'; row: RowId; col: ColId }
  | { type: 'insert'; row: RowId; cells: Record<ColId, string> }   // the id is minted by the sheet
  | { type: 'remove'; row: RowId }
export type SheetBatch = {
  cause: 'edit' | 'suggestion' | 'paste' | 'cut' | 'delete' | 'fill'
  changes: SheetChange[]        // never empty; ONE batch per gesture = one undo step in the host
}

export type PasteReport = { added: number; replaced: number; unchanged: number; refused: { line: number; text: string; reason: string }[] }
export type SheetClipboard = {
  /** Text for the selected cells, row by row. */
  serialize: (rows: SheetRow[], cols: ColId[]) => string
  /** What a paste does. Positional sheets use planPositionalPaste; the tags use planTagPaste. */
  plan: (input: { text: string; rows: SheetRow[]; columns: SheetColumn[]; anchor: CellRef; selection: CellRef[]; editing: boolean; newRowId: () => RowId })
    => { changes: SheetChange[]; report: PasteReport; focus?: CellRef } | 'native'
}

export type SheetProps = {
  label: string                          // aria-label of the grid
  columns: SheetColumn[]
  rows: SheetRow[]                       // controlled; ids stable for the life of a row
  onChange?: (batch: SheetBatch) => void // absent: the whole sheet is read-only
  clipboard?: SheetClipboard             // default: tab-separated, positional
  trailingRow?: boolean                  // an empty row is always last; its first commit is an `insert`
  showHeader?: boolean
  rowActions?: (row: SheetRow) => ReactNode   // buttons at the row's end (remove, "fill row"), REVEAL style
  onUndo?: () => void; onRedo?: () => void    // Cmd+Z in navigation mode, see section 4
  describePaste?: (report: PasteReport) => string  // live message; default counts cells
  orderToken?: string                    // changes when the host re-sorted: the only layout-animation trigger
}
```

Core state (never changes on a keystroke; the draft lives in the editing cell):

```ts
export type SheetState = {
  active: CellRef | null
  anchor: CellRef | null           // the range is the rectangle anchor..active, in the rows' current order
  rowsSelected: boolean            // the range was made with a row handle or Shift+Space: whole rows
  mode: 'navigate' | 'edit'
  editStart: 'replace' | 'keep'    // typing replaces, Enter/F2/double click keeps and puts the caret at the end
  tabOrigin: ColId | null          // where a run of Tabs began: Enter returns to it on the next row
  trailingId: RowId; nextId: number
}
export type SheetAction =
  | { type: 'activate'; cell: CellRef; extend?: boolean } | { type: 'move'; dx: -1|0|1; dy: -1|0|1; extend?: boolean; edge?: boolean }
  | { type: 'selectRows'; from: RowId; to?: RowId } | { type: 'selectAll' } | { type: 'collapse' }
  | { type: 'startEdit'; how: 'replace' | 'keep' } | { type: 'endEdit'; then: 'stay' | 'down' | 'up' | 'next' | 'previous' }
  | { type: 'rowsChanged'; rowIds: RowId[] }   // keeps `active` on its row id, else clamps to the same index
export function sheetReducer(state: SheetState, action: SheetAction, shape: { rowIds: RowId[]; colIds: ColId[] }): SheetState
export function commitEdit(state, shape, rows, columns, text): { batch?: SheetBatch; focus?: CellRef }   // `unique` and the trailing row live here
export function clearSelection(state, shape, rows, columns): SheetBatch | undefined                        // Delete; `cause: 'delete'`
```

The host supplies rows, columns, the meaning of a batch, the clipboard plan and the suggestion providers. The sheet owns focus, selection, edit mode, the trailing row and the animation.

## 3. The two uses

### (a) Tags (`TagSheet`)

Columns `key` (`unique`, mono, `2fr`) and `value` (`3fr`); `trailingRow`; no visible header. `tags-rows.ts` keeps `{ idByKey: Map<string, RowId>; order: RowId[]; incomplete: { id: RowId; key: string }[] }` in a `useReducer` beside the sheet and turns a batch into ONE `(tags) => tags`, which `Inspector.tsx` gives to `engine.setTags(id, next, 'Changed tags')`: one undo step (today's `setTag` per key would make five steps for a five-line paste).

| Case | Rule | iD |
| --- | --- | --- |
| Typing a key that exists | The edit is put back and the focus goes to the existing row's value, selected. No merge. | same (`keyChange`, read) |
| Renaming a key | One batch: `set` on the key cell. The adapter writes remove old, add new with the old value, and moves the row id to the new key, so the row is not remounted and does not move. | same (`{ oldKey }`, read) |
| Emptying the key | Removes the tag. | same (read: `changeTags` skips the empty key, the old key is `undefined`) |
| Emptying the value | The tag leaves the data (Maid never writes an empty value: `engine.setTag` deletes on `''`), but the row stays as an *incomplete* row (key shown, value empty, muted) until the focus leaves the sheet; typing a value brings the tag back. | differs: iD keeps `key=` with an empty value in the data (read). See question 2 |
| New row | The key alone gives an incomplete row (no change to the data). Key and value: one batch, the tag is added. | iD writes `key=` at once (read) |
| Paste, key exists | The value is replaced ("override"). Equal value: counted as unchanged. | iD's list view has no paste handler at the pinned commit (read: no `paste` in `modules/ui`); its text view replaces all tags |
| Paste, key new | Added ("add"). A paste never removes a tag. | – |
| Paste, key twice | The last line wins; the earlier one is listed as replaced by line n. | text view: same (object assignment, read) |
| Sort | Alphabetical (`localeCompare`, as `TagList` today) when a feature is selected. After that a row never moves while the focus is inside the sheet, except after a paste, which sorts at once. New and renamed rows are sorted in when the focus leaves the sheet. Every re-sort changes `orderToken` and is animated. | iD sorts only on select; new keys stay last (#5857, read) |
| Read-only | `readOnlyKeys?: (key) => boolean` and the whole sheet when `onChangeTags` is absent (a filter made the feature read-only). Navigable and copyable, never edited, pasted over or deleted; a paste counts them as refused. | `readOnlyTags` regexes (read) |
| 255 limit | `validate` on both columns with `excessOf`/`tooLongText`: the cell is red (`LIMITED`), the text is never cut. The counter (`lengthNotice`) of the active cell shows in `SheetStatus`. Saving is blocked by the existing `osm-api-limits` rule (whether it covers keys: not checked). | iD cuts at 255 (read, `cleanTagValue`); ADR 0009 #5 overrides |
| Mixed | Value cell `{ kind: 'mixed' }`: placeholder "Multiple values", italic, the existing values as the first suggestions (with "(empty)" for features without the key). Committing an empty draft changes nothing. Copy writes `key=*`; pasting `*` onto a mixed cell changes nothing. | same (read) |
| A value with a line break | Shown with `↵`, read-only in the cell (an `<input>` would drop the break), still copied, pasted and removed whole. | iD's input drops it (inferred) |

### (b) Way as a table (later, in the Radnetz editor's dock)

Rows are tag keys: the union over the segments, in the order of the selected segment's sorted keys, then the others' sorted, fixed until the selection changes. Columns: `key` (`role: 'rowheader'`, read-only except in the trailing row) and one column per segment (previous, selected, next; header = name or id; the selected one marked). A cell is that segment's value for the key; `set`/`clear` on it writes that segment's tag; a batch that touches several segments is one combined undo step. `tone: 'differs'` where a value is not the selected segment's. `suggest` for a segment column returns the distinct values of the same row in the other columns (local, `suggestDelay: 0`), then the same value provider the Tags use. Fill a row: `rowActions` gives "Use for all segments", which the host turns into one batch; with the keyboard, copy one cell, Shift+arrows, paste (a single value fills the range). Clipboard: the default tab-separated positional one.

Shared: cells, focus, selection, edit, suggestions, the batch, validation, tones, row animation, the status line. Per use: columns, the clipboard plan (records by key against positions), `unique`, the trailing row, the header, row actions.

Needed by (b) and left out because it would bend (a): columns that come and go with animation, a sticky first column with horizontal scroll, a column header that selects its way on the map, "absent" against "empty" shown differently in a cell, column selection. The table can live with a fixed column list per selection and the dock's own scroll; add these when it is built, as options that default off.

## 4. Interaction

Every cell is a real `<input>`: `readOnly` in navigation mode (caret hidden), writable in edit mode. That is the whole answer to the editor's shortcuts: `useHotkeys(keys, { ignoreInputs: true })` skips an event whose target or focused element is an `HTMLInputElement`, and `FavouriteHint` and the menu key test `tagName === 'INPUT'`. A focusable `div` cell would let `M`, `R`, `1`, `Delete` (deletes the feature) and the arrows (pan the map) through. The cost: Cmd+Z does not reach the editor while a cell has the focus, so the sheet handles it (`onUndo`, `onRedo`).

| Key or gesture | Navigation mode | Edit mode |
| --- | --- | --- |
| Click | Activates the cell; a click on the active cell starts editing (keep) | Places the caret |
| Double click, Enter, F2 | Edit, text kept, caret at the end | Enter: commit, go down in the column the Tab run began in (key, Tab, value, Enter lands on the next key) |
| Typing a character, or IME start | Edit, text replaced: the handler sets `input.readOnly = false` and selects all before the key's default action, so dead keys and IME work | types |
| Escape | Collapses a range to the active cell; else nothing | Puts the value back, closes the list first if open; `stopPropagation` as `DraftInput` |
| Tab, Shift+Tab | Next or previous cell, wrapping over rows. From the empty trailing row Tab leaves the sheet forward, from the first cell Shift+Tab leaves it backward (no keyboard trap) | Commit (or take the highlighted suggestion), then the same |
| Shift+Enter | Up | Commit, up |
| Arrows | Move the active cell | Left and right move the caret; Up and Down move in the suggestion list when it is open, else commit and move |
| Cmd/Ctrl+arrows, Home, End | To the edge of the row or column | native |
| Shift+arrows, Shift+click, drag | Extend the range from the anchor | native text selection |
| Row handle (left gutter); Shift+Space | Selects the row; drag or Shift+click selects rows | – |
| Cmd/Ctrl+A | All rows (not the trailing one). Bound on the grid only | All text of the input |
| Cmd/Ctrl+C | `clipboard.serialize` of the range | native |
| Cmd/Ctrl+X | Copy, then as Delete (`cause: 'cut'`) | native |
| Cmd/Ctrl+V | `clipboard.plan` (section 6): one cell, a range (a single value fills it; a block starts at its top left), the trailing row (appends). Wider than the sheet: the extra columns are not written and are named in the status line | native, unless the plan says otherwise (tags: a key cell and text with `=`, a tab or a line break) |
| Delete, Backspace | `clear` for each writable cell of the range, `remove` for whole rows; one batch | native |
| Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z, Ctrl+Y | `onUndo` / `onRedo` (the editor's undo). The active cell stays on its row id | The input's own undo, never the editor's |

A change of the cell's value from outside during an edit keeps the draft; the commit wins. Blur commits (as `useDraft`), clears the range and lets the host sort.

Touch (the phone layout): a tap activates and edits at once; the remove button of each row is always visible (`pointer-coarse:opacity-100`, as `REVEAL`); suggestions work; paste works through the system's paste menu in a key cell (the plan above), and the section gets a "Copy all" button from the host. Desktop only: range selection by drag, row handles, Shift and Cmd keys, cut.

## 5. Accessibility

- `div role="grid"` with `aria-label`, `aria-rowcount`, `aria-colcount`, `aria-multiselectable="true"`, `aria-readonly` when there is no `onChange`. Header row of `columnheader`s, visually hidden for the tags. Each row `role="row"` with `aria-rowindex`; cells `role="gridcell"` (or `rowheader`) with `aria-selected`, `aria-readonly`, and the `<input>` inside.
- Roving tabindex on the inputs (`tabIndex` 0 on the active one, -1 elsewhere), not `aria-activedescendant`: typing, IME and the phone keyboard need the real focus in the cell. The input's `aria-label` is "`<header>` of `<row.label>`" ("Value of highway"), which also keeps the existing check selectors' shape.
- A column with `suggest`: the input has `role="combobox"` all the time (a role that changes with the mode is announced twice), `aria-autocomplete="list"`, `aria-expanded`, `aria-controls` and `aria-activedescendant` pointing into the one `role="listbox"` (in a `FloatingPortal`, labelled "Suggestions for `<header>`"), options `role="option"` with `aria-selected`: the same wiring as `Combo.tsx`.
- Invalid: `aria-invalid` on the input and `aria-describedby` to the message in `SheetStatus`. Mixed: placeholder "Multiple values" and `aria-description` "3 different values".
- `SheetStatus` is `role="status" aria-live="polite"`: "5 tags pasted: 3 added, 2 replaced. 1 line skipped: line 4 has no value." It stays visible about 6 seconds (longer while it lists refused lines, with a close button), and it is the only place a refusal is shown: no toast in version 1 (ADR 0009 #19 is still open).

## 6. Paste and copy for the tags

`parseTagText(text): { entries: { key; value; line }[]; refused: { line; text; reason }[] }`, tried in this order:

1. The trimmed text starts with `{`: JSON. An object of strings is the tags; an object with a `tags` or `properties` object uses that. Numbers and booleans become text; `null`, arrays and objects are refused per key.
2. Else line by line (`\r\n` and `\n`). Skipped silently: empty lines, lines starting with `#` or `//`. One pair of surrounding `[` `]` is removed, and `][` splits a line into several (Overpass QL).
3. A line with a tab before any `=`: key, tab, value (a spreadsheet, the table on osm.org). Else the first `=` splits; the value may contain more `=`. Both sides are trimmed, then `"..."` is read as a JSON string (iD's `unstringify`, and what JOSM writes (inferred)), then `clean` (trim, NFC).
4. Refused, with a reason: no separator; an empty key; an empty value (never read as "remove"); a read-only key (in `planTagPaste`). Not refused: a key or value over 255 characters (written, red).

When the plan runs: in navigation mode with the anchor on a key cell, on whole rows or on the trailing row, always. On a value cell: a single line is that cell's value as it is (a URL with `=` stays a value) and fills a range of value cells; several lines are tags when every non-empty line parses, else refused whole ("Several lines cannot go into one value"). In edit mode: native, except in a key cell when the text has `=`, a tab or a line break. Then the open edit is dropped, the pasted rows are sorted in and the focus goes to the first pasted row's value.

Copy (`serializeTags`): whole rows or both columns give `key=value` lines joined by `\n`, no line at the end, in the order shown; key cells only give the keys, value cells only the values, one per line. A key or value is written as a JSON string in quotes when it contains `"`, `\`, a control character or a line break, and a key also when it contains `=` or starts with `#`, `[` or `/`. Mixed is `key=*`. Incomplete rows are left out. Plain text only.

Unit test table (existing tags `highway=residential`, `name=A`, unless said):

| # | Pasted text | Result |
| --- | --- | --- |
| 1 | `surface=asphalt` | insert surface=asphalt; "1 added" |
| 2 | `name=B` | set name to B; "1 replaced" |
| 3 | `name=A` | no batch; "1 unchanged" |
| 4 | `lit = yes` and `smoothness\tgood` (two lines) | insert lit=yes, smoothness=good |
| 5 | `"name"="Café \"Zur Post\""` | set name to `Café "Zur Post"` |
| 6 | `website=https://example.org/?a=1&b=2` | insert website with the full URL |
| 7 | `maxspeed=30`, empty line, `# note`, `maxspeed=50` | insert maxspeed=50; line 1 reported as replaced by line 4 |
| 8 | `{"lanes": 2, "oneway": "yes", "x": null}` | insert lanes=2, oneway=yes; x refused ("not a text") |
| 9 | `["highway"="primary"]["ref"="B 1"]` | set highway to primary, insert ref=`B 1` |
| 10 | `foo`, `=bar`, `baz=` (three lines) | no batch; three refused: no separator, empty key, empty value |
| 11 | `asphalt` with the anchor on name's value cell | set name to asphalt (positional, not parsed) |
| 12 | `note=` + 300 × `x` | insert note with all 300 characters; the cell is invalid |

## 7. Animation

- Rows are `motion.div` in one `AnimatePresence initial={false}`, keyed by `row.id`, with `layout="position"`, `layoutDependency={orderToken}` and `transition={UI_SPRING}`. Layout is a CSS grid per row with the same `grid-template-columns` from a custom property on the root; no `<table>` (layout animation on `tr` is unreliable).
- Animated: the re-sort after a paste and when the focus leaves the sheet; a row entering (opacity, and height from 0) and leaving (the reverse); a short background flash on rows a paste added or replaced (a CSS animation, keyed by a paste counter).
- Not animated: typing, the active-cell ring, the selection, the suggestion list's content, the first render for a newly selected feature (`TagSheet` is keyed by the feature id, so nothing flies in from the last feature).
- Reduced motion (`useReducedMotion`, as `Flyout`): `layout={false}`, rows appear and go without height or opacity, the flash becomes a static tint that goes after 1.5 s.
- Identity: the id belongs to the row, not the key. `tags-rows.ts` mints an id when a key first appears and moves it on a rename; the trailing row keeps its id when it becomes a real row and a new trailing id is minted. A key that goes and comes back through the editor's undo gets a new id (it enters again; accepted).
- The sidebar body scrolls (`Sidebar.tsx` line 150, `overflow-y-auto`): a layout animation inside a scrolled box measures wrongly unless that box is a `motion.div layoutScroll`. Part of step 4; check it with a scrolled sidebar. Also check the phone's bottom sheet does not resize the map when a row's height animates.

## 8. Performance

No virtualisation: at most about 80 × 2 or 40 × 5 inputs (under 250). What to avoid:

- A draft in the reducer or in `Sheet`: it is `useState` inside the editing `SheetCell`, with the validation and the suggestion query. A keystroke renders one cell and the list.
- Handlers per cell: pointer, key and clipboard handlers sit once on the grid root and read `data-row` and `data-col`. Cells get primitives (`selected`, `active`, `editing`) and their `SheetCellData`, so the React Compiler skips the rest. `rowsFromTags` must return the same cell objects for unchanged tags.
- A `useFloating` per cell: one `SuggestList`, anchored to the active input.
- Layout measuring on every render: `layoutDependency` limits it to a change of order.
- A request per keystroke: `useSuggestions` waits `suggestDelay`, aborts the previous `signal`, and caches per column, row context and text for the life of the sheet. A provider that makes requests uses 300 ms and at least 3 characters and returns nothing under `isAutomated()` (`fetching-audit.md` 5.7, 5.8). The local providers answer in the same tick.

## 9. Testing

Unit (`bun test packages/ui/src/sheet`):

- `state.test.ts`: move at every edge; wrap of Tab over rows and out of the sheet at both ends; extend with Shift; range after the rows were re-sorted; select rows and all; start edit (replace, keep); end edit with each `then`; the Tab-run origin for Enter; `rowsChanged` when the active row is gone; read-only cells are reachable and not editable.
- `commitEdit`: unchanged text gives no batch; `clean` applied; `unique` hit gives no batch and a focus; the trailing row's first commit is an `insert` with the minted id and a new trailing id; an over-long text is committed as typed.
- `clearSelection`: cells, whole rows, read-only skipped, an empty result gives no batch.
- `keys.test.ts`: the table of section 4, one case per row and mode.
- `clipboard.test.ts`: TSV with quotes, tabs and line breaks in quoted cells; a single value onto a range; a block at the right edge and past the last row; `selectionText` for a ragged selection.
- `tags-clipboard.test.ts`: the twelve rows of section 6; copy then paste gives no change for any tags, also with quotes, `=` in a key and a line break in a value.
- `tags-rows.test.ts`: the four iD todos of `id-raw_tag_editor.test.ts` (a row per tag, an empty pair for no tags, the empty pair last, remove); rename keeps the id and the value; the sort rules; incomplete rows; a five-line paste is one `(tags) => tags`; read-only keys; mixed.

Browser (`tools/bench/tags-check.ts`, `bun run check-tags [scene]`, lines as in `interactions-check.ts`). `runCheck` gets an option that calls `context.grantPermissions(['clipboard-read', 'clipboard-write'])`; the check writes with `page.evaluate((t) => navigator.clipboard.writeText(t), text)`, pastes with `page.keyboard.press('ControlOrMeta+V')` and reads with `page.evaluate(() => navigator.clipboard.readText())`. Data is read from `window.__maid`, focus from `document.activeElement`'s `aria-label`.

```
ok tags: a row per tag and an empty row last
ok tags: typing in the empty row adds one tag as one undo step
ok tags: a key that exists moves the focus to its value
ok tags: renaming a key keeps the value and the row's place
ok tags: paste of 5 lines adds 3, replaces 2, one undo step takes all back
ok tags: after the paste the rows are sorted, and the status says "5 tags pasted: 3 added, 2 replaced"
ok tags: Shift+Down twice then copy writes "highway=residential\nname=A\nsurface=asphalt"
ok tags: Delete on a selected row removes the tag
ok tags: M, 1 and the arrows in a cell do not reach the editor (mode browse, map centre unchanged)
ok tags: Cmd+Z in a cell undoes the last edit of the editor; in an open edit it undoes the typing
ok tags: a value of 300 characters is kept, the cell is invalid, the counter says 45 characters too long
ok tags: no request outside localhost
```

Unverified and to settle in step 4 with this check: that Chrome, Firefox and Safari send the `paste` event to a focused `readOnly` input (the plan relies on `onPaste` with `clipboardData`, which needs no permission). Fallback: Cmd+V on keydown reads `navigator.clipboard.readText()`.

## 10. Build plan

Briefs set the effort (Haiku high unless said), one folder each, no `package.json`, no index files, no commits.

| # | Step | Files | Proof | Runs with |
| --- | --- | --- | --- | --- |
| 0 | Contract: `types.ts` from section 2, the empty test files with the case names (orchestrator) | `sheet/types.ts` | `bun run check` | first |
| 1 | Core: reducer, `commitEdit`, `clearSelection`, key map | `sheet/core/state.ts`, `keys.ts`, tests | `bun test packages/ui/src/sheet/core` | 2, 3, 5 |
| 2 | Clipboard: TSV, positional plan, tag text parse and serialise | `sheet/core/clipboard.ts`, `sheet/tags/tags-clipboard.ts`, tests | `bun test packages/ui/src/sheet` (clipboard files) | 1, 3, 5 |
| 3 | Tags adapter: rows, ids, order, incomplete rows, `planTagPaste`, batch to tags; replaces the todos of `id-raw_tag_editor.test.ts` | `sheet/tags/tags-rows.ts`, test | `bun test packages/ui/src/sheet/tags` | 1, 2, 5 (uses 2's signatures from step 0) |
| 4 | React grid without suggestions: `Sheet`, `SheetRow`, `SheetCell`, `SheetStatus`, `TagSheet`; Motion; `layoutScroll` in the sidebar body (Sonnet medium if Haiku high stalls on focus handling) | `sheet/*.tsx`, `sheet/tags/TagSheet.tsx` | `bun run check`; then step 6's check | after 1 to 3 |
| 5 | Browser check written against the labels and roles of section 5; the clipboard option in `check-page.ts` | `tools/bench/tags-check.ts`, `tools/bench/check-page.ts` | it runs and fails only on missing UI | 1 to 3 |
| 6 | Switch over: `Inspector.tsx` mounts `TagSheet` with `engine.setTags`, `onUndo`/`onRedo`; delete `TagList`, `TagRow`, `AddTag`; export from `packages/ui`; the script and its row in AGENTS.md; tick F-ui-18 (orchestrator) | `apps/maid/src/components`, `packages/ui/src/index.ts`, `package.json` | `bun run check`, `bun run check-tags`, `bun run check-edit`, `check-undo`, `check-interactions` | after 4, 5 |
| 7 | Suggestions: `useSuggestions`, `SuggestList`; a local provider in `apps/maid` (keys and options the presets know, values already used in the loaded data); a `TagSuggestProvider` setting so taginfo can be added later behind the same type | `sheet/SuggestList.tsx`, `useSuggestions.ts` + test; `apps/maid/src/tag-suggestions.ts` + test | `bun test`, two more lines in `check-tags` | after 4; the provider part alongside 4 |
| 8 | Mixed state, once the multi-selection work has landed: `rowsFromTags` over several features, the batch applied to each | `sheet/tags/tags-rows.ts`, `Inspector.tsx` | `bun test`, a `check-tags` line | after 6 and the audit |
| 9 | Way table in the Radnetz editor's dock, with the options of 3 (b) | a module of `apps/radnetz-berlin` | its own check | later (D6) |

Not checked: whether another browser check selects the old tag inputs by something other than their labels (a grep for "New tag key" and "Value of" in `tools/` found nothing), and whether `maid-presets` exports a list of known keys (its index exports `createPresets` and types only; step 7 may need a small function there, in its own brief).

## 11. Open questions

1. **Row order.** (a) iD: sorted on select, new rows last until reselected. (b) Sorted on select; rows hold still while the focus is in the sheet; a paste sorts at once; the rest sorts when the focus leaves. (c) Always sorted. Recommend (b): the paste animation the idea asks for, and no row moves under the cursor.
2. **Emptying a value.** (a) iD: the tag stays with an empty value. (b) The tag is removed and the row goes. (c) The tag is removed, the row stays as an incomplete row until the focus leaves. Recommend (c): Maid never writes empty values today, and a row that vanishes while one retypes a value is a trap.
3. **Does a paste ever remove tags?** (a) Never: add and override only. (b) A "replace all" action beside it. Recommend (a); "select all, Delete, paste" covers (b) in two undo steps.
4. **iD's text view.** (a) Drop it: paste, copy and "Copy all" cover it. (b) Keep it as a second view. Recommend (a); it was the only way to paste in iD.
5. **A line `key=` in a paste.** (a) Refused and listed. (b) Removes the tag. Recommend (a).
6. **Key and value suggestions before taginfo is decided.** (a) None. (b) Local: the presets' keys and options plus values in the loaded data. (c) taginfo behind a setting. Recommend (b) now; (c) later through the same provider, off in automated runs.
7. **Click on a cell.** (a) Spreadsheet: the first click selects, the second or a typed character edits. (b) Form: one click edits (today). Recommend (a) with the pointer and (b) on touch.
8. **Tab.** (a) Spreadsheet: Tab moves through cells and leaves only at the two ends. (b) ARIA grid pattern: Tab always leaves, arrows move. Recommend (a): key, Tab, value, Tab is how tags are typed.
9. **Refused paste lines.** (a) In the status line under the sheet. (b) As a toast once sonner is in. Recommend (a) now.
10. **Where it lives.** (a) `packages/ui/src/sheet`. (b) A package of its own (`maid-sheet`) for use outside Maid. Recommend (a) until the way table proves the API, then extract.
