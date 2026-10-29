import { device, m } from '@osm-editor-kit/maid-i18n'
/**
 * The field's texts from the app's Paraglide messages (packages/i18n/messages, keys `traffic_sign_*`), made when the
 * field renders so a language change shows at once. The path is relative because this package does not declare
 * `@osm-editor-kit/maid-i18n` (see README.md).
 */
import type { TrafficSignTexts } from '@osm-editor-kit/osm-traffic-sign-field'

export function trafficSignTexts(): TrafficSignTexts {
  return {
    empty: m.traffic_sign_empty(),
    addPlaceholder: m.traffic_sign_add_placeholder(),
    searchLabel: m.traffic_sign_search_label(),
    noResults: m.traffic_sign_no_results({ ...device() }),
    moreResults: (v) => m.traffic_sign_more_results(v),
    noSign: m.traffic_sign_no_sign(),
    unknownSign: m.traffic_sign_unknown(),
    moveUp: m.traffic_sign_move_up(),
    moveDown: m.traffic_sign_move_down(),
    moved: (v) => m.traffic_sign_moved(v),
    remove: m.traffic_sign_remove(),
    removeSign: (v) => m.traffic_sign_remove_sign(v),
    loading: m.traffic_sign_loading(),
    mixed: m.traffic_sign_mixed(),
  }
}
