# UI design

Status: direction set by Tobias on 2026-10-11: a modern web-app look with Tailwind components, light and dark mode, and none of iD's old styling. The reference is our licensed Tailwind Plus material (Catalyst UI kit and the Plus component catalogue).

## Using the kit

Tobias, 2026-10-11: there is a proper Tailwind Plus licence, and the components are used and distributed, with our modifications, in our open-source projects, as has been done for years.

So Catalyst and Plus components are **copied into Maid and adapted**, the way the kit is meant to be used and the way the folder's own README describes (copy components into the project, do not depend on the kit). What still holds from the licence text: the kit itself is not republished. No package or repository whose purpose is to hand out the components. `packages/ui` is part of an editor, not a component library for others.

Copied components get a row in `NOTICE.md`.

## Design traits to carry over

Described from the kit, in words:

- **Neutral scale plus one accent.** Zinc neutrals in Catalyst, one accent colour. Hover and active states are thin alpha overlays, not different solid colours.
- **Hairlines instead of borders.** Cards and menus sit on a 1 px ring at about 5% alpha (10% in dark) with a soft shadow. Controls have a 10% alpha border.
- **Compact on desktop.** Controls about 32 px high, body text 14 px on a 24 px line, labels medium weight, metadata 12 px. Larger touch targets on small screens.
- **Radius** 8 px on cards and controls, fully round on badges and avatars.
- **Focus** as a 2 px outline with offset on buttons and an inset ring on inputs, shown for keyboard focus only.
- **Little motion.** Short enter and leave transitions, nothing decorative.
- **Type:** Inter.

## Light and dark

Tailwind 4, class strategy, so the user can choose and the system is only the default:

1. `@custom-variant dark (&:where(.dark, .dark *));` in the main stylesheet.
2. A few lines in `index.html` that set `.dark` on `<html>` before first paint, from the stored setting; for "system" from `prefers-color-scheme`, listening for changes.
3. `color-scheme` on the root so native controls and scrollbars follow.
4. The setting has three values: light, dark, system. It is a stored preference with no URL layer ([storage and settings](09-storage-and-settings.md)).

The map is a separate question from the chrome. iD's data colours were designed for dark imagery. With no background Maid draws on black in both modes today. Whether light mode gets a light map background, and whether iD's colours hold up on it, needs a look with real imagery.

## The parts of the app, and what the kit offers

| Part | From the kit | Missing in the kit |
| --- | --- | --- |
| Top toolbar: add point, line, area; undo, redo; save with count | Navbar, buttons and button groups, badge, dropdown | Tooltips, keyboard hints on icon buttons |
| Inspector (left): preset header, fields, raw tags | Fieldset, input, select, combobox, listbox, checkbox, radio, switch; table (dense) for tags; description list for metadata | A dense property grid. The kit's inputs are form-sized |
| Panes (right): background, map data and filters, issues, preferences, help | Drawers from the Plus catalogue | Resizable panels |
| Status bar | Nothing; text and dividers | A status bar |
| Dock (bottom): table of ways | Table with dense and grid options | Resizable height, virtualised rows |
| Dialogs: upload, conflicts | Dialog, alert | |
| Toasts | Notifications from the Plus catalogue | |
| Shortcut help | Dialog, description list, shortcut labels | A `kbd` style |
| Command palette (new for an OSM editor) | Command palettes in the Plus catalogue: a combobox in a dialog | Fuzzy search needs checking |

What a map editor needs and no kit like this has: toolbars and panels that float over a canvas, split and resizable panes, tree views for relations, tooltips, and density. Those are ours to design, in the same visual language.

## Building blocks

- **Headless UI** for behaviour (menus, dialogs, comboboxes, listboxes), as the kit does. Version 2.2 supports React 19. It brings Floating UI and TanStack Virtual, which cover tooltips and long lists.
- **Heroicons** for interface icons. Preset icons stay the icon sets iD uses.
- **`tailwind-merge`** with `twJoin` and `twMerge` for class composition, per the tech stack. (The kit uses `clsx`.)
- No `forwardRef`, no manual `useMemo` or `useCallback`: React 19 and the React Compiler, as in the kit's own conventions. Whether Headless UI and the compiler get along was not verified; the first component built with it will tell.
- oxfmt settings match the kit's folder. One difference: the kit leaves Tailwind class order as shipped; Maid sorts classes.

## Where components live

`packages/ui` for the generic ones (button, input, dialog, table, …), written once and used by the default editor and by forks' modules. Feature UI (inspector, panes, dock) is built from them in its own packages.

## Open

- The accent colour and whether a fork can set its own (it should: one CSS variable).
- The map background and data colours in light mode.
- How dense the inspector is. iD's is roomy; mappers who edit all day ask for less scrolling.
