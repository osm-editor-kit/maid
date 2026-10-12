/**
 * The box of a checkbox, in Tailwind Plus's drawing: a 16 px box with a 14 px mark whose strokes
 * are centred in it. `on` is a white check on blue, `dash` a white dash on blue (a value that is
 * set but is neither yes nor no), `unknown` a grey dash in an empty box (nothing is set), `off`
 * the empty box. Decoration only: the control around it carries the role and the state.
 */
export function CheckBox({ state }: { state: 'on' | 'off' | 'dash' | 'unknown' }) {
  const filled = state === 'on' || state === 'dash'
  return (
    <span
      aria-hidden="true"
      className={`grid size-4 shrink-0 place-items-center rounded-sm border ${
        filled
          ? 'border-blue-600 bg-blue-600 dark:border-blue-500 dark:bg-blue-500'
          : 'border-zinc-950/20 bg-white dark:border-white/20 dark:bg-white/5'
      }`}
    >
      <svg
        fill="none"
        viewBox="0 0 14 14"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`size-3.5 ${filled ? 'stroke-white' : 'stroke-zinc-400 dark:stroke-zinc-500'}`}
      >
        {state === 'on' ? <path d="M3 8L6 11L11 3.5" /> : null}
        {state === 'dash' || state === 'unknown' ? <path d="M3 7H11" /> : null}
      </svg>
    </span>
  )
}
