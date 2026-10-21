/**
 * Downloads OSM2World's browser build and its style file into `vendor/` (git-ignored), once, by a person
 * (Tobias allowed it on 2026-10-21). The prototype then runs without any network.
 *
 *   bun run osm2world-fetch
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

/** The build the object viewer uses (osm2world.org/build/web/) */
const VERSION = '0.5.0-SNAPSHOT_2026-06-16'
const STYLE = 'https://tiles.osm2world.org/default-style'
const FILES = {
  'osm2world-core-web.mjs': `https://osm2world.org/build/web/${VERSION}/osm2world-core-web.mjs`,
  // the style and the files it includes
  'standard.properties': `${STYLE}/standard.properties`,
  'locales/DE-defaults.properties': `${STYLE}/locales/DE-defaults.properties`,
  'locales/DE-trafficSigns.properties': `${STYLE}/locales/DE-trafficSigns.properties`,
  'locales/PL-trafficSigns.properties': `${STYLE}/locales/PL-trafficSigns.properties`,
}

const vendor = join(import.meta.dir, 'vendor')
mkdirSync(join(vendor, 'locales'), { recursive: true })
for (const [name, url] of Object.entries(FILES)) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url}: ${response.status}`)
  await Bun.write(join(vendor, name), response)
  console.log(`${name} from ${url}`)
}
console.log(`Wrote ${vendor}`)
