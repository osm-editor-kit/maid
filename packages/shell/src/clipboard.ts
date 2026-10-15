import type { MaidEngine } from '@osm-editor-kit/maid-renderer'
import { pasteOfferActions } from './modules/relations-paste-store.ts'

/**
 * Pastes at a place, as the engine does, and remembers which feature each copy came from, so the relations section of
 * a copy can offer the originals' relations ("Also add"). Returns the copies, as `engine.paste` does.
 */
export function pasteAt(engine: MaidEngine, lon: number, lat: number) {
  const pasted = engine.paste(lon, lat)
  pasteOfferActions.remember(engine.clipboard.lastPasteOrigins)
  return pasted
}
