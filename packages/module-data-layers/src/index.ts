import './extension-points.ts'
export {
  checkDataLayerConfig,
  DATA_LAYER_KINDS,
  guessKind,
  kindLabel,
  type Checked,
  type DataLayerConfig,
  type DataLayerKind,
} from './config.ts'
export { dataLayers, type DataLayersOptions } from './module.tsx'
export type { DataLayersSection } from './extension-points.ts'
