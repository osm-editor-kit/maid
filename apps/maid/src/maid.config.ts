/**
 * What this editor is: the modules it is made of, one per line so that one can be commented out.
 * The run-time settings (scene, editing modes, ...) come from the URL in config.ts.
 */
import type { EditorConfig } from '@osm-editor-kit/maid-core'
import dense from '../../../fixtures/dense.meta.json'
import medium from '../../../fixtures/medium.meta.json'
import small from '../../../fixtures/small.meta.json'
import { elementInfo } from './modules/element-info'
import { type Bbox, sceneBounds } from './modules/scene-bounds'
import { readParams, setupParams } from './url/params'

/** Extent of each fixture, from its meta file */
const BBOX: Record<string, Bbox> = {
  small: small.bbox as Bbox,
  medium: medium.bbox as Bbox,
  dense: dense.bbox as Bbox,
}

const scene = readParams(setupParams, window.location.search).scene
const bbox = BBOX[scene] ?? (small.bbox as Bbox)

export const editorConfig: EditorConfig = {
  modules: [
    // inspector section "Element": id, version and upload state of the selected object
    elementInfo(),
    // dashed outline around the area the fixture covers
    sceneBounds({ bbox }),
  ],
}
