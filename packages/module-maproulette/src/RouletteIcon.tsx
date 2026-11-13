/** MapRoulette's sign in Maid: a roulette wheel (a ring, its spokes and the ball), drawn in the text colour */
export function RouletteIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
    >
      <circle cx="10" cy="10" r="7.25" strokeWidth="1.8" />
      <path
        d="M10 2.75v3.5M10 13.75v3.5M2.75 10h3.5M13.75 10h3.5"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="10" cy="10" r="2" fill="currentColor" stroke="none" />
    </svg>
  )
}
