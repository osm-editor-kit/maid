# @osm-editor-kit/maid-ui

The components the shell is built from: layout, top bar, sidebar, map controls, dock, context menu, and the light, dark and system theme. An app puts its own content into them (see `packages/shell/src/App.tsx`).

| Piece | What it is |
| --- | --- |
| `Shell` | The layout: top bar, sidebar on the left, the map area with the dock under it |
| `TopBar`, `Brand` | Three areas; the centre stays centred |
| `ToolGroup`, `ToolButton` | Joined buttons for the top bar, with label, shortcut and pressed state |
| `Sidebar`, `SidebarHeader`, `SidebarBody`, `SidebarSection`, `SidebarDisclosure`, `SidebarEmpty` | The inspector's frame |
| `MapControls`, `ControlGroup`, `ControlButton` | Buttons on the map, top right |
| `Dock` | Tabs under the map that open a panel; its height is dragged from the top edge and animates open and closed |
| `Tooltip` | Label, shortcut and description on hover or focus, for one element; a disabled element is wrapped in a span so it still gets the hover |
| `CommandBar`, `CommandItem` | Icon-only commands in one hairline-joined group; a command with a `reason` is greyed out and shows the reason |
| `ResizeHandle`, `useResizable` | A drag strip on the right edge of the sidebar or the top edge of the dock, with the size kept in the settings |
| `FadeSlideIn`, `UI_SPRING` | The house spring for chrome, and a slide-and-fade entrance |
| `ThemeSwitch`, `initTheme`, `useAppliedTheme`, `useThemeInEffect` | Light, dark or system. The shell keeps the choice in the URL (`theme`) and the browser. Dark mode is the class `dark` on `<html>` |
| `InspectorSections` | Draws the `inspector.section` extension point, which this package declares |

## What an app has to do

- Tailwind has to see the classes of this package and use the class for dark mode. In the app's CSS:

  ```css
  @source '../../../packages/ui/src';
  @custom-variant dark (&:where(.dark, .dark *));
  ```

- `initTheme(fromLink)` applies the theme before the first render; the shell's `mountEditor` calls it with the link's `theme`, so a link's theme paints first.

## Where the look comes from

The class lists follow Tailwind Plus and Catalyst (zinc palette, hairlines as translucent borders, focus rings). Components are copied and adapted under the Tailwind Plus licence; the kit itself is not part of this repository.

The tooltip, the resize handle and the resize hook follow the author's app tilda-geo (its shared `Tooltip`, the panel resize handle and the mode panel width hook), adapted to this palette and to panels on the left and bottom edges.

## Open

- `inspector.section` hands a module the renderer's `EntityInfo`, so this package depends on `maid-renderer` for that one type. It should become a type that both packages take from the headless side.
- The dock's views and the top bar's tools are fixed by the app. They become extension points when the first module needs them.
- Theme and panel sizes are one Zustand store with `persist` and a version (`settings.ts`). It becomes the editor's settings store with the agreed precedence (default, config, stored, URL, user) in step C1.
