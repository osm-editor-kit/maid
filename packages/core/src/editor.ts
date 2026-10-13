import { EditHistory, ModelContext } from '@osm-editor-kit/maid-model'
import type { Presets } from '@osm-editor-kit/maid-presets'
import { createEditorFetch } from './fetching/editor-fetch.ts'
import { createHooks } from './hooks.ts'
import { createRegistry, type Registry } from './registry.ts'
import { PresetSchema } from './schema.ts'
import type {
  Editor,
  EditorConfig,
  ErrorContext,
  ExtensionPoints,
  MaidModule,
  ModuleApi,
  OnError,
  PointName,
} from './types.ts'

const defaultOnError: OnError = (error, context) => {
  console.error(`[maid-core] error in ${context.source} "${context.name}"`, error)
}

/** Identity function that gives a module literal its type. */
export function defineModule(module: MaidModule): MaidModule {
  return module
}

export function createEditor(config: EditorConfig = {}): Editor {
  const onError = config.onError ?? defaultOnError
  const modules = config.modules ?? []
  assertUniqueIds(modules)

  const hooks = createHooks(onError)
  const net = createEditorFetch()
  const registries = new Map<string, Registry<{ id: string }>>()
  const active: { id: string; cleanup: () => void }[] = []
  let destroyed = false

  function registryFor<K extends PointName>(point: K) {
    let registry = registries.get(point)
    if (!registry) {
      registry = createRegistry(point, onError)
      registries.set(point, registry)
    }
    return registry as Registry<ExtensionPoints[K] & { id: string }>
  }

  function destroy() {
    if (destroyed) return
    destroyed = true
    for (const { id, cleanup } of active.reverse()) {
      try {
        cleanup()
      } catch (error) {
        const context: ErrorContext = { source: 'cleanup', name: id, moduleId: id }
        onError(error, context)
      }
    }
    net.queries.clear()
  }

  function setUp(module: MaidModule) {
    // What the module registered. Undone in reverse order after its own cleanup function.
    const undo: (() => void)[] = []
    const guard = () => {
      if (destroyed) throw new Error(`Module "${module.id}" used its api after editor.destroy().`)
    }
    const api: ModuleApi = {
      editor,
      register(point, item) {
        guard()
        undo.push(registryFor(point).add(item))
      },
      on(name, listener) {
        guard()
        undo.push(hooks.on(name, listener, module.id))
      },
    }
    const cleanup = (own?: () => void) => {
      try {
        own?.()
      } finally {
        for (const remove of undo.splice(0).reverse()) remove()
      }
    }
    let own: void | (() => void)
    try {
      own = module.setup(api)
    } catch (error) {
      cleanup()
      throw error
    }
    active.push({
      id: module.id,
      cleanup: () => cleanup(typeof own === 'function' ? own : undefined),
    })
  }

  const context = new ModelContext()
  // Presets given directly are there from the start. A source is made later (`loadPresets`): the model asks the
  // schema only when an edit is made, so it is set then, and the first picture does not wait for the data.
  const source = config.presets && 'load' in config.presets ? config.presets : undefined
  let presets: Presets | undefined = source ? undefined : (config.presets as Presets | undefined)
  let presetsPending = source !== undefined
  let loading: Promise<Presets | undefined> | undefined
  const presetListeners = new Set<(presets: Presets | undefined) => void>()
  if (presets) context.systems.schema = new PresetSchema(context, presets)
  function announce(made: Presets | undefined) {
    for (const listener of presetListeners) {
      try {
        listener(made)
      } catch (error) {
        onError(error, { source: 'subscriber', name: 'presets' })
      }
    }
  }
  function loadPresets() {
    if (!source) return Promise.resolve(presets)
    loading ??= source.load().then(
      (made) => {
        presetsPending = false
        if (destroyed) return undefined
        presets = made
        context.systems.schema = new PresetSchema(context, made)
        announce(made)
        return made
      },
      (error: unknown) => {
        presetsPending = false
        onError(error, { source: 'subscriber', name: 'presets' })
        announce(undefined)
        return undefined
      },
    )
    return loading
  }
  const editor: Editor = {
    context,
    get presets() {
      return presets
    },
    get presetsPending() {
      return presetsPending
    },
    loadPresets,
    onPresets(listener) {
      presetListeners.add(listener)
      return () => presetListeners.delete(listener)
    },
    filters: config.filters ?? [],
    history: new EditHistory(context),
    hooks: {
      run: (name, ...args) => hooks.run(name, ...args),
      apply: (name, value, ...args) => hooks.apply(name, value, ...args),
    },
    registry: registryFor,
    moduleIds: modules.map((m) => m.id),
    queries: net.queries,
    fetch: net.fetch,
    services: net.services,
    fetchPauses: net.fetchPauses,
    destroy,
  }

  try {
    for (const module of modules) setUp(module)
  } catch (error) {
    // A module failed to set up: leave nothing behind, then tell the caller.
    destroy()
    throw error
  }
  return editor
}

function assertUniqueIds(modules: MaidModule[]) {
  const seen = new Set<string>()
  for (const { id } of modules) {
    if (seen.has(id)) throw new Error(`Duplicate module id "${id}". Module ids must be unique.`)
    seen.add(id)
  }
}
