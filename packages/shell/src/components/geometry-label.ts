import { m } from '@osm-editor-kit/maid-i18n'

/** The geometries a selected feature can have */
export type FeatureGeometry = 'point' | 'vertex' | 'line' | 'area' | 'relation'

/** The name of a geometry, read when it is shown, as the language is set at mount */
export function geometryLabel(geometry: FeatureGeometry): string {
  switch (geometry) {
    case 'point':
      return m.topbar_point()
    case 'vertex':
      return m.shell_geometry_vertex()
    case 'line':
      return m.topbar_line()
    case 'area':
      return m.topbar_area()
    case 'relation':
      return m.shell_geometry_relation()
  }
}
