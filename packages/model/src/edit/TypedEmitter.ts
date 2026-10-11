/**
 * A minimal typed event emitter. Replaces the `tseep` EventEmitter that Rapid's systems extend.
 * `on` returns an unsubscribe function. Listeners run synchronously, in the order they were added.
 */
// oxlint-disable-next-line typescript/no-explicit-any -- the event map decides the argument types
export type EventMap<Events> = { [E in keyof Events]: (...args: any[]) => void }

export class TypedEmitter<Events extends EventMap<Events>> {
  private _listeners = new Map<keyof Events, Set<Events[keyof Events]>>()

  /** Subscribe to an event. Returns a function that removes the listener. */
  public on<E extends keyof Events>(event: E, fn: Events[E]): () => void {
    let set = this._listeners.get(event)
    if (!set) {
      set = new Set()
      this._listeners.set(event, set)
    }
    set.add(fn)
    return () => this.off(event, fn)
  }

  /** Remove a listener added with `on`. */
  public off<E extends keyof Events>(event: E, fn: Events[E]): void {
    this._listeners.get(event)?.delete(fn)
  }

  /** Call all listeners of an event with the given arguments. */
  public emit<E extends keyof Events>(event: E, ...args: Parameters<Events[E]>): void {
    const set = this._listeners.get(event)
    if (!set) return
    // Copy, so a listener can unsubscribe itself while the event is being emitted.
    for (const fn of [...set]) fn(...args)
  }

  /** Remove all listeners, of one event or of all. */
  public removeAllListeners(event?: keyof Events): void {
    if (event === undefined) this._listeners.clear()
    else this._listeners.delete(event)
  }
}
