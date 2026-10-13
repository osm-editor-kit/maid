import discarded from '@openstreetmap/id-tagging-schema/dist/discarded.min.json'

/**
 * Tags that no editor should upload (the schema's `discarded.json`): a key with `true` is always
 * dropped, a key with an object only for the values it lists. A file of its own (3 kB), so that the save flow and the
 * journal can read it without the presets data (`default.ts`) or the matching code coming along.
 */
export const discardedTags: Record<string, true | Record<string, boolean>> = discarded as Record<
  string,
  true | Record<string, boolean>
>
