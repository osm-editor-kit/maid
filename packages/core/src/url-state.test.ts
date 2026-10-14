import { describe, expect, test } from 'bun:test'
import { createEditor } from './editor.ts'
import { createUrlParams, layered, type UrlParser } from './url-state.ts'

/** A parser of the same shape as a nuqs parser, without nuqs */
const parseAsCount: UrlParser<number> = {
  parse: (value) => (/^\d+$/.test(value) ? Number(value) : null),
  serialize: (value) => String(value),
}

describe('declaring a URL parameter', () => {
  test('a declared parameter is listed and read by its name, with replace as the default history', () => {
    const urlParams = createUrlParams(['map'])
    const { handle } = urlParams.declare({ name: 'count', parser: parseAsCount }, 'counter')
    expect(urlParams.get('count')).toBe(handle)
    expect(urlParams.list().map((h) => h.name)).toEqual(['count'])
    expect(handle.options).toEqual({ history: 'replace' })
  })

  test('a declared history and clearOnDefault are kept', () => {
    const { handle } = createUrlParams().declare(
      { name: 'count', parser: parseAsCount, options: { history: 'push', clearOnDefault: false } },
      'counter',
    )
    expect(handle.options).toEqual({ history: 'push', clearOnDefault: false })
  })

  test('the parser round trips a declared value', () => {
    const { handle } = createUrlParams().declare({ name: 'count', parser: parseAsCount }, 'counter')
    for (const value of [0, 7, 120]) {
      expect(handle.parser.parse(handle.parser.serialize(value))).toBe(value)
    }
    expect(handle.parser.parse('seven')).toBeNull()
  })

  test('a name the app owns is refused, with the reason', () => {
    const urlParams = createUrlParams(['map', 'background'])
    expect(() => urlParams.declare({ name: 'map', parser: parseAsCount }, 'lenses')).toThrow(
      'URL parameter "map" (module "lenses") is taken by the app\'s own parameters',
    )
    expect(() =>
      urlParams.declare({ name: 'background', parser: parseAsCount }, 'imagery'),
    ).toThrow('taken by the app')
  })

  test('a name another module declared is refused, and the first one stays', () => {
    const urlParams = createUrlParams()
    urlParams.declare({ name: 'overlays', parser: parseAsCount }, 'imagery')
    expect(() => urlParams.declare({ name: 'overlays', parser: parseAsCount }, 'notes')).toThrow(
      'URL parameter "overlays" (module "notes") is already declared by module "imagery"',
    )
    expect(urlParams.get('overlays')?.name).toBe('overlays')
  })

  test('an iD name another declared parameter uses is refused', () => {
    const urlParams = createUrlParams()
    urlParams.declare({ name: 'brightness', parser: parseAsCount, iD: { name: 'bright' } }, 'a')
    expect(() =>
      urlParams.declare({ name: 'shade', parser: parseAsCount, iD: { name: 'bright' } }, 'b'),
    ).toThrow(
      'iD parameter "bright" (URL parameter "shade", module "b") is already used by "brightness"',
    )
  })

  test('an iD alias another declared parameter reads is refused as well', () => {
    const urlParams = createUrlParams()
    urlParams.declare(
      { name: 'background', parser: parseAsCount, iD: { name: 'background', aliases: ['layer'] } },
      'imagery',
    )
    expect(() =>
      urlParams.declare({ name: 'base', parser: parseAsCount, iD: { name: 'layer' } }, 'other'),
    ).toThrow('iD parameter "layer" (URL parameter "base", module "other") is already used')
  })

  test('a name that is not a query key is refused', () => {
    const urlParams = createUrlParams()
    expect(() => urlParams.declare({ name: 'a=b', parser: parseAsCount }, 'x')).toThrow(
      'is not valid',
    )
    expect(() => urlParams.declare({ name: '1st', parser: parseAsCount }, 'x')).toThrow(
      'is not valid',
    )
    expect(() => urlParams.declare({ name: '', parser: parseAsCount }, 'x')).toThrow('is not valid')
  })

  test('removing a declaration frees its name, and only its own entry is removed', () => {
    const urlParams = createUrlParams()
    const first = urlParams.declare({ name: 'count', parser: parseAsCount }, 'counter')
    first.remove()
    expect(urlParams.get('count')).toBeUndefined()
    const second = urlParams.declare({ name: 'count', parser: parseAsCount }, 'other')
    first.remove() // the first one again: must not remove the second
    expect(urlParams.get('count')).toBe(second.handle)
  })
})

describe('a module declares its parameters through the editor', () => {
  test('the handle is returned to the module, and the parameter is listed by the editor', () => {
    let handle: { name: string } | undefined
    const editor = createEditor({
      modules: [
        {
          id: 'counter',
          setup(api) {
            handle = api.urlParam({ name: 'count', parser: parseAsCount })
          },
        },
      ],
    })
    expect(handle?.name).toBe('count')
    expect(editor.urlParams.get('count')?.name).toBe('count')
    editor.destroy()
  })

  test('the app names it reserves are refused when a module declares one', () => {
    expect(() =>
      createEditor({
        reservedUrlParams: ['scene'],
        modules: [
          {
            id: 'lenses',
            setup: (api) => {
              api.urlParam({ name: 'scene', parser: parseAsCount })
            },
          },
        ],
      }),
    ).toThrow('taken by the app')
  })

  test('a parameter is removed when its module is cleaned up', () => {
    const editor = createEditor({
      modules: [
        {
          id: 'counter',
          setup: (api) => {
            api.urlParam({ name: 'count', parser: parseAsCount })
          },
        },
      ],
    })
    expect(editor.urlParams.list()).toHaveLength(1)
    editor.destroy()
    expect(editor.urlParams.list()).toEqual([])
  })
})

describe('layered: URL, then the stored choice, then the default', () => {
  const cases: {
    name: string
    url: string | null | undefined
    stored: string | null | undefined
    value: string
    fromLink: boolean
  }[] = [
    {
      name: 'nothing set: the default',
      url: null,
      stored: undefined,
      value: 'bing',
      fromLink: false,
    },
    {
      name: 'stored only: the stored choice',
      url: undefined,
      stored: 'esri',
      value: 'esri',
      fromLink: false,
    },
    {
      name: 'a null stored value is no value',
      url: null,
      stored: null,
      value: 'bing',
      fromLink: false,
    },
    {
      name: 'URL and stored differ: the URL, from a link',
      url: 'osm',
      stored: 'esri',
      value: 'osm',
      fromLink: true,
    },
    {
      name: 'URL equals stored: the URL, not from a link',
      url: 'esri',
      stored: 'esri',
      value: 'esri',
      fromLink: false,
    },
    {
      name: 'URL, no stored: compared with the default',
      url: 'osm',
      stored: undefined,
      value: 'osm',
      fromLink: true,
    },
    {
      name: 'URL equals the default, no stored: not from a link',
      url: 'bing',
      stored: undefined,
      value: 'bing',
      fromLink: false,
    },
  ]
  for (const c of cases) {
    test(c.name, () => {
      expect(layered({ url: c.url, stored: c.stored, fallback: 'bing' })).toEqual({
        value: c.value,
        fromLink: c.fromLink,
      })
    })
  }

  test('fromLink is false when the URL repeats the stored choice, whatever the default is', () => {
    expect(layered({ url: 'esri', stored: 'esri', fallback: 'osm' }).fromLink).toBe(false)
  })

  test('a link never changes the stored value: the function does not write, so the stored value is still shown without the URL', () => {
    const withLink = layered({ url: 'osm', stored: 'esri', fallback: 'bing' })
    const without = layered({ url: undefined, stored: 'esri', fallback: 'bing' })
    expect(withLink.value).toBe('osm')
    expect(without.value).toBe('esri')
  })

  test('same compares values that have another notation', () => {
    const same = (a: string, b: string) => a.split(',').sort().join() === b.split(',').sort().join()
    expect(layered({ url: 'a,b', stored: 'b,a', fallback: '', same })).toEqual({
      value: 'a,b',
      fromLink: false,
    })
  })
})
