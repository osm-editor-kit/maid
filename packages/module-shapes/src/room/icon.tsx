/** The room tool's button: a building outline with a room drawn into its corner, its new walls dashed */
export function RoomIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <rect x={3} y={3} width={14} height={14} />
      <path d="M3 10h7v7" strokeDasharray="2 1.5" />
      <rect
        x={3.75}
        y={10.75}
        width={5.5}
        height={5.5}
        fill="currentColor"
        fillOpacity={0.3}
        stroke="none"
      />
    </svg>
  )
}
