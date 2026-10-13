import type { FieldComponent } from '@osm-editor-kit/maid-ui'

/** The field type the module registers on `inspector.field`; a preset field with this `type` uses RestrictionField */
export const PARKING_RESTRICTION_FIELD_TYPE = 'parkingRestriction'

/**
 * The field for a parking restriction with its conditions (`parking:left:restriction` and
 * `parking:left:restriction:conditional`). Renders nothing until the restriction agent fills it in.
 *
 * To make the map show the side while the field is used, wrap the control in an element with `data-focus-key`
 * (the tag the control is about) and `data-focus-side` (left, right or both); see FieldFocus in maid-ui.
 */
export const RestrictionField: FieldComponent = () => null
