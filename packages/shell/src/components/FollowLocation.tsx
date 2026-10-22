import { isAutomated } from '@osm-editor-kit/maid-core'
import { useEffect, useRef, type CSSProperties } from 'react'
import { GeolocateControl, type GeolocateControlInstance } from 'react-map-gl/maplibre'
import {
  currentFollowState,
  followActions,
  useFollowRefollows,
  useFollowWanted,
} from '../location-store'

// the control's own button is hidden: "Follow my location" is the flyout's toggle. The position dot is a
// marker on the map, not part of the button, so it stays.
const HIDDEN: CSSProperties = { display: 'none' }
const POSITION_OPTIONS = { enableHighAccuracy: true }

/**
 * The map follows the person's location, started from the search flyout (SearchButton). It is MapLibre's
 * GeolocateControl without its button: the control does the tracking, this component turns it on and off
 * and copies its events into the store (location-store.ts). Automated runs never ask for the location.
 */
export function FollowLocation() {
  if (isAutomated()) return null
  return <FollowControl />
}

function FollowControl() {
  const control = useRef<GeolocateControlInstance | null>(null)
  const wanted = useFollowWanted()
  const refollows = useFollowRefollows()
  // set while the control is being turned off. From the background state trigger() first goes back to
  // following (and moves the map), so the stop is repeated when that start event comes
  const stopping = useRef(false)

  useEffect(
    function followWanted() {
      const instance = control.current
      if (!instance) return
      const state = currentFollowState()
      if (wanted) {
        // off starts following; background follows again (a press on the flyout's button)
        if (state === 'off' || state === 'background') {
          stopping.current = false
          instance.trigger()
        }
      } else if (state !== 'off') {
        stopping.current = true
        instance.trigger()
      }
    },
    [wanted, refollows],
  )

  return (
    <GeolocateControl
      ref={control}
      trackUserLocation
      showUserLocation
      positionOptions={POSITION_OPTIONS}
      position="top-right"
      style={HIDDEN}
      onTrackUserLocationStart={() => {
        if (stopping.current) {
          queueMicrotask(() => control.current?.trigger())
          return
        }
        followActions.setState('waiting')
      }}
      onGeolocate={() => {
        // waiting or error: the first position (or one after an error) is being followed
        const state = currentFollowState()
        if (state === 'waiting' || state === 'error') followActions.setState('following')
      }}
      onTrackUserLocationEnd={() => {
        if (stopping.current) {
          stopping.current = false
          followActions.setState('off')
          return
        }
        // the end without a stop is the person moving the map: the control still tracks the location
        followActions.setState('background')
      }}
      onError={() => followActions.setState('error')}
      // the map has no maxBounds, so this does not happen now; a position outside the bounds is an error
      onOutOfMaxBounds={() => followActions.setState('error')}
    />
  )
}
