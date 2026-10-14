import { getLocale } from '@osm-editor-kit/maid-i18n'
import { StreetImageryLocaleProvider } from '@osm-editor-kit/street-imagery-react'
import type { ComponentType } from 'react'

/**
 * The photo viewer's texts and dates in the app's language. The viewer has English and German; the other app
 * languages get English.
 */
export function withViewerLocale<Props extends object>(Component: ComponentType<Props>) {
  return function WithViewerLocale(props: Props) {
    return (
      <StreetImageryLocaleProvider locale={getLocale() === 'de' ? 'de' : 'en'}>
        <Component {...props} />
      </StreetImageryLocaleProvider>
    )
  }
}
