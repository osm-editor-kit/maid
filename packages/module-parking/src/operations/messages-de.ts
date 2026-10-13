// The German texts of the parking operations, keyed by operation id: the menu label, the undo step's name and
// the reasons an operation is disabled. Module texts move to packages/i18n later.

export type OperationTextDe = {
  label: string
  annotation: string
  disabled?: string
}

export const MESSAGES_DE: Record<string, OperationTextDe> = {
  'parking-copy-left-to-right': {
    label: 'Parken der linken Seite auf die rechte kopieren',
    annotation: 'Parken der linken Seite auf die rechte kopiert',
    disabled: 'Die rechte Seite hat schon dieselben Parkangaben.',
  },
  'parking-copy-right-to-left': {
    label: 'Parken der rechten Seite auf die linke kopieren',
    annotation: 'Parken der rechten Seite auf die linke kopiert',
    disabled: 'Die linke Seite hat schon dieselben Parkangaben.',
  },
  'parking-swap-sides': {
    label: 'Parkseiten tauschen',
    annotation: 'Parkseiten getauscht',
    disabled: 'Beide Seiten haben dieselben Parkangaben, Tauschen ändert nichts.',
  },
  'parking-remove-tags': {
    label: 'Parkangaben entfernen',
    annotation: 'Parkangaben entfernt',
  },
}
