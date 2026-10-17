import { useEffect, useState } from 'react'
import { loadSvgUrl, type Country } from './catalogue.ts'

export type LoadSvg = (country: Country, osmValuePart: string) => Promise<string | undefined>
export const DEFAULT_LOAD_SVG: LoadSvg = loadSvgUrl

/** The URL of a sign's image, undefined while it loads and when the sign has none. `part` undefined: no image wanted. */
export function useSignImage(
  load: LoadSvg,
  country: Country,
  part: string | undefined,
): string | undefined {
  const key = part === undefined ? undefined : `${country}:${part}`
  const [loaded, setLoaded] = useState<{ key: string; url: string | undefined } | undefined>()

  useEffect(
    function loadImage() {
      if (key === undefined || part === undefined) return
      let cancelled = false
      load(country, part).then(
        (url) => {
          if (!cancelled) setLoaded({ key, url })
        },
        () => {
          if (!cancelled) setLoaded({ key, url: undefined })
        },
      )
      return () => {
        cancelled = true
      }
    },
    [load, country, part, key],
  )

  return loaded && loaded.key === key ? loaded.url : undefined
}
