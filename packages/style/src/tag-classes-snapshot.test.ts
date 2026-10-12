// Snapshot of tagClasses over every distinct tag set of the dense fixture, per element type.
// The hashes were recorded from the code before the no-primary-tag speed-up. A change to
// tagClasses must keep them: any difference in a class list changes the hash.
import { describe, expect, it } from 'bun:test'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { tagClasses, type Tags } from './classes'

type Element = { type: string; tags?: Tags }

const FIXTURE = new URL('../../../fixtures/dense.json.gz', import.meta.url)

let elements: Element[] | undefined
function loadElements(): Element[] {
  elements ??= (JSON.parse(gunzipSync(readFileSync(FIXTURE)).toString()) as { elements: Element[] })
    .elements
  return elements
}

// Distinct tag sets of one element type, in order of first appearance. The key keeps the
// key order, because tagClasses reads keys in insertion order (surface and tracktype).
function distinctTagSets(type: string): Tags[] {
  const seen = new Set<string>()
  const sets: Tags[] = []
  for (const el of loadElements()) {
    if (el.type !== type) continue
    const tags = el.tags ?? {}
    const key = JSON.stringify(tags)
    if (seen.has(key)) continue
    seen.add(key)
    sets.push(tags)
  }
  return sets
}

function snapshot(type: string): { sets: number; hash: string } {
  const sets = distinctTagSets(type)
  const lines = sets.map((tags) => tagClasses(tags).join(' '))
  const hash = createHash('sha256').update(lines.join('\n')).digest('hex')
  return { sets: sets.length, hash }
}

describe('tagClasses snapshot over the dense fixture', () => {
  it('gives the recorded class lists for every distinct node tag set', () => {
    expect(snapshot('node')).toEqual({
      sets: 9615,
      hash: 'b8d6d54d2cb0eeae7239a9d7cc7cb85e23ace16029db76f9368d0db9c4abf856',
    })
  })

  it('gives the recorded class lists for every distinct way tag set', () => {
    expect(snapshot('way')).toEqual({
      sets: 6105,
      hash: '126e22da6b2b7b4424a903dffe99e47989b70f7b9ddf7c71246056c70d448433',
    })
  })

  it('gives the recorded class lists for every distinct relation tag set', () => {
    expect(snapshot('relation')).toEqual({
      sets: 207,
      hash: '08292893b847dfe574fbf9b3dc0caa74dc3b64312798961fa097b06e4bbc1c97',
    })
  })
})
