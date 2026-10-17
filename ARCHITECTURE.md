# Architecture

How Maid is built and where to change it. Start here, whether you are a person or an agent new to the repo. This file
describes what is built today. Rules for working here (fixtures only, scripts, subagents) are in [AGENTS.md](AGENTS.md).
Why things are the way they are is in [docs/adr/](docs/adr/README.md). The deeper chapters are in
[docs/architecture/](docs/architecture/README.md).

## The idea in one paragraph

Maid is one central editor core and several small editors built on it. An **editor** is an app folder in `apps/` with
one config file, `src/maid.config.ts`, that names its **modules**, **presets** and **filters**. Everything an editor
needs beyond the core lives in a **Maid module**, a package in `packages/module-*`. A module adds things to fixed places
(**extension points**). It never patches the shell or the renderer. If an editor needs a new place, the core gets a new
extension point, in a small commit of its own. Modules are added in code at build time, never from the UI or a URL.

```
apps/maid-parking/src/main.tsx      mountEditor(root, app)
apps/maid-parking/src/maid.config.ts  app: AppConfig  ──editor(config)──▶  EditorConfig { modules, presets, filters }
packages/shell      mountEditor, createShell: URL settings, login, save, layout, built-in modules
packages/core       createEditor: modules, extension points, hooks, URL parameters, data loading
packages/module-*   the modules an app switches on
```

## Folders

```
apps/maid, maid-bicycle, maid-parking   the editors: maid.config.ts, presets.ts, main.tsx, vite.config.ts, env files
apps/compare         Maid, iD and Rapid side by side
packages/            the packages below
tools/mock-osm-api   local stand-in for the OSM API, serves the fixtures
tools/refs, tools/bench, tools/checks   pinned iD and Rapid, the benchmark, the browser checks
tools/deploy         the GitHub Pages build
fixtures/            frozen OSM data (ODbL, © OpenStreetMap contributors)
docs/                steps, research, decisions, architecture chapters, upstream drafts
reports/             output of benchmarks and checks (mostly git-ignored)
```

## Packages

| Layer | Packages | What they hold |
| --- | --- | --- |
| Data | `model`, `journal` | Entities, graph, history and undo, spatial index (ported from Rapid, [chapter](docs/architecture/05-data-store.md)); unsaved edits in IndexedDB |
| Headless rules | `presets`, `filters`, `validation`, `operations`, `routing` | Presets on the iD tagging schema, editable/read-only/hidden filters, validation rules and fixes, edit operations, the reroute router. No React, no map |
| Core | `core` | `createEditor`, `defineModule`, registries for extension points, hooks, module URL parameters, fetching |
| Map | `renderer`, `style` | Features to MapLibre layers, drawing and dragging (the engine), iD's look as data |
| Interface | `ui`, `shell`, `i18n` | Components and inspector fields; the shell that mounts an app; Paraglide texts |
| Modules | `module-*` | Imagery, street-level images, data layers, notes, lenses, parking, shapes, surface, traffic signs, turn restrictions, way table, reroute |

All packages are named `@osm-editor-kit/maid-<folder>` ([why](docs/architecture/03-packages.md#package-names)) and are
imported by that name, through the `exports` in their `package.json`. A package never imports another package's
files by a relative path, and never imports from `tools/`. The shell, renderer, ui and core never import a module
package. Built-in modules that every editor needs (element info, relations, validation, scene bounds) live in
`packages/shell/src/modules/`.

## The config object

`apps/<app>/src/maid.config.ts` exports `app`, an `AppConfig` (`packages/shell/src/shell.ts`). This is the only place
where an editor differs from another:

| Field | What it sets |
| --- | --- |
| `id` | The name of the app's browser storage (journal, logged-in user); unique across apps |
| `brand`, `version` | The name in the top bar; `created_by` of every changeset is `<brand.name> <version>`, with `version` from the app's `package.json` |
| `defaultLocale` | The language when the URL, the stored choice and the browser name none |
| `osm` | Which servers the editor offers (`['osm', 'dev']`, first is the default), the OAuth client ids from the env file, the login origin |
| `editor(config)` | Returns the `EditorConfig` (`packages/core/src/types.ts`): `modules`, `presets`, `filters`. `config` holds the settings the shell read from the URL (scene, API, display), so a module can depend on them |

What each app turns on today:

| App | Port | Modules beyond the shared set |
| --- | --- | --- |
| `apps/maid` | 5173 | turn restrictions, surface |
| `apps/maid-bicycle` | 5176 | turn restrictions, surface, traffic signs, way table, reroute |
| `apps/maid-parking` | 5177 | parking (with its lens and rules), shapes (angle snap with lengths, rectangle, merge, cut, divide) |

The shared set is the same in all three: element info, operations, relations, validation, imagery, data layers, lenses,
street-level images, notes. Read the three config files side by side to see the pattern; they are short.

**Presets** come from `presets.ts` next to the config: the tagging schema's data with the changes that modules ship
(`withChanges(defaultPresetData, parkingPresetChanges)`). They are loaded with `lazyPresets(() => import('./presets'))`
so the schema is a chunk of its own. **Filters** are an ordered list, `defaultFilters` of `packages/filters` or an app's
own ([chapter](docs/architecture/06-filters.md)).

## Maid modules

A module is an object with an `id` and a `setup(api)` function, made with `defineModule` from `packages/core`. Modules
are usually exported as factories that take options: `parking({ lenses })`, `angleSnap({ lengths: true })`.

```ts
export function rectangle() {
  return defineModule({
    id: 'shapes-rectangle',
    setup(api) {
      api.register('map.content', { id: 'shapes-rectangle', component: RectangleOnMap })
      api.register('draw.tool', { id: 'rectangle', geometry: 'area', label: () => m.rectangle_label(), start })
    },
  })
}
```

`api` (`ModuleApi` in `packages/core/src/types.ts`) has four members:

- `editor`: the editor, with its data, history, presets and registries.
- `register(point, item)`: adds an item to an extension point.
- `on(name, listener)`: listens to a hook. The hook mechanism exists, but no hook is used in production yet. Prefer an
  extension point.
- `urlParam(declaration)`: declares a URL parameter the module owns. It throws when the app or another module already
  uses that name.

Everything a module registers is removed again when the editor is destroyed, in reverse module order. `setup` may
return its own cleanup function. Module ids are unique within an app, and so are item ids within an extension point;
both throw on a duplicate.

### Extension points

An extension point is a typed list that the shell or the renderer reads. The package that reads it declares it by
merging into `ExtensionPoints` of `@osm-editor-kit/maid-core`, in its `src/extension-points.ts`:

| Point | Declared in | Shown where | Example |
| --- | --- | --- | --- |
| `map.layer` | renderer | MapLibre source and layers, above or below the OSM data | `sceneBounds` in shell |
| `map.content` | renderer | A React component inside the map (previews, handles) | parking, shapes |
| `edit.operation` | renderer | Edit menu, command bar and its key; `supersedes` hides another operation | `operations(defaultOperations)`, shapes merge |
| `imagery.used` | renderer | The imagery credited in a changeset | imagery |
| `draw.constraint` | renderer | Where a drawn or dragged node goes on open ground, guide lines and labels | angle snap |
| `draw.tool` | renderer | The dropdown of the Area button, and the keys 33, 333 | rectangle |
| `inspector.section` | ui | A block in the sidebar, above or below the fields | parking, relations |
| `inspector.field` | ui | The component for a field type | traffic signs |
| `dock.view` | ui | A tab in the bottom dock | way table |
| `topbar.panel` | ui | A flyout behind an icon in the top bar | imagery |
| `note.selection` | module-notes | What the notes panel shows for a selected note | notes |

`bun run check-config` loads each app's config without a browser and checks the ids and the ports, that each
module sets up without a network request, registers only at declared extension points and cleans up after itself. The drawing hooks (modifiers, constraints, module modes, operations that ask for input)
are in [ADR 0011](docs/adr/0011-drawing-tool-hooks.md).

### When the core lacks something

Add a new extension point, or a new field on an existing item type, in the package that reads it. Its first user is
the module that needs it. Do not add a module-specific branch to the shell or renderer ("if parking then"). For
example, the drawing tools needed five such hooks, written down in ADR 0011.

## Texts and languages

Every text a user sees goes through Paraglide; no English string is written into a component.

Maid's texts are compiled with [Paraglide](https://inlang.com/m/gerre34r/library-inlang-paraglideJs) in English,
German, French and Spanish. The decisions are in [ADR 0009](docs/adr/0009-decisions-of-2026-10-13.md#translations).

- **The app's texts** live in `packages/i18n/messages/<locale>.json`. Code imports
  `import { m } from '@osm-editor-kit/maid-i18n'` and calls `m.some_key({ values })`.
- **A module's texts** live in the module: `project.inlang/settings.json` and `messages/<locale>.json`, plus a
  `src/messages.ts` that calls `linkModuleLocale(overwriteGetLocale)` and re-exports `m` (copy the one in
  `packages/module-parking`). The compile script finds every `packages/module-*` folder with a `project.inlang` folder;
  no list needs to be edited.
- **Compiled output** goes to `<package>/paraglide/` and is not committed. `bun run i18n-compile` writes it, and `dev`,
  `type-check` and `check` run it first.
- **Missing texts:** `bun run i18n-check` lists the keys a language lacks, and placeholders that differ, in
  `reports/i18n-missing.json`. It fails `check`, so a new key needs all four languages. French and Spanish are
  agent drafts until a person reads them.
- **Headless packages** (operations, validation, presets) return a message id with values, not sentences. The text is
  made where it is shown. Read a text when it is shown, never at module level, as the language is set at mount.
- **Preset names and fields** come from the tagging schema, not from Paraglide, and are English only for now
  (`packages/presets/src/default.ts`). The other languages are an open step in
  [steps.md](docs/build-out/steps.md#translations).
- **The language** is chosen once at mount (`packages/shell/src/mount.tsx`): `?lang=`, then the stored choice, then the
  browser, then the app's `defaultLocale`, then English. Automated runs are always English. Changing it reloads the page.

## URL, settings and storage

The URL holds what a link should reproduce (map, selection, display, lens, filters). The shell owns most parameters,
and a module declares its own with `api.urlParam`. All parameters and their names are in
[URL state](docs/architecture/08-url-state.md). Which value wins between the URL, a stored preference and a user action
is in [storage and settings](docs/architecture/09-storage-and-settings.md).

## Build and deploy

- `bun run dev` starts the three apps and the mock API. Ports are in `tools/ports.ts`.
- Each app is built by Vite (`apps/<app>/vite.config.ts`, shared parts in `apps/vite-shared.ts`). The shell's
  `public/` folder is every app's public folder.
- `bun run pages-build` builds the apps named in `deploy.env` (`MAID_APP`) into `site/`. The GitHub Action
  `.github/workflows/pages.yml` runs it on every push to `main` and publishes to GitHub Pages. Repository variables
  override `deploy.env`. Setup for a fork, OAuth and the variables: [docs/deploying.md](docs/deploying.md).
- **Versions:** each app's `package.json` has its own version. It goes into every changeset's `created_by`, so raise it
  when an app changes in a way mappers should be able to tell apart. There is no changelog file; the commit messages
  (`<Topic>: <outcome>` with outcome bullets) are the record.

## Recipes

### Add a module

1. Copy the smallest module that is close to yours (`packages/module-surface` for a field and preset changes,
   `module-shapes` for drawing). Rename the folder and `name` in its `package.json` (`@osm-editor-kit/maid-module-<name>`).
2. Export a factory from `src/index.ts` that returns `defineModule({ id, setup })`. Register your items in `setup`.
3. Texts: `project.inlang`, `messages/` and `src/messages.ts` as above, all four languages.
4. If the module has Tailwind classes, add its `src` folder with `@source` in `packages/shell/src/styles.css`.
5. Add the package to the app's `package.json`, run `bun install`, and add the factory to `modules` in
   `maid.config.ts`.
6. Unit tests next to the code (`*.test.ts`). For behaviour on the map, a browser check in `tools/checks/` and a row in
   `tools/checks/check-all.ts` and in the check table of [AGENTS.md](AGENTS.md).
7. `bun run check`, `bun run check-config`, and `bun run check-all --app <app>`.

### Add an app

1. Copy `apps/maid-parking` to `apps/maid-<name>`, without `dist/` and `node_modules/`.
2. In the copy: `package.json` name, `index.html` title, `src/maid.config.ts` (`id`, `brand`, `defaultLocale`,
   `osm.loginOrigin`, modules), `src/presets.ts`.
3. Give it a port in `tools/ports.ts`, use that port in its `vite.config.ts`, and add it to `APPS` in
   `tools/bench/args.ts`. This list feeds `check-config`, `check-all` and the browser checks.
4. Add a `dev-<name>` script to the root `package.json`, next to `dev-parking`, and add it to `dev`.
5. To deploy it, add the folder name to `MAID_APP` in `deploy.env`.
6. `bun install`, `bun run check`, `bun run check-config`, `bun run check-all --app <name>`.

### Change the core

Change it in the package that owns the behaviour, with a unit test, in a commit of its own. Run `bun run check-all`
for all three apps, since every app uses the core. Follow iD where in doubt (rule 3 in [AGENTS.md](AGENTS.md)).

## Where the code does not follow this yet

The code was checked against this file on 2026-10-17. What does not follow it yet (texts in ui, shell and five
modules; sentences from headless packages; the shell importing three modules) is listed in
[steps.md, Architecture follow-ups](docs/build-out/steps.md#architecture-follow-ups). Fix the code there, not the
rule here, unless the rule is wrong.

## Where to read on

- [AGENTS.md](AGENTS.md): core rules, scripts, browser checks, working with subagents.
- [docs/build-out/steps.md](docs/build-out/steps.md): what is done and what is next.
- [docs/adr/](docs/adr/README.md): decisions, newest last.
- [docs/architecture/](docs/architecture/README.md): chapters with the reasoning behind naming, forks, packages, data
  store, filters, styles, URL, storage, UI.
- [docs/research/](docs/research/): studies and audits. They describe the state on their date.
