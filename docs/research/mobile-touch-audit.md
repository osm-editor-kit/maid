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
| Inspector targets 44 px on a coarse pointer: fields, steppers, radio buttons, icon and label-bar buttons, Add field | `inspector/fields/shared.ts`, `icon-button.ts`, `Radio.tsx`, `Link.tsx`, `AddField.tsx` |
| Hover-only actions shown on touch (custom background, relation member, favourites order, member handle) | `touch:opacity-100` in each |
| Context menu rows 44 px on touch | `packages/ui/src/ContextMenu.tsx` (`TOUCH_ROW`) |
| Disabled button no longer bends a group's divider       | `packages/ui/src/Tooltip.tsx` (`DISABLED_WRAP`), `Toolbar.tsx` (`JOINED`)                                                   |
| Move handle for the selected feature on touch (as react-map-gl-draw's) | `packages/shell/src/components/MoveHandle.tsx`, `move-handle.ts`; `bun run check-move-handle` |
| Press feedback: `active:` colours on tool buttons, icon buttons, list and menu rows; no text selection or callout on a long press | `Toolbar.tsx` (`toolButtonTone`, `TAP`), `icon-button.ts`, `inspector/listbox.ts`, `ContextMenu.tsx` |
| Why a menu command is disabled: a second line under the row on touch | `packages/ui/src/ContextMenu.tsx` |
| The sheet sits above the on-screen keyboard and scrolls a focused field into view (_inferred_: no keyboard in Chromium) | `packages/ui/src/BottomSheet.tsx` (`coveredBottom`) |
| A spinner before the code has loaded                    | `apps/*/index.html`                                                                                                         |
| `calc(2rem+env(…))` without spaces around `+`           | `packages/ui/src/Shell.tsx`: written `calc(2rem_+_env(…))`                                                                  |

## Open: worth doing

Ranked by how much they hurt on a phone.

1. **Height of the page** (_inferred_): `height: 100%`, no measured `--app-height`; Chrome and Firefox on iOS do not follow `dvh`. Fix per checklist 4b once a device shows the strip or the jump.
2. **Safe areas**: without `viewport-fit=cover` every `env(safe-area-inset-*)` is 0, so the code's insets do nothing. Decide: stay inside the safe area and drop them, or add `viewport-fit=cover` and pad the floating controls.

## Open: smaller

- Press and drag in lists highlights nothing (rows highlight on hover and on the keyboard's index only): `onPointerMove` sets the active row.
- `select-none` and `-webkit-touch-callout: none` are on the tool, menu and radio buttons (`TAP`); a global rule in `styles.css` would cover the modules' buttons too.
- `overscroll-contain` on the dock, the flyouts and the search results; `max-h-[60vh]` in search and the route overview counts the large viewport on iOS.
- `a[href]` has no pointer cursor (desktop only).

## Checked and fine

- Toasts on a phone: full width below the top bar and the zoom buttons (`MOBILE_OFFSET` in `Toast.tsx`), so they cover neither Save nor the sheet.

- Tailwind 4 puts `hover:` inside `@media (hover: hover)`, so hover styles do not stick after a tap.
- No Headless UI or Radix: every list is our own (bucket B of the checklist).
- The map: MapLibre sets `touch-action: none` on its canvas; rotation and pitch are off; long press opens the edit menu (`packages/shell/src/long-press.ts`).
- The top bar measures its rows, so iPad Split View widths need no breakpoint.
- Drag handles have `touch-none`; the sheet's body has `overscroll-contain`.
