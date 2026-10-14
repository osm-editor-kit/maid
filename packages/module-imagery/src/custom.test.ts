import { describe, expect, it } from 'bun:test'
import {
  checkTemplate,
  citedName,
  cleanTemplate,
  drawCustom,
  keyLikeNames,
  redactTemplate,
  sameTemplate,
  shortLabel,
  toRasterSource,
} from './custom.ts'

/** Translates with a pixel ratio of 1, and fails the test when a template is refused */
function source(template: string, devicePixelRatio = 1) {
  const result = toRasterSource(template, { devicePixelRatio })
  if (!result.ok) throw new Error(`refused: ${result.reason}`)
  return result.source
}

function refusal(template: string) {
  const result = toRasterSource(template, { devicePixelRatio: 1 })
  if (result.ok) throw new Error(`accepted: ${JSON.stringify(result.source)}`)
  return result.reason
}

const EXAMPLE = 'https://tiles.example.org'

describe('toRasterSource: tile addresses', () => {
  it('keeps {x} and {y} and turns {zoom} into {z}', () => {
    expect(source(`${EXAMPLE}/{zoom}/{x}/{y}.png`)).toEqual({
      type: 'raster',
      tiles: [`${EXAMPLE}/{z}/{x}/{y}.png`],
      tileSize: 256,
    })
  })

  it('takes {z} as it is, and gives no scheme for xyz', () => {
    const spec = source(`${EXAMPLE}/{z}/{x}/{y}.png`)
    expect(spec.tiles).toEqual([`${EXAMPLE}/{z}/{x}/{y}.png`])
    expect(spec.scheme).toBeUndefined()
  })

  it('gives TMS with {-y} and {ty}: {y} for MapLibre and scheme tms', () => {
    for (const token of ['{-y}', '{ty}']) {
      expect(source(`${EXAMPLE}/{z}/{x}/${token}.png`)).toEqual({
        type: 'raster',
        tiles: [`${EXAMPLE}/{z}/{x}/{y}.png`],
        tileSize: 256,
        scheme: 'tms',
      })
    }
  })

  it('gives one tile URL per {switch:} host, in order', () => {
    const spec = source('https://t{switch:a,b,c}.example.org/{z}/{x}/{y}.png')
    expect(spec.tiles).toEqual([
      'https://ta.example.org/{z}/{x}/{y}.png',
      'https://tb.example.org/{z}/{x}/{y}.png',
      'https://tc.example.org/{z}/{x}/{y}.png',
    ])
  })

  it('takes a single host in a {switch:} too', () => {
    expect(source('https://t{switch:a}.example.org/{z}/{x}/{y}.png').tiles).toEqual([
      'https://ta.example.org/{z}/{x}/{y}.png',
    ])
  })

  it('gives MapLibre quadkeys for {u}', () => {
    expect(source(`${EXAMPLE}/quad/{u}.jpeg`).tiles).toEqual([`${EXAMPLE}/quad/{quadkey}.jpeg`])
  })

  it('gives @2x for {@2x} and {r} only above a pixel ratio of 1', () => {
    expect(source(`${EXAMPLE}/{z}/{x}/{y}{@2x}.png`, 1).tiles).toEqual([
      `${EXAMPLE}/{z}/{x}/{y}.png`,
    ])
    expect(source(`${EXAMPLE}/{z}/{x}/{y}{r}.png`, 1.5).tiles).toEqual([
      `${EXAMPLE}/{z}/{x}/{y}@2x.png`,
    ])
    expect(source(`${EXAMPLE}/{z}/{x}/{y}{r}.png`, 2).tiles).toEqual([
      `${EXAMPLE}/{z}/{x}/{y}@2x.png`,
    ])
  })

  it('uses a tile size of 256 and sets no min or max zoom', () => {
    const spec = source(`${EXAMPLE}/{z}/{x}/{y}.png`)
    expect(spec.tileSize).toBe(256)
    expect(spec.minzoom).toBeUndefined()
    expect(spec.maxzoom).toBeUndefined()
  })
})

describe('toRasterSource: WMS', () => {
  it('gives MapLibre bbox, EPSG:3857 and 256 for the WMS tokens', () => {
    const spec = source(
      `${EXAMPLE}/wms?SERVICE=WMS&SRS={proj}&CRS={wkid}&BBOX={bbox}&WIDTH={width}&HEIGHT={height}`,
    )
    expect(spec.tiles).toEqual([
      `${EXAMPLE}/wms?SERVICE=WMS&SRS=EPSG:3857&CRS=3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256`,
    ])
    expect(spec.scheme).toBeUndefined()
  })

  it('refuses {w}, {s}, {n} and {e}, and says that MapLibre has no token for them', () => {
    for (const token of ['{w}', '{s}', '{n}', '{e}']) {
      const reason = refusal(`${EXAMPLE}/wms?BBOX=${token},0,0,0`)
      expect(reason).toContain(token)
      expect(reason).toContain('MapLibre has no token')
    }
  })

  it('refuses {proj} or {width} without {bbox}', () => {
    expect(refusal(`${EXAMPLE}/wms?SRS={proj}`)).toContain('{proj} is only used')
    expect(refusal(`${EXAMPLE}/wms?WIDTH={width}`)).toContain('{width} is only used')
  })
})

describe('toRasterSource: refusals', () => {
  it('refuses an empty template, and one that is only a hash', () => {
    expect(refusal('')).toBe('Enter a tile URL template.')
    expect(refusal('   ')).toBe('Enter a tile URL template.')
    expect(refusal(`#${EXAMPLE}`)).toBe('Enter a tile URL template.')
  })

  it('accepts only http and https', () => {
    expect(refusal('ftp://tiles.example.org/{z}/{x}/{y}.png')).toBe(
      'The template must start with https:// or http://.',
    )
    expect(refusal('tiles.example.org/{z}/{x}/{y}.png')).toBe(
      'The template must start with https:// or http://.',
    )
    expect(source('http://localhost:8090/{z}/{x}/{y}.png').tiles).toEqual([
      'http://localhost:8090/{z}/{x}/{y}.png',
    ])
  })

  it('refuses a host that is not a web address', () => {
    expect(refusal('https://exa mple.org/{z}/{x}/{y}.png')).toBe('This is not a web address.')
  })

  it('refuses an unknown token and names it', () => {
    expect(refusal(`${EXAMPLE}/{z}/{x}/{y}.png?key={apikey}`)).toBe(
      'The token {apikey} is not supported.',
    )
    expect(refusal(`${EXAMPLE}/{prefix}/{z}/{x}/{y}.png`)).toBe(
      'The token {prefix} is not supported.',
    )
  })

  it('refuses a brace with no partner', () => {
    expect(refusal(`${EXAMPLE}/{z/{x}/{y}.png`)).toContain('brace')
    expect(refusal(`${EXAMPLE}/{{z}}/{x}/{y}.png`)).toContain('brace')
  })

  it('refuses a template with no tile address', () => {
    expect(refusal(`${EXAMPLE}/static.png`)).toBe(
      'Use {z}, {x} and {y} for tiles, {u} for quadkeys, or {bbox} for WMS.',
    )
  })

  it('refuses tiles without all of z, x and y', () => {
    expect(refusal(`${EXAMPLE}/{z}/{y}.png`)).toBe('Tiles need {z} (or {zoom}), {x} and {y}.')
    expect(refusal(`${EXAMPLE}/{x}/{y}.png`)).toBe('Tiles need {z} (or {zoom}), {x} and {y}.')
  })

  it('refuses two kinds of address in one template', () => {
    expect(refusal(`${EXAMPLE}/{z}/{x}/{y}.png?bbox={bbox}`)).toContain('one kind of address')
    expect(refusal(`${EXAMPLE}/{u}/{z}/{x}/{y}.png`)).toContain('one kind of address')
  })

  it('refuses {y} and {-y} together', () => {
    expect(refusal(`${EXAMPLE}/{z}/{x}/{y}/{-y}.png`)).toBe('Use either {y} or {-y}, not both.')
  })

  it('refuses an empty {switch:} choice and more than one {switch:}', () => {
    expect(refusal('https://t{switch:}.example.org/{z}/{x}/{y}.png')).toContain('{switch:…}')
    expect(refusal('https://t{switch:a,,b}.example.org/{z}/{x}/{y}.png')).toContain('{switch:…}')
    expect(refusal('https://t{switch:a,b}.{switch:c,d}.example.org/{z}/{x}/{y}.png')).toContain(
      'one {switch:…}',
    )
  })
})

describe('checkTemplate and the cleaning', () => {
  it('strips line breaks and the spaces around a template, as iD does', () => {
    const result = checkTemplate(`  ${EXAMPLE}/{z}/{x}/\n{y}.png\r\n  `)
    expect(result).toEqual({ ok: true, template: `${EXAMPLE}/{z}/{x}/{y}.png` })
  })

  it('drops the hash part before it is checked', () => {
    expect(source(`${EXAMPLE}/{z}/{x}/{y}.png#{anything}`).tiles).toEqual([
      `${EXAMPLE}/{z}/{x}/{y}.png`,
    ])
  })

  it('refuses what cannot be saved, with the reason', () => {
    expect(checkTemplate('')).toEqual({ ok: false, reason: 'Enter a tile URL template.' })
  })

  it('cleanTemplate removes line breaks and the outer spaces only', () => {
    expect(cleanTemplate(' a b\n')).toBe('a b')
  })

  it('compares templates once cleaned', () => {
    expect(sameTemplate(`${EXAMPLE}/{z}/{x}/{y}.png\n`, `${EXAMPLE}/{z}/{x}/{y}.png`)).toBe(true)
    expect(sameTemplate(`${EXAMPLE}/{z}/{x}/{y}.png`, `${EXAMPLE}/{z}/{x}/{y}.jpg`)).toBe(false)
  })
})

describe('the name iD cites, without keys', () => {
  it('cites a plain template as iD does: Custom (template )', () => {
    expect(citedName(`${EXAMPLE}/{z}/{x}/{y}.png`)).toBe(`Custom (${EXAMPLE}/{z}/{x}/{y}.png )`)
  })

  it('takes out a key given as ?key=', () => {
    const cited = citedName(`${EXAMPLE}/{z}/{x}/{y}.png?key=SECRET123`)
    expect(cited).not.toContain('SECRET123')
    expect(cited).toBe(`Custom (${EXAMPLE}/{z}/{x}/{y}.png?key={apikey} )`)
  })

  it('takes out a key given as &apikey=', () => {
    const cited = citedName(`${EXAMPLE}/{z}/{x}/{y}.png?layer=a&apikey=SECRET123`)
    expect(cited).not.toContain('SECRET123')
    expect(cited).toContain('&apikey={apikey}')
    expect(cited).toContain('layer=a')
  })

  it('takes out access_token=', () => {
    const cited = citedName(`${EXAMPLE}/{z}/{x}/{y}.png?access_token=SECRET123&x=1`)
    expect(cited).not.toContain('SECRET123')
    expect(cited).toContain('access_token={apikey}&x=1')
  })

  it('takes out a token in the path and a key= anywhere else', () => {
    expect(redactTemplate(`${EXAMPLE}/token/SECRET123/{z}/{x}/{y}.png`)).not.toContain('SECRET123')
    expect(redactTemplate(`${EXAMPLE}/wms;key=SECRET123/{z}/{x}/{y}.png`)).not.toContain(
      'SECRET123',
    )
  })

  it('takes out a user name and password before the host, and the hash', () => {
    const cited = citedName(`https://user:SECRET123@tiles.example.org/{z}/{x}/{y}.png#SECRET456`)
    expect(cited).not.toContain('SECRET123')
    expect(cited).not.toContain('SECRET456')
    expect(cited).toContain('tiles.example.org')
  })

  it('leaves the tokens of the template alone', () => {
    expect(citedName(`${EXAMPLE}/{z}/{x}/{y}.png?format=png`)).toBe(
      `Custom (${EXAMPLE}/{z}/{x}/{y}.png?format=png )`,
    )
  })
})

describe('shortLabel', () => {
  it('gives host and path, without the scheme, www, query and tokens', () => {
    expect(shortLabel('https://www.tiles.example.org/berlin/{z}/{x}/{y}.png?format=png')).toBe(
      'tiles.example.org/berlin',
    )
    expect(shortLabel(`${EXAMPLE}/{z}/{x}/{y}.png`)).toBe('tiles.example.org')
  })
})

describe('keyLikeNames: a part of the template that looks like a key', () => {
  it('finds the query names that say key, token, signature or secret, in any case', () => {
    expect(keyLikeNames(`${EXAMPLE}/{z}/{x}/{y}.png?apikey={apikey}&style=2`)).toEqual(['apikey'])
    expect(keyLikeNames(`${EXAMPLE}/{z}/{x}/{y}?api_key=1&accessToken=2&Signature=3`)).toEqual([
      'api_key',
      'accessToken',
      'Signature',
    ])
  })

  it('finds a path part that says token, and a placeholder that names a key', () => {
    expect(keyLikeNames(`${EXAMPLE}/token/{apikey}/{z}/{x}/{y}.png`)).toEqual(['token', '{apikey}'])
  })

  it('finds nothing in a plain template, or in the host', () => {
    expect(keyLikeNames(`${EXAMPLE}/{z}/{x}/{y}.png?format=png&style=2`)).toEqual([])
    expect(keyLikeNames('https://keys.example.org/{z}/{x}/{y}.png')).toEqual([])
  })

  it('ignores the hash and lists each name once', () => {
    expect(keyLikeNames(`${EXAMPLE}/{z}/{x}/{y}.png?key=1&key=2#token`)).toEqual(['key'])
  })
})

describe('drawCustom', () => {
  it('draws a template like an index layer, with the cited name', () => {
    const drawn = drawCustom('custom-1', `${EXAMPLE}/{z}/{x}/{y}.png?key=SECRET123`, true, 1)
    if (drawn === undefined) throw new Error('not drawn')
    expect(drawn.id).toBe('custom-1')
    expect(drawn.background).toBe(true)
    expect(drawn.name).toBe(`Custom (${EXAMPLE}/{z}/{x}/{y}.png?key={apikey} )`)
    expect(drawn.name).not.toContain('SECRET123')
    expect(drawn.layer).toEqual({ id: drawn.sourceId, type: 'raster', source: drawn.sourceId })
    expect(drawn.source.tiles).toEqual([`${EXAMPLE}/{z}/{x}/{y}.png?key=SECRET123`])
  })

  it('gives a new source id when the template changes, so an edit is drawn again', () => {
    const a = drawCustom('custom-1', `${EXAMPLE}/{z}/{x}/{y}.png`, true, 1)
    const b = drawCustom('custom-1', `${EXAMPLE}/{z}/{x}/{y}.jpg`, true, 1)
    expect(a?.sourceId).toMatch(/^imagery-custom-1-/)
    expect(a?.sourceId).not.toBe(b?.sourceId)
  })

  it('gives nothing for a refused template', () => {
    expect(drawCustom('custom-1', 'ftp://x/{z}/{x}/{y}', true, 1)).toBeUndefined()
  })
})
