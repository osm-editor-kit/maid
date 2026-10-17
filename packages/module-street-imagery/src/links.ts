import { providerExternalLink, type NormalizedPhoto } from '@osm-editor-kit/street-imagery'
import { m } from './messages.ts'
import { PROVIDER_LABELS, type ImageryProviderId } from './state.ts'

/**
 * The page of a photo on its provider's own site (Mapillary's viewer, Panoramax's viewer). A link
 * the person opens in a new tab: the module requests nothing from it. The label names the site.
 */
export function photoPageLink(photo: NormalizedPhoto): { href: string; label: string } {
  const name = PROVIDER_LABELS[photo.providerId as ImageryProviderId] ?? photo.providerId
  return { href: providerExternalLink(photo), label: m.link_open_on({ site: name }) }
}
