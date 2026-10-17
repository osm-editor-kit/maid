/** Every UI string of the field. The host makes it (Maid: from Paraglide), so this package never imports a text library. */
export type TrafficSignTexts = {
  /** Shown under no sign: "No signs yet. Search below by name or sign ID to add one." */
  empty: string
  /** Placeholder of the search input */
  addPlaceholder: string
  /** Label of the search input (screen readers) */
  searchLabel: string
  /** The search matches nothing */
  noResults: string
  /** More matches than shown: "{count} more, keep typing to narrow down" */
  moreResults: (v: { count: number }) => string
  /** Title of the row for the value `none` */
  noSign: string
  /** Title of a row the catalogue does not know */
  unknownSign: string
  /** Tooltip and label of the move buttons */
  moveUp: string
  moveDown: string
  /** Polite announcement after a move */
  moved: (v: { position: number; total: number }) => string
  /** Tooltip of the remove button */
  remove: string
  /** Accessible name of the remove button of one row */
  removeSign: (v: { sign: string }) => string
  /** The catalogue is still loading: rows cannot be changed yet */
  loading: string
  /** Several features with different values: shown, not edited */
  mixed: string
}

/** English defaults, for tests and hosts that do not translate */
export const DEFAULT_TEXTS: TrafficSignTexts = {
  empty: 'No signs yet. Search below by name or sign ID to add one.',
  addPlaceholder: 'Add sign…',
  searchLabel: 'Search traffic signs',
  noResults: 'No sign matches. Press Enter to add the text as it is.',
  moreResults: ({ count }) => `${count} more, keep typing to narrow down`,
  noSign: 'No sign',
  unknownSign: 'Unknown sign',
  moveUp: 'Move up',
  moveDown: 'Move down',
  moved: ({ position, total }) => `Moved to position ${position} of ${total}`,
  remove: 'Remove',
  removeSign: ({ sign }) => `Remove ${sign}`,
  loading: 'Loading signs…',
  mixed: 'Multiple values',
}
