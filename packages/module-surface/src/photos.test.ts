import { describe, expect, it } from 'bun:test'
import { catalogue } from '@osm-editor-kit/surface-smoothness-data'
import { PICTURES } from './photos.ts'

/** Every package-relative path the catalogue names: surface photos, matrix photos, level icons and credits */
function pathsNamedByCatalogue(): string[] {
  const paths = new Set<string>()
  for (const info of Object.values(catalogue.surfaces)) if (info.icon) paths.add(info.icon)
  for (const cells of Object.values(catalogue.smoothnessMatrix))
    for (const cell of Object.values(cells)) paths.add(cell.photo)
  for (const level of Object.values(catalogue.smoothnessLevels))
    if (level.vehicleIcon) paths.add(level.vehicleIcon)
  for (const entry of catalogue.attribution) paths.add(entry.file)
  return [...paths].sort()
}

describe('PICTURES', () => {
  it('has a bundled file for every path the catalogue names', () => {
    const missing = pathsNamedByCatalogue().filter((path) => !(path in PICTURES))
    expect(missing).toEqual([])
  })

  it('has no picture the catalogue does not name', () => {
    const named = new Set(pathsNamedByCatalogue())
    const extra = Object.keys(PICTURES).filter((path) => !named.has(path))
    expect(extra).toEqual([])
  })

  it('maps each path to a URL string (the bundler emits the file)', () => {
    for (const url of Object.values(PICTURES)) {
      expect(typeof url).toBe('string')
      expect(url.length).toBeGreaterThan(0)
    }
  })

  it('has 55 photos and 8 vehicle icons, as the catalogue counts', () => {
    const photos = Object.keys(PICTURES).filter((path) => path.startsWith('images/'))
    const icons = Object.keys(PICTURES).filter((path) => path.startsWith('icons/'))
    expect(photos).toHaveLength(catalogue.meta.counts.images ?? -1)
    expect(icons).toHaveLength(catalogue.meta.counts.icons ?? -1)
  })
})
