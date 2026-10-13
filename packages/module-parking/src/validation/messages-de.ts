// The German texts of the parking rules, keyed by rule id, and of their fixes, keyed by fix id. An issue shows them
// where the page is German (shared.ts). Module texts move to packages/i18n later, with the English ones.

export type MessageArgs = {
  /** The feature's name and its highway or amenity tag */
  feature: string
  /** The tags the issue is about, as `key=value` pairs */
  tags: string
}

export const MESSAGES_DE: Record<string, (args: MessageArgs) => string> = {
  parking_restriction_on_parking_side: ({ feature, tags }) =>
    `${feature}: Parken auf dieser Seite und zugleich ein unbedingtes Verbot auf derselben Seite (${tags}). Eines von beiden stimmt nicht.`,
  parking_reason_without_no: ({ feature, tags }) =>
    `${feature}: ${tags}, aber auf dieser Seite ist nicht „kein Parken“ (no) eingetragen. Der Grund gehört zu parking:<Seite>=no.`,
  parking_both_conflicts_side: ({ feature, tags }) =>
    `${feature}: Angaben für beide Seiten und für eine Seite zugleich (${tags}). Beides darf nicht gleichzeitig gesetzt sein.`,
  parking_legacy_schema: ({ feature, tags }) =>
    `${feature}: altes Parkschema von vor 2022 (${tags}). Es ist noch verbreitet, wird aber nicht mehr ausgewertet; hier wird es nicht automatisch umgewandelt.`,
  parking_conditional_syntax: ({ feature, tags }) =>
    `${feature}: ${tags} ist keine Bedingung der Form Wert @ (Bedingung).`,
  parking_weekday_comma: ({ feature, tags }) =>
    `${feature}: ${tags}. Wochentagsgruppen werden mit Semikolon getrennt, nicht mit Komma.`,
  parking_fee_conditional: ({ feature, tags }) =>
    `${feature}: Gebühr ja und zugleich bedingte Gebühr ja (${tags}).`,
  parking_staggered_without_both: ({ feature, tags }) =>
    `${feature}: versetztes Parken (${tags}) braucht zusätzlich die Angabe parking:both.`,
  parking_shoulder_without_informal: ({ feature, tags }) =>
    `${feature}: Seitenstreifen (${tags}) braucht informal=yes.`,
}

/** The button of a fix and the name of its undo step; `key` is the key the fix is about */
export const FIXES_DE: Record<string, (key: string) => { label: string; annotation: string }> = {
  split_both: (key) => ({
    label: `${key} auf die beiden Seiten aufteilen`,
    annotation: `${key} auf die beiden Seiten aufgeteilt`,
  }),
  add_informal: (key) => ({
    label: `${key}=yes ergänzen`,
    annotation: `${key}=yes beim Seitenstreifen ergänzt`,
  }),
  semicolon_between_groups: (key) => ({
    label: 'Wochentagsgruppen mit ; trennen',
    annotation: `Komma zwischen den Wochentagsgruppen in ${key} ersetzt`,
  }),
}
