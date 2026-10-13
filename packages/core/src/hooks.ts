import type {
  ActionName,
  EditorHooks,
  FilterName,
  HookName,
  HookStability,
  Listener,
  OnError,
  Stability,
} from './types.ts'

interface Entry {
  fn: (...args: unknown[]) => unknown
  moduleId?: string
}

export interface HookRunner extends EditorHooks {
  /** Adds a listener. Returns a function that removes it. */
  on<N extends HookName>(name: N, listener: Listener<N>, moduleId?: string): () => void
}

export function createHooks(onError: OnError): HookRunner {
  // Copy on write: the arrays are never changed in place, so a listener that adds or removes
  // listeners while a hook runs cannot disturb that run. An unused hook is one failed lookup.
  const listeners = new Map<string, readonly Entry[]>()

  return {
    on(name, listener, moduleId) {
      const entry: Entry = { fn: listener as Entry['fn'], moduleId }
      listeners.set(name, [...(listeners.get(name) ?? []), entry])
      return () => {
        const rest = (listeners.get(name) ?? []).filter((e) => e !== entry)
        if (rest.length > 0) listeners.set(name, rest)
        else listeners.delete(name)
      }
    },

    run(name: ActionName, ...args: unknown[]) {
      const entries = listeners.get(name)
      if (!entries) return
      for (const { fn, moduleId } of entries) {
        try {
          fn(...args)
        } catch (error) {
          onError(error, { source: 'action', name, moduleId })
        }
      }
    },

    apply(name: FilterName, value: unknown, ...args: unknown[]) {
      const entries = listeners.get(name)
      if (!entries) return value
      let current = value
      for (const { fn, moduleId } of entries) {
        try {
          current = fn(current, ...args)
        } catch (error) {
          // The listener is skipped: the value stays what the previous listener returned.
          onError(error, { source: 'filter', name, moduleId })
        }
      }
      return current
    },
  } as HookRunner
}

// Stability is declared with the hook's type and again as a value, so it can be read at run
// time. The type of `declareHooks` makes the two agree: a wrong level is a compile error.
const stabilities = new Map<string, Stability>()

export type HookStabilities = { [N in HookName]?: HookStability<N> }

/** Records the stability of hooks. Call it next to the `Hooks` declaration that adds them. */
export function declareHooks(declared: HookStabilities) {
  // with no hook declared yet the mapped type is empty, so the entries are typed here
  for (const [name, stability] of Object.entries(declared) as [string, Stability | undefined][]) {
    if (stability) stabilities.set(name, stability)
  }
}

/** The declared stability of a hook, or `undefined` if nobody called `declareHooks` for it. */
export function hookStability(name: HookName): Stability | undefined {
  return stabilities.get(name)
}

/** All declared hooks, for docs and tooling. */
export function declaredHooks(): { name: string; stability: Stability }[] {
  return [...stabilities].map(([name, stability]) => ({ name, stability }))
}
