import { type TagView, useSettingsActions, useStoredShown } from '@osm-editor-kit/maid-ui'

/** The settings key of the Tags sheet's view (`shown` in the UI settings): `sides` or `exact` */
const TAG_VIEW_SETTING = 'tags-view'

/**
 * The view of the Tags sheet the person chose, the same for one feature and for several: sides unless they chose the
 * raw view (stored with the settings), and the function that changes it.
 */
export function useTagView(): [TagView, (view: TagView) => void] {
  const view: TagView = useStoredShown(TAG_VIEW_SETTING) === 'exact' ? 'exact' : 'sides'
  const { setShown } = useSettingsActions()
  return [view, (next) => setShown(TAG_VIEW_SETTING, next)]
}
