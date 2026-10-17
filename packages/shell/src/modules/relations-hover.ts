import { useEffect, useRef } from 'react'
import { useShell } from '../shell-context'
import { setSubRouteHovered } from './relations-map-shapes.ts'

/**
 * Highlights entities on the map while the pointer or the keyboard focus is on a row: a member row its member, a
 * relation row the relation and its members (`ids` is asked when the highlight starts). A sub-route of a
 * superrelation also becomes the strong one on the map (`subRoute`, relations-map.tsx). Leaving clears it, and so does
 * a row that goes away while highlighted (a member removed), so no halo stays behind.
 */
export function useRelatedWhileHovered(ids: () => readonly string[], subRoute?: string) {
  const { engine } = useShell()
  const on = useRef(false)
  useEffect(
    function clearTheHighlightOnUnmount() {
      return () => {
        if (!on.current) return
        on.current = false
        engine.setRelated(null)
        if (subRoute) setSubRouteHovered(null)
      }
    },
    [engine, subRoute],
  )
  const start = () => {
    on.current = true
    engine.setRelated(ids())
    if (subRoute) setSubRouteHovered(subRoute)
  }
  const stop = () => {
    on.current = false
    engine.setRelated(null)
    if (subRoute) setSubRouteHovered(null)
  }
  return { onPointerEnter: start, onPointerLeave: stop, onFocus: start, onBlur: stop }
}

export type RowHighlight = ReturnType<typeof useRelatedWhileHovered>
