/**
 * A keyboard shortcut as the platform writes it in a tooltip.
 *
 * A shortcut is written in one neutral form: `Mod` is the platform's command key (⌘ on Apple
 * devices, Ctrl elsewhere), and `Ctrl`, `Alt` and `Shift` are the others: `Mod+Shift+Z`,
 * `Alt+1`. The symbols ⌘ ⌃ ⌥ ⇧ are read as well, so a label that was already written for one
 * platform (the shell's `modKey`: `⌘Z`, `Ctrl+Z`) comes out right on the other one.
 */

type Modifier = 'Mod' | 'Ctrl' | 'Alt' | 'Shift'

/** The symbols read in front of a key: `⇧⌘Z` */
const SYMBOLS: Record<string, Modifier> = { '⌘': 'Mod', '⌃': 'Ctrl', '⌥': 'Alt', '⇧': 'Shift' }

/** The words read as a modifier when they come before the key (`Mod+Z`) */
const WORDS: Record<string, Modifier> = {
  Mod: 'Mod',
  Cmd: 'Mod',
  Command: 'Mod',
  Ctrl: 'Ctrl',
  Control: 'Ctrl',
  Alt: 'Alt',
  Option: 'Alt',
  Shift: 'Shift',
}

/** Apple's order of the symbols: control, option, shift, command */
const APPLE_ORDER: { modifier: Modifier; symbol: string }[] = [
  { modifier: 'Ctrl', symbol: '⌃' },
  { modifier: 'Alt', symbol: '⌥' },
  { modifier: 'Shift', symbol: '⇧' },
  { modifier: 'Mod', symbol: '⌘' },
]

/** The order of the words elsewhere; Mod is Ctrl there */
const WORD_ORDER = ['Ctrl', 'Alt', 'Shift'] as const

/**
 * The shortcut as the platform shows it. `apple` is true on Apple devices.
 *
 * `formatShortcut('Mod+Shift+Z', true)` is `⇧⌘Z`, `formatShortcut('Mod+Shift+Z', false)` is
 * `Ctrl+Shift+Z`, and a key without a modifier stays as it is: `formatShortcut('1', true)` is `1`.
 */
export function formatShortcut(shortcut: string, apple: boolean): string {
  const parts = shortcut.split('+')
  const modifiers = new Set<Modifier>()
  let key = ''
  parts.forEach((part, index) => {
    let rest = part
    while (rest.length > 0 && SYMBOLS[rest.charAt(0)] !== undefined) {
      modifiers.add(SYMBOLS[rest.charAt(0)]!)
      rest = rest.slice(1)
    }
    if (rest === '') return
    const word = WORDS[rest]
    // a word before the last part is a modifier; the last part is the key ("Shift" alone is a key)
    if (word !== undefined && index < parts.length - 1) modifiers.add(word)
    else key = rest
  })
  if (modifiers.size === 0) return key
  if (apple) {
    return APPLE_ORDER.filter((item) => modifiers.has(item.modifier))
      .map((item) => item.symbol)
      .join('')
      .concat(key)
  }
  const names = new Set<string>()
  for (const modifier of modifiers) names.add(modifier === 'Mod' ? 'Ctrl' : modifier)
  return [...WORD_ORDER.filter((name) => names.has(name)), key].join('+')
}

/** True on Apple devices, read in the browser when a tooltip shows (the same test as platform.ts) */
export function isApplePlatform(): boolean {
  if (typeof navigator === 'undefined') return false
  // userAgentData is Chromium-only and missing from the DOM types; the optional field makes Navigator assignable
  const agent: Navigator & { userAgentData?: { platform?: string } } = navigator
  const platform = agent.userAgentData?.platform ?? navigator.platform
  return /mac|iphone|ipad/i.test(platform)
}
