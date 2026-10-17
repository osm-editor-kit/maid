import { MapPinIcon } from '@heroicons/react/20/solid'
import type { DrawnGeometry } from './favourites.ts'

/** iD's line and area icons are in its sprite; these two small drawings stand in for them */
export function LineIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path d="M3 15 8 6l5 7 4-8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function AreaIcon() {
  return (
    <svg viewBox="0 0 20 20" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path d="M4 5h12v10H4z" fill="currentColor" fillOpacity={0.25} strokeLinejoin="round" />
    </svg>
  )
}

/** The icon of a geometry the editor draws: the pin, the line, the area. The top bar's add buttons use the same. */
export function GeometryIcon(props: { geometry: DrawnGeometry }) {
  switch (props.geometry) {
    case 'point':
      return <MapPinIcon aria-hidden="true" />
    case 'line':
      return <LineIcon />
    case 'area':
      return <AreaIcon />
  }
}
