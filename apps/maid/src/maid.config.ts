/**
 * What this editor is: the modules it is made of, one per line so that one can be commented out.
 * The run-time settings (scene, live data, ...) come from the URL and are read once, in config.ts.
 */
import type { EditorConfig, MaidModule } from '@osm-editor-kit/maid-core'
import dense from '../../../fixtures/dense.meta.json'
import medium from '../../../fixtures/medium.meta.json'
import small from '../../../fixtures/small.meta.json'
import type { Config } from './config'
import { elementInfo } from './modules/element-info'
import { type Bbox, sceneBounds } from './modules/scene-bounds'

/** Extent of each fixture, from its meta file */
const BBOX: Record<string, Bbox> = {
  small: small.bbox as Bbox,
  medium: medium.bbox as Bbox,
  dense: dense.bbox as Bbox,
}

export function editorConfig(config: Config): EditorConfig {
  // live data and unknown scenes have no fixture area to outline
  const bbox = config.live ? undefined : BBOX[config.scene]
  const modules: MaidModule[] = [
    // inspector section "Element": id, version and upload state of the selected object
    elementInfo(),
  ]
  // dashed outline around the area the fixture covers
  if (bbox) modules.push(sceneBounds({ bbox }))
  return { modules }
}
