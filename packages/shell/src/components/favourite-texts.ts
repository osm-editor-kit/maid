import { m } from '@osm-editor-kit/maid-i18n'
import {
  favouriteModifierLabel,
  type FavouriteTexts,
  type PresetPickerTexts,
} from '@osm-editor-kit/maid-ui'
import { MAC } from '../platform'

/** The texts of favourites in the editor's language. The key is Option on Apple devices, Alt elsewhere. */
export function favouriteTexts(): FavouriteTexts {
  const key = favouriteModifierLabel(MAC)
  return {
    geometries: { point: m.topbar_point(), line: m.topbar_line(), area: m.topbar_area() },
    startHint: (name, number) => m.picker_favourite_start_hint({ key, number, name }),
    onlyAs: (geometry) => m.picker_favourite_only_as({ geometry }),
    addAs: (name, geometry) => m.favourite_add_as({ name, geometry }),
    remove: (name) => m.favourite_remove({ name }),
  }
}

/** The texts of the type picker in the editor's language: its categories, the recent and the favourites */
export function pickerTexts(): PresetPickerTexts {
  return {
    recent: m.picker_recent(),
    expand: m.picker_category_expand(),
    collapse: m.picker_category_collapse(),
    favourites: m.picker_favourites(),
    favouritesExpand: m.picker_favourites_expand(),
    favouritesCollapse: m.picker_favourites_collapse(),
    ...favouriteTexts(),
  }
}
