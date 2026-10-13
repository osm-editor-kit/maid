/** A button of the quick tags: what it sets on the selected road, as tag edits (`value` undefined removes a key) */
export type QuickTag = {
  /** Unique, stable id of the button */
  id: string
  label: string
  /** The name of an icon in `PARKING_ICONS` (../icons) */
  icon?: string
  edits: { key: string; value: string | undefined }[]
}

/** The buttons, in the order shown. Empty until the buttons agent fills it. */
export const QUICK_TAGS: QuickTag[] = []
