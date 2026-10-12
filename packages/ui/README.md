# @osm-editor-kit/maid-ui

The editor's shell as React components: layout, top bar, sidebar, map controls, dock, status bar, and the light, dark and system theme. An app puts its own content into them (see `apps/maid/src/App.tsx`).

| Piece | What it is |
| --- | --- |
| `Shell` | The layout: top bar, sidebar on the left, the map area with the dock under it, status bar |
| `TopBar`, `Brand` | Three areas; the centre stays centred |
| `ToolGroup`, `ToolButton` | Joined buttons for the top bar, with label, shortcut and pressed state |
| `Sidebar`, `SidebarHeader`, `SidebarBody`, `SidebarSection`, `SidebarEmpty` | The inspector's frame |
| `MapControls`, `ControlGroup`, `ControlButton` | Buttons on the map, top right |
| `Dock` | Tabs under the map that open a panel |
| `StatusBar`, `StatusItem` | The line at the bottom |
| `ThemeSwitch`, `useTheme`, `initTheme` | Light, dark or system, kept in the browser. Dark mode is the class `dark` on `<html>` |
| `InspectorSections` | Draws the `inspector.section` extension point, which this package declares |

## What an app has to do

- Tailwind has to see the classes of this package and use the class for dark mode. In the app's CSS:

  ```css
  @source '../../../packages/ui/src';
  @custom-variant dark (&:where(.dark, .dark *));
  ```

- Call `initTheme()` before the first render.

## Where the look comes from

The class lists follow Tailwind Plus and Catalyst (zinc palette, hairlines as translucent borders, focus rings). Components are copied and adapted under the Tailwind Plus licence; the kit itself is not part of this repository.

## Open

- `inspector.section` hands a module the renderer's `EntityInfo`, so this package depends on `maid-renderer` for that one type. It should become a type that both packages take from the headless side.
- The dock's views and the top bar's tools are fixed by the app. They become extension points when the first module needs them.
- The theme is kept in `localStorage` directly. It moves to the settings store when there is one (step C1).
