import { createHooks } from './hooks.ts'
import { createRegistry, type Registry } from './registry.ts'
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
  const registries = new Map<string, Registry<{ id: string }>>()
  const active: { id: string; cleanup: () => void }[] = []
  let destroyed = false

  function registryFor<K extends PointName>(
    point: K,
  ): Registry<ExtensionPoints[K] & { id: string }> {
    let registry = registries.get(point)
    if (!registry) {
      registry = createRegistry(point, onError)
      registries.set(point, registry)
    }
    return registry as Registry<ExtensionPoints[K] & { id: string }>
  }

  function destroy(): void {
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
  }

  function setUp(module: MaidModule): void {
    // What the module registered. Undone in reverse order after its own cleanup function.
    const undo: (() => void)[] = []
    const guard = (): void => {
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
    const cleanup = (own?: () => void): void => {
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

  const editor: Editor = {
    hooks: {
      run: (name, ...args) => hooks.run(name, ...args),
      apply: (name, value, ...args) => hooks.apply(name, value, ...args),
    },
    registry: registryFor,
    moduleIds: modules.map((m) => m.id),
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

function assertUniqueIds(modules: MaidModule[]): void {
  const seen = new Set<string>()
  for (const { id } of modules) {
    if (seen.has(id)) throw new Error(`Duplicate module id "${id}". Module ids must be unique.`)
    seen.add(id)
  }
}
