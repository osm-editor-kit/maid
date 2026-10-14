import { m } from '../paraglide/messages.js'

/**
 * MapLibre's own texts that Maid shows: the attribution control's button and its feedback link, and the name
 * of the map for assistive technology. Passed to each map as its `locale` prop (MapLibre's keys, its
 * default_locale). Call it during render: the language is set before the first render (mount.tsx).
 */
export function mapLibreLocale(): Record<string, string> {
  return {
    'AttributionControl.ToggleAttribution': m.maplibre_attribution_toggle(),
    'AttributionControl.MapFeedback': m.maplibre_attribution_feedback(),
    'Map.Title': m.maplibre_map_title(),
  }
}
