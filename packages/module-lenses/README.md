# Lenses module (`@osm-editor-kit/maid-module-lenses`)

Map style: a lens restyles the map for one mapping theme or quality check, for example roads by their surface. A lens is data, not code, so it can be imported and exported as a file. The module adds a "Map style" flyout in the top bar and the URL parameter `lens`.

`lenses(options?)` is the module. `options.lenses` adds the app's own lenses next to the built-in ones. `options.defaultLook` says what the "None" entry shows when the app's own look adds to iD's style.

## What a person sees / can do

- "Map style" in the top bar: a list of lenses with "None" first. Choosing one restyles the map. The chosen lens is remembered for the next visit.
- The built-in lenses: **Surface** (roads and paths by `surface`), **Lit** (by `lit`) and **Max speed** (roads by bands of `maxspeed`, in km/h and mph). Each has a legend.
- A legend for the chosen lens. Anything no rule matches is dimmed, or left as usual when the lens says so.
- The map display choice (normal, wireframe, changes in colour) sits in the same flyout.
- "Import" reads a lens file (JSON with one lens or a list, at most 256 KB). A problem is a plain sentence that names the place in the file. "Export active" and "Export all own" download JSON.
- URL parameter `lens=<id>` names the lens on the map. `lens=none` is no lens and a link can say it. A link never changes the stored choice.

## Using it in an editor's config

```ts
import { lenses, lensChoice } from '@osm-editor-kit/maid-module-lenses'

// in the modules list (maid, maid-indoor: no own lenses):
lenses(),
// maid-parking, maid-lanes: the app's lens is added
lenses({ lenses: [parkingLens] }),
// maid-bicycle: its own lens and what "None" says
lenses({ lenses: [bikeInfrastructureLens], defaultLook: bikeDefaultLook }),
// another module that reads the chosen lens (parking, lanes, bicycle infrastructure):
parking({ lenses: lensChoice }),
```

All five apps call `lenses()`, with or without options. The lens is applied by the renderer (`engine.setLens`). Tailwind needs `@source '../../module-lenses/src';` in `packages/shell/src/styles.css` (listed there).

## Parts

| File | What it does |
| --- | --- |
| `src/module.tsx` | `lenses()`: sets the built-in and the app's lenses, the URL parameter, the panel and the URL sync on `map.content` |
| `src/builtin.ts` | The three built-in lenses (`surfaceLens`, `litLens`, `maxspeedLens`) as plain data |
| `src/lens-file.ts` | Reading and writing lens files (`parseLensFile`, `serialiseLenses`, `MAX_FILE_BYTES`) |
| `src/lens-store.ts` | The lens state (zustand): built-in, imported, the chosen one (`maid:lenses`) and the one on the map. `lensChoice` is the read for other modules |
| `src/sync.ts`, `src/url.ts` | Keeps the `lens` URL parameter and the lens on the map in step (`useUrlSetting`) |
| `src/default-look.ts` | The "None" entry's description and legend (`DefaultLook`) |
| `src/LensPanel.tsx`, `src/LegendSwatch.tsx` | The flyout, the legend, the import and export buttons, the legend's pictures |

The lens type and the matching live in `packages/style` (`src/lens.ts`), so the renderer and the other modules use one definition.

## Tests

`bun test packages/module-lenses`: the built-in lenses, lens file reading and writing (valid files, the messages for broken ones), the store (stored choice, what a stored value that does not fit does), and the URL parameter round trip.

## More

- [Styles and lenses](../../docs/architecture/07-styles-and-lenses.md): a lens as a second style, the legend, the open points.
- [Step D5 in the build-out steps](../../docs/build-out/steps.md): what was built and the test for Tobias.
- [URL state audit](../../docs/research/url-state-audit.md): the `lens` parameter and the stored lenses (S16, S17, S-8).

## Open

- Points cannot be recoloured, and labels and pins are not dimmed (step D5).
- The style export for an external editor is not built (`docs/architecture/07-styles-and-lenses.md`).
- The built-in legends and the module's labels are English only (`docs/build-out/steps.md`, "Texts not through Paraglide").
