import type { CountryPrefixType, SignType } from '@osm-traffic-signs/converter'

/**
 * Lazy loading of one country's data. Every import is a literal so the bundler splits one chunk per country and
 * only the chunk of the country in use is ever requested. The converter's main entry is not imported here at
 * runtime: it pulls all nine catalogues in.
 */
export type Country = CountryPrefixType
export const COUNTRIES: readonly Country[] = ['AT', 'AU', 'BE', 'BR', 'CA', 'DE', 'FR', 'IT', 'PL']

export function isCountry(value: string | undefined): value is Country {
  return value !== undefined && (COUNTRIES as readonly string[]).includes(value)
}

type Catalogue = readonly SignType[]
const CATALOGUES: Record<Country, () => Promise<Catalogue>> = {
  AT: () => import('@osm-traffic-signs/converter/data/AT').then((m) => m.trafficSignData),
  AU: () => import('@osm-traffic-signs/converter/data/AU').then((m) => m.trafficSignData),
  BE: () => import('@osm-traffic-signs/converter/data/BE').then((m) => m.trafficSignData),
  BR: () => import('@osm-traffic-signs/converter/data/BR').then((m) => m.trafficSignData),
  CA: () => import('@osm-traffic-signs/converter/data/CA').then((m) => m.trafficSignData),
  DE: () => import('@osm-traffic-signs/converter/data/DE').then((m) => m.trafficSignData),
  FR: () => import('@osm-traffic-signs/converter/data/FR').then((m) => m.trafficSignData),
  IT: () => import('@osm-traffic-signs/converter/data/IT').then((m) => m.trafficSignData),
  PL: () => import('@osm-traffic-signs/converter/data/PL').then((m) => m.trafficSignData),
}

const catalogueLoads = new Map<Country, Promise<Catalogue>>()
const loadedCatalogues = new Map<Country, Catalogue>()

/** The catalogue of a country, loaded once. A failed load is not cached, so the next call tries again. */
export function loadCatalogue(country: Country): Promise<Catalogue> {
  const active = catalogueLoads.get(country)
  if (active) return active
  const load = CATALOGUES[country]().then(
    (catalogue) => {
      loadedCatalogues.set(country, catalogue)
      return catalogue
    },
    (error: unknown) => {
      catalogueLoads.delete(country)
      throw error
    },
  )
  catalogueLoads.set(country, load)
  return load
}

/** The catalogue if it has been loaded already (a first render without a wait) */
export function loadedCatalogue(country: Country): Catalogue | undefined {
  return loadedCatalogues.get(country)
}

type SvgModule = { default: string }
type SvgLoaders = Record<string, () => Promise<SvgModule>>
const SVG_LOADERS: Record<Country, () => Promise<SvgLoaders>> = {
  AT: () => import('@osm-traffic-signs/converter/data-svgs/AT/loaders').then((m) => m.SvgLoadersAT),
  AU: () => import('@osm-traffic-signs/converter/data-svgs/AU/loaders').then((m) => m.SvgLoadersAU),
  BE: () => import('@osm-traffic-signs/converter/data-svgs/BE/loaders').then((m) => m.SvgLoadersBE),
  BR: () => import('@osm-traffic-signs/converter/data-svgs/BR/loaders').then((m) => m.SvgLoadersBR),
  CA: () => import('@osm-traffic-signs/converter/data-svgs/CA/loaders').then((m) => m.SvgLoadersCA),
  DE: () => import('@osm-traffic-signs/converter/data-svgs/DE/loaders').then((m) => m.SvgLoadersDE),
  FR: () => import('@osm-traffic-signs/converter/data-svgs/FR/loaders').then((m) => m.SvgLoadersFR),
  IT: () => import('@osm-traffic-signs/converter/data-svgs/IT/loaders').then((m) => m.SvgLoadersIT),
  PL: () => import('@osm-traffic-signs/converter/data-svgs/PL/loaders').then((m) => m.SvgLoadersPL),
}

/** The name of a sign's bundled SVG (same rule as the converter's createSvgImportname), e.g. `DE_274__30_` */
export function svgName(country: Country, osmValuePart: string): string {
  const withUnderscores = osmValuePart.replace(/\[/g, '__').replace(/\]/g, '__')
  return `${country}_${withUnderscores.replace(/[^a-zA-Z0-9_]/g, '_')}`
}

const loaderLoads = new Map<Country, Promise<SvgLoaders>>()
const svgLoads = new Map<string, Promise<string | undefined>>()

/**
 * The URL of a sign's bundled SVG (a Vite asset), or undefined when the sign has none. Never the wiki URL of
 * `sign.image`: automated runs send no request to OSM infrastructure. Loaded once per sign.
 */
export function loadSvgUrl(country: Country, osmValuePart: string): Promise<string | undefined> {
  const name = svgName(country, osmValuePart)
  const cacheKey = name
  const active = svgLoads.get(cacheKey)
  if (active) return active
  let loaders = loaderLoads.get(country)
  if (!loaders) {
    loaders = SVG_LOADERS[country]()
    loaderLoads.set(country, loaders)
  }
  const load = loaders
    .then(async (map) => {
      const loader = map[name]
      return loader ? (await loader()).default : undefined
    })
    .catch(() => {
      svgLoads.delete(cacheKey)
      return undefined
    })
  svgLoads.set(cacheKey, load)
  return load
}
