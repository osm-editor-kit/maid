import { useId } from 'react'

/**
 * A pencil crossed out, for "read-only": shown, but not editable. Heroicons has no such icon; this is its 24px solid
 * pencil with the slash of its crossed eye (`EyeSlashIcon`): the same line from top left to bottom right, and a gap
 * cut out of the pencil along it, so the three filter states read as pencil, crossed pencil, crossed eye. The 24px
 * pencil, not the 16px one: its separate tip and cap keep it a pencil where the slash crosses it (the 16px one read
 * as an X at 16px).
 * Props as a Heroicon's, so it takes their place.
 */
export function PencilSlashIcon(props: React.SVGProps<SVGSVGElement>) {
  const mask = useId()
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <mask id={mask}>
        <rect width="24" height="24" fill="white" />
        {/* the gap on either side of the slash */}
        <path d="m3 3 18 18" stroke="black" strokeWidth="3.5" strokeLinecap="round" />
      </mask>
      <path
        mask={`url(#${mask})`}
        d="M21.731 2.269a2.625 2.625 0 0 0-3.712 0l-1.157 1.157 3.712 3.712 1.157-1.157a2.625 2.625 0 0 0 0-3.712ZM19.513 8.199l-3.712-3.712-12.15 12.15a5.25 5.25 0 0 0-1.32 2.214l-.8 2.685a.75.75 0 0 0 .933.933l2.685-.8a5.25 5.25 0 0 0 2.214-1.32L19.513 8.2Z"
      />
      <path d="m3 3 18 18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  )
}
