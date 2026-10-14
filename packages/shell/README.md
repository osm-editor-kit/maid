# @osm-editor-kit/maid-shell

The editor's shell: the `App`, the components built from `maid-ui`, the URL state, saving and login, the journal wiring, the built-in modules (`elementInfo`, `relations`, `validation`, `sceneBounds`), the debug handle (`window.__bench`, `window.__maid`), the styles (`src/styles.css`) and the public assets every app serves (`public/`: sprites, label fonts, `land.html`, `frame-sync.js`). An app (`apps/maid`) says which modules, presets and filters it has, and nothing else. The plan is in `docs/research/shell-package-plan.md`.

## Use

```ts
// apps/maid/src/main.tsx
import { mountEditor } from '@osm-editor-kit/maid-shell'
import '@osm-editor-kit/maid-shell/styles.css'
import { app } from './maid.config' // an AppConfig

mountEditor(document.getElementById('root')!, app) // returns a function that unmounts
```

```ts
// apps/maid/src/maid.config.ts
export const app: AppConfig = {
  id: 'maid', // names what the app stores itself: the journal's database and the logged-in user
  brand: { name: 'Maid', detail: 'MapLibre iD Editor' }, // also the changeset's created_by, with version
  version: pkg.version, // the app's package.json version (import pkg from '../package.json')
  osm: { clientId, devClientId, loginOrigin: 'http://127.0.0.1:5173', envFile: 'apps/maid/.env.local' },
  editor: (config) => ({ modules, presets, filters }), // gets the settings read from the URL
}
```

- `@osm-editor-kit/maid-shell`: `mountEditor`, `AppConfig`, the built-in modules, `Config`, `modKey`, the stack helpers. Importing it makes nothing: no editor, no engine, no store reads. `mountEditor` calls `createShell(app)` (`src/shell.ts`), which makes the editor, the engine, the login and the journal, and puts them in one React context (`src/shell-context.ts`: `useShell()`, `useEngine()`). Code outside React gets them as arguments.
- `@osm-editor-kit/maid-shell/styles.css`: Tailwind, the dark variant, the page rules and the `@source` lines of the shell and of the modules the apps use.
- Each app serves `public/` as its Vite `publicDir` (`packages/shell/public`). `sprites/` and `frame-sync.js` are copies made by `bun run refs-setup` and are git-ignored.

## Limits

- One editor per page. The package stores (settings, notes, lenses, imagery, street imagery, data layers) are singletons with fixed storage keys, and so are the editor and the engine for now.
- Two apps on one origin share the package stores (`maid:settings`, `maid:notes`, `maid:lenses`, `maid:street-imagery`, `maid:data-layers`, `maid:imagery`), whose names are fixed inside the packages. `AppConfig.id` only separates the journal and the logged-in user. The apps run on different ports (5173, 5176), which are different origins, so they do not meet in practice.
