/**
 * The two maps that other packages extend by declaration merging, and the types around them.
 * The core declares no extension point and no hook. It does own the data: `context` and `history`. See README.md.
 */

import type { Filter as FeatureFilter } from '@osm-editor-kit/maid-filters'
import type { Context, EditHistory } from '@osm-editor-kit/maid-model'
import type { Presets } from '@osm-editor-kit/maid-presets'
import type { QueryClient } from '@tanstack/query-core'
import type { FetchPauses } from './fetching/editor-fetch.ts'
import type { RemoteFetch } from './fetching/remote-fetch.ts'
import type { ServiceRegistry } from './fetching/services.ts'

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
  /**
   * The presets and fields of this editor, for example `defaultPresets` of maid-presets or a
   * changed copy. Without them features have no preset, and the model decides with plain tag checks.
   */
  presets?: Presets | PresetsSource
  /**
   * The filters of this editor, in order: which features are editable, read-only or hidden to
   * begin with. For example `defaultFilters` of maid-filters, or a fork's own list. The first
   * filter that matches a feature decides.
   */
  filters?: readonly FeatureFilter[]
  /** Called for every error a listener, subscriber or cleanup throws. Default: `console.error`. */
  onError?: OnError
}

/**
 * Presets that are made after the first picture: the data of the tagging schema and the country data are
 * a chunk of their own, imported when `load` is called (the shell calls it once the map exists). Make one with
 * `lazyPresets`.
 */
export interface PresetsSource {
  /** Makes the presets. The same promise on every call. */
  load(): Promise<Presets>
  /** The presets once they are made, else undefined. For code that has no editor at hand (a module's closure). */
  readonly current: Presets | undefined
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

/** The members are plain functions, not methods, so they can be passed on (to `useSyncExternalStore`). */
export interface ReadonlyRegistry<T extends { id: string }> {
  get: (id: string) => T | undefined
  /** Items in registration order. The array is replaced on every change, never mutated. */
  list: () => readonly T[]
  /** The listener gets the new list after each change. Returns the unsubscribe function. */
  subscribe: (listener: (items: readonly T[]) => void) => () => void
}

export interface EditorHooks {
  /** Calls the listeners of an action in order. */
  run<N extends ActionName>(name: N, ...args: HookArgs<N>): void
  /** Passes `value` through the listeners of a filter in order and returns the result. */
  apply<N extends FilterName>(name: N, value: HookValue<N>, ...args: HookArgs<N>): HookValue<N>
}

export interface Editor {
  /** Id sequences and schema lookup of the data model. */
  readonly context: Context
  /**
   * The presets from the config. Undefined until they are made when the config gives a `PresetsSource`
   * (see `loadPresets`), and for an editor without presets.
   */
  readonly presets: Presets | undefined
  /** True from the start until the presets of a `PresetsSource` are made (or failed). False when they were given directly, or none. */
  readonly presetsPending: boolean
  /**
   * Starts making the presets of a `PresetsSource` (once) and resolves when they are there; undefined when the
   * editor has none or making them failed (the error goes to `onError`).
   */
  loadPresets(): Promise<Presets | undefined>
  /**
   * The listener runs once making the presets is over: with them, or with undefined when it failed. Returns the
   * unsubscribe function. Not called for presets that were given directly.
   */
  onPresets(listener: (presets: Presets | undefined) => void): () => void
  /** The filters from the config. Their current states are the renderer's. */
  readonly filters: readonly FeatureFilter[]
  /**
   * The OSM data and its edits: base, stable and staging graph, undo and redo.
   * Created without a spatial index.
   */
  readonly history: EditHistory
  readonly hooks: EditorHooks
  /** Read access to one extension point. */
  registry<K extends PointName>(point: K): ReadonlyRegistry<ExtensionPoints[K] & { id: string }>
  /** Ids of the modules that are set up, in setup order. */
  readonly moduleIds: readonly string[]
  /** Reference and view data: one query client per editor (fetching-audit.md, Part 5). */
  readonly queries: QueryClient
  /** The only way to send a request to a remote host: gated per service, time-limited, refused for remote hosts under automation. */
  readonly fetch: RemoteFetch
  /** Which host belongs to which service. The app claims the OSM API's host here. */
  readonly services: ServiceRegistry
  /** The services paused for rate limiting, with the time each pause ends. For the app's notice. */
  readonly fetchPauses: FetchPauses
  /** Cleans up all modules in reverse order. Calling it again does nothing. */
  destroy(): void
}
