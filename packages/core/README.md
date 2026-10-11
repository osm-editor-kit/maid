# @osm-editor-kit/maid-core

The headless core of Maid. It has no DOM, no React, no MapLibre and no OSM data model.
It has only the mechanism that modules plug into. No dependencies.

## The five concepts

- **Config.** `createEditor(config)` takes `{ modules, onError }`. Other packages add keys
  by declaration merging into `EditorConfig`.
- **Module.** `{ id, setup(api) }`. `setup` may return a cleanup function. Modules are set up
  in array order and cleaned up in reverse order by `editor.destroy()`. Ids must be unique.
- **Extension point.** A registry of items with a unique `id`. `api.register(point, item)`
  adds an item and removes it again on cleanup. Read with `editor.registry(point)`.
- **Hook.** An *action* says that something happened. A *filter* passes a value through
  the listeners. `api.on(name, fn)` listens. The editor calls `hooks.run` and `hooks.apply`.
  A throwing listener is reported to `onError` and skipped.
- **Stability.** Each hook is `experimental` or `stable`. Read it with `hookStability(name)`.

## A module

```ts
import { createEditor, defineModule } from '@osm-editor-kit/maid-core'

const hello = defineModule({
  id: 'hello',
  setup(api) {
    api.register('layers', { id: 'hello', color: 'red' })
    api.on('selection:changed', (ids) => console.log('selected', ids))
    api.on('tags:beforeApply', (tags) => ({ ...tags, source: 'survey' }))
    return () => console.log('bye') // optional cleanup
  },
})

const editor = createEditor({ modules: [hello] })
editor.hooks.run('selection:changed', ['n1'])
editor.hooks.apply('tags:beforeApply', { highway: 'path' })
editor.destroy()
```

## Add an extension point or a hook

The core declares none. A package adds its own by merging into two interfaces, and records
the stability as a value next to it. A wrong level is a compile error.

```ts
import { declareHooks } from '@osm-editor-kit/maid-core'
import type { Action, Filter } from '@osm-editor-kit/maid-core'

declare module '@osm-editor-kit/maid-core' {
  interface ExtensionPoints {
    layers: { id: string; color: string }
  }
  interface Hooks {
    'selection:changed': Action<[ids: string[]], 'experimental'>
    'tags:beforeApply': Filter<Record<string, string>, [], 'experimental'>
  }
}

declareHooks({ 'selection:changed': 'experimental', 'tags:beforeApply': 'experimental' })
```

A hook needs a consumer and a test with a fake module. See `src/editor.test.ts`.

## Not there yet

- The other config keys (`api`, `presets`, `filters`, `ui`, ...).
- The real extension points and hooks. They come from porting the two forks.
- A dev warning when a module uses an `experimental` hook. The level is readable, nothing uses it.
- Async listeners. A returned promise is not awaited.
- Loading modules from a URL. This will never exist.
