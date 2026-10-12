/**
 * Where a setting's value can come from, weakest first: Maid's default, the fork's config, what
 * the user stored, the URL the session started with. `undefined` means the layer has no value.
 * What the user does now is the fifth layer; `writesStored` says where that goes.
 * The rule is in docs/architecture/09-storage-and-settings.md, "Which value wins".
 */
export type SettingLayers<T> = {
  fallback: T
  config?: T | undefined
  stored?: T | undefined
  url?: T | undefined
}

export type SettingStart<T> = {
  /** The value the session starts with: the strongest layer that has one */
  value: T
  /** The user's own value without the URL, for "Use mine" */
  own: T
  /**
   * The URL decides and differs from the user's own value. While this holds, a user action
   * changes the session only, so a link never overwrites the stored preference.
   */
  fromUrl: boolean
}

export function startSetting<T>(
  layers: SettingLayers<T>,
  same: (a: T, b: T) => boolean = Object.is,
): SettingStart<T> {
  const own = layers.stored ?? layers.config ?? layers.fallback
  if (layers.url === undefined) return { value: own, own, fromUrl: false }
  return { value: layers.url, own, fromUrl: !same(layers.url, own) }
}

/** A user action is stored as the preference unless the session's value came from the URL */
export function writesStored(fromUrl: boolean): boolean {
  return !fromUrl
}
