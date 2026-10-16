/** The rectangle's entry in the Area dropdown: a dashed square with a dot at each corner */
export function RectangleIcon() {
  return (
    <svg viewBox="0 0 20 20" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <rect
        x={4}
        y={5}
        width={12}
        height={10}
        fill="currentColor"
        fillOpacity={0.25}
        strokeDasharray="2 2"
      />
      {[
        [4, 5],
        [16, 5],
        [16, 15],
        [4, 15],
      ].map(([x, y]) => (
        <circle key={`${x},${y}`} cx={x} cy={y} r={1.6} fill="currentColor" stroke="none" />
      ))}
    </svg>
  )
}
