# Mobile and touch audit, 2026-10-29

Maid checked against the FMC skill `touch-ipad-review` (its checklist `references/tailwind-touch-checklist.md`), plus what Tobias found on an iPhone. Two read-only passes by subagents (touch targets and hover; viewport, keyboard and map), then sorted here by what applies to Maid. Nothing below was run on a phone unless it says so: claims marked _inferred_ are browser behaviour, the rest was seen in the code.

## Done in this round

| What                                                    | Where                                                                                                                       |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Filter count no longer cut off in the top bar           | `packages/ui/src/TopBar.tsx` (`SCROLL_X`): measured at 402 px wide in Chromium                                              |
| No zoom into fields on iOS                              | `packages/shell/src/styles.css`: fields 16 px when there is no fine pointer. No `maximum-scale=1` (blocks pinch on Android) |
| No double-tap page zoom                                 | `styles.css`: `html { touch-action: manipulation }`; the map canvas keeps MapLibre's own value                              |
| Texts for the device                                    | `packages/i18n/src/device.ts`, message variants by `input` and `os`, `device-words.test.ts`                                 |
| Flyouts focus the panel, not a field, on touch          | `packages/ui/src/Flyout.tsx`, `auto-focus.ts`                                                                               |
| Type picker inside the sheet on a phone                 | `packages/ui/src/Sidebar.tsx` (`SidebarHeader`)                                                                             |
| The sheet opens only by its button                      | `packages/shell/src/App.tsx`, `packages/ui/src/Shell.tsx` (button 56 px)                                                    |
| The dock is a bottom sheet with a grab row on a phone   | `packages/ui/src/Dock.tsx`                                                                                                  |
| Disabled button no longer bends a group's divider       | `packages/ui/src/Tooltip.tsx` (`DISABLED_WRAP`), `Toolbar.tsx` (`JOINED`)                                                   |
| Move handle for the selected feature on touch (as react-map-gl-draw's) | `packages/shell/src/components/MoveHandle.tsx`, `move-handle.ts`; `bun run check-move-handle` |
| A spinner before the code has loaded                    | `apps/*/index.html`                                                                                                         |
| `calc(2rem+env(…))` without spaces around `+`           | `packages/ui/src/Shell.tsx`: written `calc(2rem_+_env(…))`                                                                  |

## Open: worth doing

Ranked by how much they hurt on a phone.

1. **Actions that only appear on hover** are invisible on touch but still tappable, so a blind tap can delete: custom background Edit/Delete (`packages/module-imagery/src/ImageryPanel.tsx:469`), remove relation member (`packages/shell/src/modules/relations-column.tsx:582`), favourite move up/down (`packages/ui/src/inspector/PresetPicker.tsx:347`), member drag handle (`relations-reorder.tsx:165`). Fix: `pointer-coarse:opacity-100`, or the existing `REVEAL` class (`packages/ui/src/inspector/fields/shared.ts`).
2. **Context menu rows are 28 px** (`packages/ui/src/ContextMenu.tsx`, `ROW = 28`, also used for placement in JS). It holds Delete and Merge and opens on a long press. Fix: 44 px rows on coarse pointers, `ROW` read from the same media query.
3. **The keyboard covers fields in the bottom sheet** (_inferred_): no `visualViewport` handling, no scroll into view on focus (`packages/ui/src/BottomSheet.tsx`). Fix: on `focusin` scroll the field into view; better, size the sheet from `visualViewport.height`.
4. **Small targets without a coarse size**: the inspector's 28 to 32 px fields and buttons (`FRAME`, `ICON_BUTTON`, `Radio`, `Link`, `AddField`), 20 to 24 px icon buttons (`ROW_BUTTON`, info, toast close, sign rows), turn chips of 24 px (`JunctionDiagram.tsx:232`), the 8 px resize handle. Toolbar and map controls grow to 40 px on touch, not 44. Fix: `pointer-coarse:size-11` where the layout allows, else a larger hit area with `before:absolute before:-inset-3`.
5. **No press feedback**: there is no `active:` style anywhere; hover never fires on touch, so a tap shows nothing. Fix: `active:` colours in `toolButtonTone`, `ICON_BUTTON` and the list rows; `-webkit-tap-highlight-color: transparent` with it.
6. **Why a command is disabled** is only in `title` (`ContextMenu.tsx`), which a touch device never shows. Fix: the reason as small text under the row.
7. **Height of the page** (_inferred_): `height: 100%`, no measured `--app-height`; Chrome and Firefox on iOS do not follow `dvh`. Fix per checklist 4b once a device shows the strip or the jump.
8. **Safe areas**: without `viewport-fit=cover` every `env(safe-area-inset-*)` is 0, so the code's insets do nothing. Decide: stay inside the safe area and drop them, or add `viewport-fit=cover` and pad the floating controls.

## Open: smaller

- Press and drag in lists highlights nothing (rows highlight on hover and on the keyboard's index only): `onPointerMove` sets the active row.
- `select-none` and `-webkit-touch-callout: none` on buttons once in `styles.css`, so a long press on a label selects no text.
- `overscroll-contain` on the dock, the flyouts and the search results; `max-h-[60vh]` in search and the route overview counts the large viewport on iOS.
- Toasts at the top right cover Save and the account on a phone: bottom centre below `sm`.
- `a[href]` has no pointer cursor (desktop only).

## Checked and fine

- Tailwind 4 puts `hover:` inside `@media (hover: hover)`, so hover styles do not stick after a tap.
- No Headless UI or Radix: every list is our own (bucket B of the checklist).
- The map: MapLibre sets `touch-action: none` on its canvas; rotation and pitch are off; long press opens the edit menu (`packages/shell/src/long-press.ts`).
- The top bar measures its rows, so iPad Split View widths need no breakpoint.
- Drag handles have `touch-none`; the sheet's body has `overscroll-contain`.
