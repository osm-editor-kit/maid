# List rows

One row behaviour for every list. The classes live in `packages/ui/src/inspector/listbox.ts` (exported from maid-ui): `ROW_BASE`, `ROW_HOVER`, `ROW_CURRENT`, `ROW_ACTIVE`, `ROW_FOCUS` and `listRow({ current, active })`, which never gives a row two backgrounds.

- **current**: the value in use. Blue background over the whole row, trailing buttons included.
- **hover**: a lighter grey background over the whole row.
- **active**: the option the keys are on (`aria-activedescendant`, or focus in a menu). Grey background plus an inset blue ring; on a current row the ring is added to the blue.
- The background sits on the row's outer element. Trailing buttons stay their own `<button>`s inside its padding; `ICON_BUTTON` hovers one step darker (10 / 20 %) so a button's own hover shows on the row's.

| List | current | active | hover | Changed |
| --- | --- | --- | --- | --- |
| Type picker rows (`PresetPicker`) | the feature's type (`currentId`); the "current" badge stays | arrow-key row | grey | background moved from the inner option to the outer row, so the star, move buttons and number are inside it; members indent with a margin |
| Picker category and Favourites rows | none | arrow-key row | grey | same wrapper |
| `AddField` flyout | none | arrow-key row | grey | `listRow` |
| Favourites panel | none (the geometry button of the favourite stays highlighted) | none | grey | `listRow({})` on the `li` |
| Search results (`SearchButton`) | none | row under the keys or pointer (was solid blue with white text) | grey | `listRow` |
| Area dropdown (`ModeButtons`) | the tool under way, with check and semibold (was none) | keyboard focus, ring | grey (was solid blue) | shared constants |
| Edit menu and stack list (`ContextMenu`) | `item.current` (was only semibold) | keyboard focus, ring | grey, enabled items only | shared constants |
| Surface picker (`module-surface` field) | the chosen value (was a ring) | arrow-key row (was a darker grey), ring | grey | `listRow({ current, active })` |
| Sign search (`traffic-sign-field`) | none | `aria-selected` row, ring | grey | classes written out: the package does not depend on maid-ui and I may not edit `package.json`; keep them equal to `listbox.ts` |
| Combo, multi-combo, wiki and sheet suggestion dropdowns | none (the input holds the value) | arrow-key row | grey (new) | `listRow({ active })` |

Left out: the open relation's row (out of scope), the stack pill and the tool buttons (not list rows).
