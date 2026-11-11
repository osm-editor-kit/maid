/**
 * The picture of one row of a chosen legend (`Lens.legend`): a short line drawn as the map draws it, with what the row
 * asks for around it (a casing, two thin lines along it, the road it belongs to, a sign on it). An SVG, 40 by 18 px.
 */
import type { LensLegendEntry } from '@osm-editor-kit/maid-style'

const W = 40
const H = 18
/** The road a side line belongs to: grey as a road on the map, above the line */
const ROAD = '#a1a1aa'

export function LegendSwatch({ entry }: { entry: LensLegendEntry }) {
  const width = entry.width ?? 3
  // a line that belongs to a road sits at the road's lower edge
  const y = entry.road ? 13 : H / 2
  const dash = entry.dash?.map((part) => part * width).join(' ')
  return (
    <svg aria-hidden="true" width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="shrink-0">
      {entry.road && (
        <line x1={0} x2={W} y1={6} y2={6} stroke={ROAD} strokeWidth={8} strokeLinecap="butt" />
      )}
      {entry.color && entry.kerbs && (
        <>
          <line x1={2} x2={W - 2} y1={y - 5} y2={y - 5} stroke={entry.color} strokeWidth={1.5} />
          <line x1={2} x2={W - 2} y1={y + 5} y2={y + 5} stroke={entry.color} strokeWidth={1.5} />
        </>
      )}
      {entry.color && entry.casing && (
        <line x1={2} x2={W - 2} y1={y} y2={y} stroke="#ffffff" strokeWidth={width + 3} />
      )}
      {entry.color && (
        <line
          x1={2}
          x2={W - 2}
          y1={y}
          y2={y}
          stroke={entry.color}
          strokeWidth={width}
          strokeDasharray={dash}
        />
      )}
      {entry.sign && (
        <circle cx={W / 2} cy={H / 2} r={6} fill="#1d4f91" stroke="#ffffff" strokeWidth={1.5} />
      )}
    </svg>
  )
}
