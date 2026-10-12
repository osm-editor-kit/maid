/**
 * The tag changes the package reports: tag key → new value. A removed tag comes as `undefined` (the package's
 * tag plan) or, for a sign that is emptied, as no value at all; both mean "remove the tag" for the editor.
 */
export type SignTagChanges = Readonly<Record<string, string | undefined>>

/**
 * Calls `onChange` once per changed key, in the order the package gave them. An empty value removes the tag.
 * The editor's `onChange(key, value | undefined)` is the only place where tags change.
 */
export function applySignTagChanges(
  changes: SignTagChanges,
  onChange: (key: string, value: string | undefined) => void,
): void {
  for (const [key, value] of Object.entries(changes)) {
    onChange(key, value === undefined || value === '' ? undefined : value)
  }
}
