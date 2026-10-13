function isMacPlatform() {
  // userAgentData is Chromium-only and missing from the DOM types; the optional field makes Navigator assignable
  const agent: Navigator & { userAgentData?: { platform?: string } } = navigator
  const platform = agent.userAgentData?.platform ?? navigator.platform
  return /mac|iphone|ipad/i.test(platform)
}

/** True on Apple devices, where the command key takes the place of Ctrl */
export const MAC = isMacPlatform()

/** How a key with the platform's modifier is shown: `modKey('Z')` is ⌘Z or Ctrl+Z */
export function modKey(key: string, shift = false) {
  if (MAC) return `${shift ? '⇧' : ''}⌘${key}`
  return `Ctrl+${shift ? 'Shift+' : ''}${key}`
}
