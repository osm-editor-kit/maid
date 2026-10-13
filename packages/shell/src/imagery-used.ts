import type { Editor } from '@osm-editor-kit/maid-core'

/**
 * The imagery the map shows now, as the modules report it (the `imagery.used` extension point):
 * the background's name, if there is one, and the names of all the imagery, background first.
 * Read outside React, at the moment a measure ends or a changeset is uploaded.
 */
export function imageryOnMap(editor: Editor): { background: string | undefined; used: string[] } {
  const items = editor.registry('imagery.used').list()
  return {
    background: items.map((item) => item.background()).find((name) => name !== undefined),
    used: items.flatMap((item) => item.used()),
  }
}

/**
 * The background the map shows now, as a raster source with its brightness, for the measure's magnifier
 * (the `backgroundSource` of the imagery.used items). Undefined with no background drawn: then there is
 * no magnifier.
 */
export function backgroundSourceOnMap(editor: Editor) {
  for (const item of editor.registry('imagery.used').list()) {
    const background = item.backgroundSource?.()
    if (background) return background
  }
  return undefined
}
