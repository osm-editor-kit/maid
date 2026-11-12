# Lenses module (`@osm-editor-kit/maid-module-lenses`)

Map style: a lens restyles the map for one mapping theme or quality check, for example roads by their surface. A lens is data, not code, so it can be imported and exported as a file. The module adds a "Map style" flyout in the top bar and the URL parameter `lens`.

`lenses(options?)` is the module. `options.lenses` adds the app's own lenses next to the built-in ones. `options.defaultLook` says what the "Maid standard" entry shows when the app's own look adds to iD's style. `options.editorDefault` names the lens that is the editor's own standard: it is listed right under Maid standard, its name says "Standard: …", and it is switched on at the first visit (not under automation).

## What a person sees / can do

- "Map style" in the top bar: "Maid standard" first (no lens: the look every Maid editor shares), then the editor's own standard if it has one (for example "Standard: Parking"), then the other lenses. Choosing one restyles the map. The chosen lens is remembered for the next visit, Maid standard as well.
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
// maid-parking, maid-lanes: the app's lens is added and is the editor's standard
lenses({ lenses: [parkingLens], editorDefault: 'parking' }),
// maid-bicycle: its own lens as the standard, and what "Maid standard" says (it draws the infrastructure too)
lenses({ lenses: [bikeInfrastructureLens], defaultLook: bikeDefaultLook, editorDefault: BIKE_LENS_ID }),
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
| `src/default-look.ts` | The "Maid standard" entry's description and legend (`DefaultLook`) |
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
