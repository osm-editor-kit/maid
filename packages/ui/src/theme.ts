import { useSyncExternalStore } from 'react'
import {
  getSettings,
  subscribeToSettings,
  useSettingsActions,
  useStoredTheme,
  type Theme,
} from './settings.ts'

const darkQuery = '(prefers-color-scheme: dark)'

function resolve(value: Theme): 'light' | 'dark' {
  if (value === 'system') return window.matchMedia(darkQuery).matches ? 'dark' : 'light'
  return value
}

function applyToDocument() {
  const resolved = resolve(getSettings().theme)
  const root = document.documentElement
  root.classList.toggle('dark', resolved === 'dark')
  root.style.colorScheme = resolved
}

function subscribeToSystem(listener: () => void) {
  const query = window.matchMedia(darkQuery)
  query.addEventListener('change', listener)
  return () => query.removeEventListener('change', listener)
}

/**
 * Applies the stored theme to the document and keeps it applied when the setting or the
 * operating system changes. Call once before React renders.
 */
export function initTheme() {
  applyToDocument()
  subscribeToSettings(applyToDocument)
  subscribeToSystem(applyToDocument)
}

/** The stored theme and a setter that also saves it. */
export function useTheme(): [Theme, (theme: Theme) => void] {
  return [useStoredTheme(), useSettingsActions().setTheme]
}

/** The theme in effect right now: `system` resolved to light or dark. */
export function useResolvedTheme(): 'light' | 'dark' {
  const theme = useStoredTheme()
  // the operating system's setting is outside React
  const systemDark = useSyncExternalStore(
    subscribeToSystem,
    () => window.matchMedia(darkQuery).matches,
    () => false,
  )
  return theme === 'system' ? (systemDark ? 'dark' : 'light') : theme
}
