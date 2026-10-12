import { useSyncExternalStore } from 'react'

/** The theme the user picked: fixed light or dark, or whatever the operating system says. */
export type Theme = 'light' | 'dark' | 'system'

const storageKey = 'maid:theme'
const darkQuery = '(prefers-color-scheme: dark)'

function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark' || value === 'system'
}

function readStoredTheme(): Theme {
  try {
    const value = window.localStorage.getItem(storageKey)
    return isTheme(value) ? value : 'system'
  } catch {
    // Storage can be blocked (private windows, cleared site data); the default still works.
    return 'system'
  }
}

// One store for the whole page, so no provider is needed.
let currentTheme: Theme = readStoredTheme()
const listeners = new Set<() => void>()
let systemListening = false

function resolve(value: Theme): 'light' | 'dark' {
  if (value === 'system') return window.matchMedia(darkQuery).matches ? 'dark' : 'light'
  return value
}

function applyToDocument(): void {
  const resolved = resolve(currentTheme)
  const root = document.documentElement
  root.classList.toggle('dark', resolved === 'dark')
  root.style.colorScheme = resolved
}

function emit(): void {
  applyToDocument()
  for (const listener of listeners) listener()
}

function listenToSystem(): void {
  if (systemListening) return
  systemListening = true
  // Follows the operating system live, even when no component shows the theme.
  window.matchMedia(darkQuery).addEventListener('change', emit)
}

function subscribe(listener: () => void): () => void {
  listenToSystem()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getTheme(): Theme {
  return currentTheme
}

function getServerTheme(): Theme {
  return 'system'
}

function getResolvedTheme(): 'light' | 'dark' {
  return resolve(currentTheme)
}

function getServerResolvedTheme(): 'light' | 'dark' {
  return 'light'
}

function setTheme(theme: Theme): void {
  currentTheme = theme
  try {
    window.localStorage.setItem(storageKey, theme)
  } catch {
    // Without storage the choice lasts until the page is reloaded.
  }
  emit()
}

/** Applies the stored theme to the document. Safe to call before React renders. */
export function initTheme(): void {
  listenToSystem()
  applyToDocument()
}

/** The stored theme and a setter that also saves it. */
export function useTheme(): [Theme, (theme: Theme) => void] {
  const theme = useSyncExternalStore(subscribe, getTheme, getServerTheme)
  return [theme, setTheme]
}

/** The theme in effect right now: `system` resolved to light or dark. */
export function useResolvedTheme(): 'light' | 'dark' {
  return useSyncExternalStore(subscribe, getResolvedTheme, getServerResolvedTheme)
}
