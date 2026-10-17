import type { MaidEngine, MapDisplay } from '@osm-editor-kit/maid-renderer'
import { settingsActions } from './settings.ts'

/**
 * A choice of the person for what the map shows: the keys W and G (shell's useShortcuts) and the display choice of the
 * map style panel. The engine shows it, and the settings remember it for the next visit under `shown.display`, in the
 * URL's notation: `''` for the normal look, as the filters store theirs (url/shown.ts). The URL follows the engine (the
 * shell's url/display.ts writes it), so a link never calls this and never writes the settings.
 */
export function chooseDisplay(engine: MaidEngine, display: MapDisplay) {
  engine.setDisplay(display)
  settingsActions.setShown('display', display === 'normal' ? '' : display)
}
