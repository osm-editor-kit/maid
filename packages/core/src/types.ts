/**
 * The two maps that other packages extend by declaration merging, and the types around them.
 * The core declares no extension point and no hook. See README.md.
 */

/** `experimental` may change in any release. `stable` is deprecated before it is removed. */
export type Stability = 'experimental' | 'stable'

/**
 * Extension points: name to item type. An item needs a unique string `id`.
 * Extend with `declare module '@osm-editor-kit/maid-core' { interface ExtensionPoints { ... } }`.
 */
// oxlint-disable-next-line typescript/no-empty-interface
export interface ExtensionPoints {}

/**
 * Hooks: name to `Action<...>` or `Filter<...>`. The stability is part of the declaration.
 * Extend the same way as `ExtensionPoints`.
 */
// oxlint-disable-next-line typescript/no-empty-interface
export interface Hooks {}

/** Something happened. Listeners get the arguments, their return value is ignored. */
export interface Action<Args extends unknown[], S extends Stability> {
  kind: 'action'
  args: Args
  stability: S
}

/** A value passes through the listeners in order. Each returns the (maybe changed) value. */
export interface Filter<Value, Args extends unknown[], S extends Stability> {
  kind: 'filter'
  value: Value
  args: Args
  stability: S
}

/** Extension point names whose items have a string `id`. */
type PointKey = Extract<keyof ExtensionPoints, string>
export type PointName = {
  [K in PointKey]: ExtensionPoints[K] extends { id: string } ? K : never
}[PointKey]

export type HookName = Extract<keyof Hooks, string>

type NamesOfKind<Kind extends 'action' | 'filter'> = {
  [N in HookName]: Hooks[N] extends { kind: Kind } ? N : never
}[HookName]

export type ActionName = NamesOfKind<'action'>
export type FilterName = NamesOfKind<'filter'>

export type HookArgs<N extends HookName> = Hooks[N] extends { args: infer A extends unknown[] }
  ? A
  : never

export type HookValue<N extends HookName> = Hooks[N] extends { value: infer V } ? V : never

export type HookStability<N extends HookName> = Hooks[N] extends {
  stability: infer S extends Stability
}
  ? S
  : never

/** The function a module passes to `api.on(name, fn)`. */
export type Listener<N extends HookName> = Hooks[N] extends { kind: 'action' }
  ? (...args: HookArgs<N>) => void
  : Hooks[N] extends { kind: 'filter' }
    ? (value: HookValue<N>, ...args: HookArgs<N>) => HookValue<N>
    : never

/** What `onError` learns about a failure. It never reaches the caller of `run` or `apply`. */
export interface ErrorContext {
  source: 'action' | 'filter' | 'cleanup' | 'subscriber'
  /** Hook name, extension point name or module id, depending on `source`. */
  name: string
  /** The module that registered the failing listener or cleanup, if known. */
  moduleId?: string
}

export type OnError = (error: unknown, context: ErrorContext) => void

/** Configuration. Other packages add their own keys by merging into this interface. */
export interface EditorConfig {
  modules?: MaidModule[]
  /** Called for every error a listener, subscriber or cleanup throws. Default: `console.error`. */
  onError?: OnError
}

export interface MaidModule {
  id: string
  /** May return a cleanup function. It runs on `editor.destroy()`, in reverse module order. */
  setup(api: ModuleApi): void | (() => void)
}

export interface ModuleApi {
  readonly editor: Editor
  /** Adds an item to an extension point. It is removed when the module is cleaned up. */
  register<K extends PointName>(point: K, item: ExtensionPoints[K]): void
  /** Adds a hook listener. It is removed when the module is cleaned up. */
  on<N extends HookName>(name: N, listener: Listener<N>): void
}

export interface ReadonlyRegistry<T extends { id: string }> {
  get(id: string): T | undefined
  /** Items in registration order. The array is replaced on every change, never mutated. */
  list(): readonly T[]
  /** The listener gets the new list after each change. Returns the unsubscribe function. */
  subscribe(listener: (items: readonly T[]) => void): () => void
}

export interface EditorHooks {
  /** Calls the listeners of an action in order. */
  run<N extends ActionName>(name: N, ...args: HookArgs<N>): void
  /** Passes `value` through the listeners of a filter in order and returns the result. */
  apply<N extends FilterName>(name: N, value: HookValue<N>, ...args: HookArgs<N>): HookValue<N>
}

export interface Editor {
  readonly hooks: EditorHooks
  /** Read access to one extension point. */
  registry<K extends PointName>(point: K): ReadonlyRegistry<ExtensionPoints[K] & { id: string }>
  /** Ids of the modules that are set up, in setup order. */
  readonly moduleIds: readonly string[]
  /** Cleans up all modules in reverse order. Calling it again does nothing. */
  destroy(): void
}
