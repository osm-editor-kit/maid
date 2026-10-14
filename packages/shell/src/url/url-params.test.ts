import { describe, expect, test } from 'bun:test'
import { createEditor, createUrlParams } from '@osm-editor-kit/maid-core'
import { idUrlParamNames } from './id-url'
import { parseAsCamera, setupParams, shellUrlParamNames, stateParams } from './params'

describe('the names the app owns', () => {
  test('state, setup and iD parameters are all reserved', () => {
    const names = shellUrlParamNames()
    for (const name of [...Object.keys(stateParams), ...Object.keys(setupParams)]) {
      expect(names).toContain(name)
    }
    expect(names).toContain('map')
    expect(names).toContain('background')
    expect(names).toContain('scene')
  })

  test('iD names Maid drops are not Maid parameters, so they are not reserved', () => {
    expect(idUrlParamNames()).not.toContain('walkthrough')
  })

  test('a module that declares a shell name is refused, by the registry and by the editor', () => {
    const urlParams = createUrlParams(shellUrlParamNames())
    expect(() => urlParams.declare({ name: 'map', parser: parseAsCamera }, 'lenses')).toThrow(
      'taken by the app',
    )
    expect(() =>
      urlParams.declare({ name: 'background', parser: parseAsCamera }, 'imagery'),
    ).toThrow('taken by the app')
    expect(() =>
      createEditor({
        reservedUrlParams: shellUrlParamNames(),
        modules: [
          {
            id: 'extra',
            setup: (api) => {
              api.urlParam({ name: 'id', parser: parseAsCamera })
            },
          },
        ],
      }),
    ).toThrow('URL parameter "id" (module "extra") is taken by the app')
  })

  test('two modules cannot declare the same name, and a name the app does not own is accepted', () => {
    const urlParams = createUrlParams(shellUrlParamNames())
    urlParams.declare({ name: 'photo_layer', parser: parseAsCamera }, 'street-imagery')
    expect(() =>
      urlParams.declare({ name: 'photo_layer', parser: parseAsCamera }, 'notes'),
    ).toThrow('already declared by module "street-imagery"')
    expect(urlParams.list().map((h) => h.name)).toEqual(['photo_layer'])
  })
})

describe('a declared parameter with the shell parser', () => {
  test('the camera parser round trips through the handle, at several zooms', () => {
    const { handle } = createUrlParams(shellUrlParamNames()).declare(
      { name: 'view', parser: parseAsCamera, options: { clearOnDefault: false } },
      'camera-helper',
    )
    expect(handle.options).toEqual({ clearOnDefault: false, history: 'replace' })
    for (const zoom of [2, 10, 17, 22]) {
      const camera = { zoom, lat: 52.5228, lng: 13.4023 }
      const back = handle.parser.parse(handle.parser.serialize(camera))
      expect(back?.zoom).toBe(zoom)
      // precision follows the zoom, so the position is compared at that precision
      const tolerance = 360 / 2 ** zoom / 256
      expect(Math.abs((back?.lat ?? NaN) - camera.lat)).toBeLessThan(tolerance)
      expect(Math.abs((back?.lng ?? NaN) - camera.lng)).toBeLessThan(tolerance)
    }
  })
})
