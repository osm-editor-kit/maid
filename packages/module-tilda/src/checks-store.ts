// "Checked" and "Verified" of the TILDA section: the mapper confirms a default that needs no tag (`surface:colour` not
// tagged = not coloured), checks a reminder, or marks the whole way as verified. Not OSM data: no edit, no undo step,
// nothing to upload. The iD Radnetz fork keeps them in a shared key-value database of the project; Maid keeps them in
// this browser for now (one entry per way and check), so they are the mapper's own notes until a shared store exists.
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { TildaCheck } from './cards.ts'

type ChecksState = {
  /** By `<way id>/<check id>` */
  checks: Readonly<Record<string, TildaCheck>>
}

const keyOf = (wayId: string, check: string) => `${wayId}/${check}`

const useChecksStore = create<ChecksState>()(
  persist(() => ({ checks: {} }), {
    name: 'maid-tilda-checks',
    // browser storage can be missing or throw (private mode, tests): then the checks live as long as the page
    storage: createJSONStorage(() => localStorage),
  }),
)

/** All stored checks; the section picks the ones of its way (a stable object until a check changes) */
export function useTildaChecks() {
  return useChecksStore((state) => state.checks)
}

/** The check of one way, from the record `useTildaChecks` gives */
export function checkIn(
  checks: Readonly<Record<string, TildaCheck>>,
  wayId: string,
  check: string,
): TildaCheck | undefined {
  return checks[keyOf(wayId, check)]
}

export const tildaChecksActions = {
  /** Stores the check, or removes it when it is stored already */
  toggle(wayId: string, check: string, answer: string, wayVersion: string | undefined) {
    useChecksStore.setState((state) => {
      const key = keyOf(wayId, check)
      const checks = { ...state.checks }
      if (checks[key]) delete checks[key]
      else checks[key] = { answer, wayVersion, at: new Date().toISOString() }
      return { checks }
    })
  },
}
