import {
  DIRECTION_VIEWBOX,
  directionParts,
  type DirectionShape,
} from '@osm-editor-kit/maid-renderer'

/**
 * The direction markers of the map (white arrow with a dark outline) as an inline icon: `forward` an arrow along
 * the way's drawing direction, `both` a double arrow, `reversed` the hook ("drawn this way, ridden that way"),
 * `drawn` the thin arrow of the selected way. Drawn pointing east, so left to right is the drawing direction;
 * `rotate` (degrees, clockwise) turns it, for example to the way's bearing on the screen.
 *
 * The paths are the renderer's (`direction-svg.ts`), the same as the SVG files in
 * `packages/renderer/assets/direction` that other editors take over.
 */
export type DirectionIconShape = DirectionShape

export function DirectionIcon({
  shape,
  className,
  title,
  rotate,
}: {
  shape: DirectionIconShape
  className?: string
  /** Names the icon for screen readers; without it the icon is hidden from them */
  title?: string
  rotate?: number
}) {
  return (
    <svg
      viewBox={`0 0 ${DIRECTION_VIEWBOX} ${DIRECTION_VIEWBOX}`}
      className={className}
      style={rotate ? { transform: `rotate(${rotate}deg)` } : undefined}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      {directionParts(shape).map((part, index) => (
        <path
          key={index}
          d={part.d}
          fill={part.fill}
          stroke={part.stroke}
          strokeWidth={part.strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  )
}
