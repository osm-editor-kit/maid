import type { FetchPause, FetchPauses as PauseSource, ServiceId } from '@osm-editor-kit/maid-core'
import { absoluteTime, browserTimeZone, notify } from '@osm-editor-kit/maid-ui'
import { useEffect } from 'react'

/** The name of each service in the notice, with the verb that goes with it */
const NAMES: Record<ServiceId, { readonly name: string; readonly verb: 'is' | 'are' }> = {
  osm: { name: 'The OSM API', verb: 'is' },
  wikimedia: { name: 'The OSM Wiki and Wikimedia', verb: 'are' },
  mapillary: { name: 'Mapillary', verb: 'is' },
  panoramax: { name: 'Panoramax', verb: 'is' },
  data: { name: "A data layer's server", verb: 'is' },
  taginfo: { name: 'Taginfo', verb: 'is' },
  local: { name: 'The local server', verb: 'is' },
}

/**
 * The standing notice of a paused service: who is limiting, and when loading goes on. The time is the
 * person's local time, with the day when it is not today. `now` and `timeZone` are passed in, so the
 * same pause gives the same text for the same clock.
 */
export function pauseText(pause: FetchPause, options: { now: number; timeZone: string }): string {
  const { name, verb } = NAMES[pause.service]
  const time = absoluteTime(
    { date: new Date(pause.until), dateOnly: false },
    { timeZone: options.timeZone, now: options.now },
  )
  return `${name} ${verb} limiting requests. Loading continues at ${time}.`
}

/** The notice id of a service: one standing toast per paused service */
function noticeId(service: ServiceId) {
  return `fetch-pause:${service}`
}

/**
 * The standing notices of paused services, from the editor's pause list. It keeps one toast per paused
 * service: a new text updates it in place, and the toast goes when the service is no longer paused. The
 * list calls its listeners at the end of a pause too (gate.ts announces when a pause ends), so nothing is
 * scheduled here.
 */
export function FetchPauses(props: { source: PauseSource }) {
  const { source } = props
  useEffect(() => {
    const shown = new Set<ServiceId>()
    const show = (pauses: readonly FetchPause[]) => {
      const now = Date.now()
      const timeZone = browserTimeZone()
      const paused = new Set(pauses.map((pause) => pause.service))
      for (const service of shown) {
        if (paused.has(service)) continue
        notify.clear(noticeId(service))
        shown.delete(service)
      }
      for (const pause of pauses) {
        shown.add(pause.service)
        notify.standing(noticeId(pause.service), pauseText(pause, { now, timeZone }))
      }
    }
    show(source.list())
    const unsubscribe = source.subscribe(show)
    return () => {
      unsubscribe()
      for (const service of shown) notify.clear(noticeId(service))
    }
  }, [source])
  return null
}
