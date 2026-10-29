/** Which of iD's sprite files holds an icon, by the prefix of its name. Imports nothing: the tools that cut the sprite files read it too. */
export const SPRITE_OF_PREFIX: Record<string, string> = {
  maki: 'maki',
  temaki: 'temaki',
  fas: 'fa',
  far: 'fa',
  fab: 'fa',
  roentgen: 'roentgen',
  pinhead: 'pinhead',
  iD: 'iD',
}

/** The sprite file an icon is in, by its prefix: `maki-restaurant` is in `maki`. Undefined for an unknown prefix. */
export function spriteOf(icon: string): string | undefined {
  const dash = icon.indexOf('-')
  if (dash < 0) return undefined
  const prefix = icon.slice(0, dash)
  return Object.hasOwn(SPRITE_OF_PREFIX, prefix) ? SPRITE_OF_PREFIX[prefix] : undefined
}
