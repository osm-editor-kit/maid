/**
 * The setting "Issues in existing data": Quiet (the default), This session, or Always. Quiet folds the issues the
 * person did not cause into one grey line; the other two show them like the person's own. This session is kept in
 * memory until the tab closes. Always is stored in the browser (`maid:validation-existing`), like the other
 * settings of the shell. It is not part of a link: no URL parameter (docs/research/issue-scope-ux.md, 4).
 *
 * A zustand store with persist, as the other stores (validation-ignored.ts, packages/ui/src/settings.ts). The store is
 * private: the hooks and actions below are its only way out. A stored value that does not fit is not used.
 */
import { moduleStorage } from '@osm-editor-kit/maid-core'
import { z } from 'zod'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

/** What the setting says: Quiet folds the issues of existing data, the other two show them */
export type ExistingMode = 'quiet' | 'session' | 'always'

const KEY = 'maid:validation-existing'

/**
 * The version of what is stored. Version 0 (nothing says so) is what the store wrote before it had one: the same
 * `{ always }` under `state`, read as it always was (`migrate`).
 */
const VERSION = 1

/** What is stored: only `always`. Checked on every load; a value that does not fit is Quiet. */
const storedExisting = z.object({ always: z.boolean() })

/** Whether the stored value says Always. Anything else, or nothing stored, is not Always. */
export function restoreAlways(persisted: unknown): boolean {
  const stored = storedExisting.safeParse(persisted)
  return stored.success ? stored.data.always : false
}

type ExistingState = {
  /** The person chose Always: stored */
  always: boolean
  /** The person chose This session, or a fix or an edit of existing data did: in memory only */
  session: boolean
}

interface ExistingActions {
  /**
   * Sets the setting. Quiet clears This session as well; Always is stored; This session is not (it ends with the tab).
   */
  setMode: (mode: ExistingMode) => void
  /**
   * The person used a fix of an issue in existing data, or edited a feature one names: this is the sign that they
   * want to see them. Quiet becomes This session; Always and This session stay as they are. Returns whether the
   * setting changed, so the caller shows its notice once.
   */
  signal: () => boolean
}

type ExistingStore = ExistingState & { actions: ExistingActions }

const useExistingStore = create<ExistingStore>()(
  persist(
    (set, get) => ({
      always: false,
      session: false,
      actions: {
        setMode: (mode) => {
          set({ always: mode === 'always', session: mode === 'session' })
        },
        signal: () => {
          const { always, session } = get()
          if (always || session) return false
          set({ session: true })
          return true
        },
      },
    }),
    {
      name: KEY,
      version: VERSION,
      storage: createJSONStorage(() => moduleStorage()),
      partialize: ({ always }) => ({ always }),
      // a value stored before the version was written (version 0) is read as it always was
      migrate: (persisted) => ({ always: restoreAlways(persisted) }),
      // runs on every load: with nothing stored, or a value that does not fit, the setting is not Always
      merge: (persisted, current) => ({ ...current, always: restoreAlways(persisted) }),
    },
  ),
)

/** The mode of a state: Always wins over This session, which wins over Quiet */
function modeOf({ always, session }: ExistingState): ExistingMode {
  if (always) return 'always'
  return session ? 'session' : 'quiet'
}

/** The mode the person has now. Read it when needed; `useExistingMode` is the reactive read. */
export function existingMode(): ExistingMode {
  return modeOf(useExistingStore.getState())
}

/** The mode, in a component. Re-renders only when it changes. */
export function useExistingMode(): ExistingMode {
  return useExistingStore(modeOf)
}

/** Whether a mode shows the issues of existing data as the person's own */
export function showsExisting(mode: ExistingMode): boolean {
  return mode !== 'quiet'
}

/** The actions, in a component. The object never changes. */
export function useExistingActions(): ExistingActions {
  return useExistingStore((state) => state.actions)
}

/** The actions outside React (the validator's notices). The object never changes. */
export const existingActions: ExistingActions = useExistingStore.getState().actions

/** Called when the setting changes: the subscription the validator's announcements use */
export function subscribeExisting(listener: () => void): () => void {
  return useExistingStore.subscribe(listener)
}
