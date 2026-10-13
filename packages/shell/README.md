# @osm-editor-kit/maid-shell

The editor's shell: the `App`, the components built from `maid-ui`, the URL state, saving and login, the journal wiring, the built-in modules (`elementInfo`, `relations`, `validation`, `sceneBounds`), the debug handle (`window.__bench`, `window.__maid`), the styles (`src/styles.css`) and the public assets every app serves (`public/`: sprites, label fonts, `land.html`, `frame-sync.js`). An app (`apps/maid`) says which modules, presets and filters it has, and nothing else. The plan is in `docs/research/shell-package-plan.md`.

## Use

```ts
// apps/maid/src/main.tsx
import { setAppConfig } from '@osm-editor-kit/maid-shell'
import '@osm-editor-kit/maid-shell/styles.css'

setAppConfig(editorConfig) // the app's modules, presets and filters
const { mountEditor } = await import('@osm-editor-kit/maid-shell/mount')
mountEditor(document.getElementById('root')!)
```

- `@osm-editor-kit/maid-shell`: `setAppConfig`, the built-in modules, `Config`, `modKey`, the stack helpers. It never evaluates the shell's editor, so the app's config may import it.
- `@osm-editor-kit/maid-shell/mount`: `mountEditor(rootElement)`. Importing it creates the editor and the engine, so it is loaded after `setAppConfig` and with a dynamic `import()`.
- `@osm-editor-kit/maid-shell/styles.css`: Tailwind, the dark variant, the page rules and the `@source` lines of the shell and of the modules the default app uses.
- Each app serves `public/` as its Vite `publicDir` (`packages/shell/public`). `sprites/` and `frame-sync.js` are copies made by `bun run refs-setup` and are git-ignored.

## The bridge

The editor, the engine and the config are module-level instances (`src/editor.ts`), created when that file is first imported. They need the app's config, and a package cannot import its app. Until step 3 of the plan replaces this by `createApp(config)` and a context, `src/app-config.ts` holds the app's factory (a `const` holder set once) and `src/editor.ts` reads it at import. `src/engine-ref.ts` is a second, smaller holder: the built-in module `relations` is imported by the app's config, so it cannot import `editor.ts`; it asks for the engine when it renders.

## Limits

- One editor per page. The package stores (settings, notes, lenses, imagery, street imagery, data layers) are singletons with fixed storage keys, and so are the editor and the engine for now.
- Two apps on one origin would share their browser storage.
