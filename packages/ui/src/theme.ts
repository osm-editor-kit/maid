import { useEffect, useSyncExternalStore } from 'react'
import { getSettings, type Theme } from './settings.ts'

const darkQuery = '(prefers-color-scheme: dark)'

/** The theme in effect: a fixed choice as it is, `system` as the operating system says */
export type ResolvedTheme = 'light' | 'dark'

/** Pure: the theme in effect for a choice, given whether the operating system prefers dark. */
export function resolveTheme(value: Theme, systemDark: boolean): ResolvedTheme {
  if (value === 'system') return systemDark ? 'dark' : 'light'
  return value
}

function systemIsDark(): boolean {
  return window.matchMedia(darkQuery).matches
}

/** The theme in effect on the page, for components that need it as a value (the toasts) */
let inEffect: ResolvedTheme = 'light'
const inEffectListeners = new Set<() => void>()

function applyTheme(resolved: ResolvedTheme) {
  const root = document.documentElement
  root.classList.toggle('dark', resolved === 'dark')
  root.style.colorScheme = resolved
  if (inEffect === resolved) return
  inEffect = resolved
  for (const listener of inEffectListeners) listener()
}

function subscribeToInEffect(listener: () => void) {
  inEffectListeners.add(listener)
  return () => inEffectListeners.delete(listener)
}

function subscribeToSystem(listener: () => void) {
  const query = window.matchMedia(darkQuery)
  query.addEventListener('change', listener)
  return () => query.removeEventListener('change', listener)
}

/** The operating system's setting is outside React */
function useSystemDark(): boolean {
  return useSyncExternalStore(subscribeToSystem, systemIsDark, () => false)
}

/**
 * Applies the theme before React renders, so the first paint has the right colours: a link's `theme` when the app
 * passes one (the shell's `urlTheme`), else the stored choice. The shell's URL setting takes over in
 * `useAppliedTheme` once the page is up.
 */
export function initTheme(fromLink?: Theme | null) {
  applyTheme(resolveTheme(fromLink ?? getSettings().theme, systemIsDark()))
}

/**
 * Applies the theme the page shows (`value`, which the shell takes from the URL or the stored choice) to the document,
 * and keeps it applied when the operating system changes. Returns what is in effect.
 */
export function useAppliedTheme(value: Theme): ResolvedTheme {
  const resolved = resolveTheme(value, useSystemDark())
  useEffect(() => applyTheme(resolved), [resolved])
  return resolved
}

/** The theme in effect on the page, light or dark, as `useAppliedTheme` or `initTheme` applied it */
export function useThemeInEffect(): ResolvedTheme {
  return useSyncExternalStore(
    subscribeToInEffect,
    () => inEffect,
    () => 'light',
  )
}
