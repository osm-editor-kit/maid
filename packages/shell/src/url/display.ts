/**
 * The map's display in the URL (`display`: `wireframe`, `edits` or `normal`; no key for the app's default look, so a
 * link always says what is shown). The engine holds the
 * display (`engine.display`), and this hook is the one writer of the parameter: the URL is the live state, so it follows
 * the engine, whether a key, the map style panel or a link set it. A person's choice is remembered by `chooseDisplay`
 * (maid-ui), not here, so a link never writes the settings.
 */
import { useEffect, useSyncExternalStore } from 'react'
import { useShell } from '../shell-context'
import { useDisplayParam } from './state'

/**
 * Keeps the URL's `display` at what the engine shows. Mounted once, in the editor. It reads the display alone, not the
 * engine's version: the editor re-renders only when the display changes, not on every change of the data.
 */
export function useDisplayUrl() {
  const { engine, config } = useShell()
  const display = useSyncExternalStore(engine.subscribe, () => engine.display)
  const [, setDisplayParam] = useDisplayParam()
  useEffect(
    function writeDisplayParam() {
      // the app's default look has no parameter: a link without one shows it; any other look is named
      void setDisplayParam(display === config.defaultDisplay ? null : display)
    },
    [display, setDisplayParam, config.defaultDisplay],
  )
}
