import type { EditHistory } from '@osm-editor-kit/maid-model'

/**
 * What this tab knows about the other tabs of the same editor and data source:
 * - `mine`: how many features this tab has changed and not uploaded
 * - `others`: how many other tabs are open
 * - `shared`: the ids of the features that this tab and another tab have both changed
 */
export type OtherTabsState = { mine: number; others: number; shared: string[] }

/** The part of `BroadcastChannel` that is used: a parameter so tests can connect two tabs */
export type TabChannel = {
  postMessage(message: TabMessage): void
  addEventListener(type: 'message', listener: (event: { data: TabMessage }) => void): void
  close(): void
}

/** `hello`: a tab opened and asks the others for their edits. `edits`: a tab's changed ids. `bye`: a tab closed. */
export type TabMessage =
  | { type: 'hello'; tab: string }
  | { type: 'edits'; tab: string; ids: string[] }
  | { type: 'bye'; tab: string }

const EMPTY: OtherTabsState = { mine: 0, others: 0, shared: [] }

/** The ids of the features the history leaves changed, created or deleted against its base */
export function changedIds(history: EditHistory): string[] {
  const ids: string[] = []
  for (const [id, { base, head }] of history.difference().changes) {
    if (base || head) ids.push(id)
  }
  return ids
}

function defaultChannel(name: string): TabChannel | undefined {
  if (typeof BroadcastChannel === 'undefined') return undefined
  return new BroadcastChannel(name) as unknown as TabChannel
}

/**
 * Tells the tabs of one journal (`name`: the app and its data source) which features each has
 * changed, over a BroadcastChannel: nothing leaves the browser. A second tab is no problem by
 * itself; it becomes one when this tab's edits are not kept (the other tab holds the journal) or
 * when two tabs change the same features, because only one of them can upload those without a
 * conflict. Without BroadcastChannel nothing is shared: `others` stays 0.
 */
export function createOtherTabs(
  name: string,
  history: EditHistory,
  channel: TabChannel | undefined = defaultChannel(`maid-tabs:${name}`),
) {
  const tab = Math.random().toString(36).slice(2)
  const theirs = new Map<string, Set<string>>()
  const listeners = new Set<() => void>()
  let mine = changedIds(history)
  let state: OtherTabsState = EMPTY

  function update() {
    const own = new Set(mine)
    const shared = new Set<string>()
    for (const ids of theirs.values()) for (const id of ids) if (own.has(id)) shared.add(id)
    const next = { mine: own.size, others: theirs.size, shared: [...shared].sort() }
    if (
      next.mine === state.mine &&
      next.others === state.others &&
      next.shared.join() === state.shared.join()
    ) {
      return
    }
    state = next
    for (const listener of listeners) listener()
  }

  function send() {
    channel?.postMessage({ type: 'edits', tab, ids: mine })
  }

  channel?.addEventListener('message', ({ data }) => {
    if (!data || data.tab === tab) return
    if (data.type === 'bye') theirs.delete(data.tab)
    else if (data.type === 'edits') theirs.set(data.tab, new Set(data.ids))
    else if (data.type === 'hello') {
      if (!theirs.has(data.tab)) theirs.set(data.tab, new Set())
      send()
    }
    update()
  })

  const off = history.on('stablechange', () => {
    mine = changedIds(history)
    send()
    update()
  })

  const bye = () => channel?.postMessage({ type: 'bye', tab })
  if (typeof window !== 'undefined') window.addEventListener('pagehide', bye)

  channel?.postMessage({ type: 'hello', tab })
  send()
  update()

  return {
    getState: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    /** Says goodbye to the other tabs and stops listening */
    stop() {
      bye()
      off()
      if (typeof window !== 'undefined') window.removeEventListener('pagehide', bye)
      channel?.close()
    },
  }
}

export type OtherTabs = ReturnType<typeof createOtherTabs>
