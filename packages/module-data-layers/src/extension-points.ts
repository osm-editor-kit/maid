/**
 * The extension point of the data layers module: a block of another module in the data layers panel, below the layers.
 * The imagery module lists the overlays of the imagery index there (Tobias, 2026-11-27: overlays are data, not a
 * background). Declared in this file, as every package declares its points in `src/extension-points.ts`.
 */
import type { ComponentType } from 'react'

export interface DataLayersSection {
  readonly id: string
  /** The block; mounted while the panel is open */
  component: ComponentType
}

declare module '@osm-editor-kit/maid-core' {
  interface ExtensionPoints {
    'data-layers.section': DataLayersSection
  }
}
