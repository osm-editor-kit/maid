// Maid's own test: the direct path from API JSON gives the same entities as Rapid's parser.
import { describe, expect, it } from 'bun:test'
import { gunzipSync } from 'node:zlib'
import { readFileSync } from 'node:fs'
import { ModelContext, OsmJSONParser, createOsmEntity, entitiesFromOsmJson } from '../../src/index.ts'
import type { OsmJsonElement } from '../../src/index.ts'

const fixture = JSON.parse(
  gunzipSync(readFileSync(`${import.meta.dir}/../../../../fixtures/small.json.gz`)).toString(),
) as { elements: OsmJsonElement[] }

describe('entitiesFromOsmJson', () => {
  it('matches the parser for every element of a fixture', () => {
    const viaParser = new OsmJSONParser()
      .parse(fixture)
      .data.map((d) => createOsmEntity(new ModelContext(), d as Record<string, unknown>))
    const direct = entitiesFromOsmJson(new ModelContext(), fixture.elements)
    expect(direct.length).toBe(viaParser.length)
    const strip = (props: Record<string, unknown>) => ({ ...props, v: undefined })
    for (let i = 0; i < direct.length; i++) {
      expect(strip(direct[i]!.props)).toEqual(strip(viaParser[i]!.props))
    }
  })

  it('skips what is already known', () => {
    const first = fixture.elements[0]!
    const id = first.type[0] + String(first.id)
    const entities = entitiesFromOsmJson(new ModelContext(), fixture.elements, (e) => e === id)
    expect(entities.length).toBe(fixture.elements.length - 1)
    expect(entities.some((e) => e.id === id)).toBe(false)
  })
})
