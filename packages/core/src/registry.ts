import type { ErrorContext, OnError, ReadonlyRegistry } from './types.ts'

export interface Registry<T extends { id: string }> extends ReadonlyRegistry<T> {
  /** Throws on a duplicate id. Returns a function that removes exactly this item. */
  add(item: T): () => void
}

export function createRegistry<T extends { id: string }>(
  name: string,
  onError: OnError,
): Registry<T> {
  const items = new Map<string, T>()
  const subscribers = new Set<(items: readonly T[]) => void>()
  let snapshot: readonly T[] = []

  function changed() {
    snapshot = [...items.values()]
    const context: ErrorContext = { source: 'subscriber', name }
    for (const subscriber of Array.from(subscribers)) {
      try {
        subscriber(snapshot)
      } catch (error) {
        onError(error, context)
      }
    }
  }

  return {
    get: (id) => items.get(id),
    list: () => snapshot,
    subscribe(listener) {
      subscribers.add(listener)
      return () => {
        subscribers.delete(listener)
      }
    },
    add(item) {
      if (items.has(item.id)) {
        throw new Error(`Extension point "${name}" already has an item with the id "${item.id}".`)
      }
      items.set(item.id, item)
      changed()
      return () => {
        // Only remove our own item, in case the id was registered again after a removal.
        if (items.get(item.id) !== item) return
        items.delete(item.id)
        changed()
      }
    },
  }
}
