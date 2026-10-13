import { editor } from './editor'

/**
 * The imagery the map shows now, as the modules report it (the `imagery.used` extension point):
 * the background's name, if there is one, and the names of all the imagery, background first.
 * Read outside React, at the moment a measure ends or a changeset is uploaded.
 */
export function imageryOnMap(): { background: string | undefined; used: string[] } {
  const items = editor.registry('imagery.used').list()
  return {
    background: items.map((item) => item.background()).find((name) => name !== undefined),
    used: items.flatMap((item) => item.used()),
  }
}
