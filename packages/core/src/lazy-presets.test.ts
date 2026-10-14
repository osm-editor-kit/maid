import { describe, expect, test } from 'bun:test'
import type { Presets } from '@osm-editor-kit/maid-presets'
import { defaultPresets } from '@osm-editor-kit/maid-presets/default'
import { canBeArea, createEditor, lazyPresets } from './index.ts'

describe('presets made after the first picture', () => {
  test('a lazy source is not made until it is asked for, then the editor has them and says so once', async () => {
    let made = 0
    const source = lazyPresets(() => {
      made++
      return defaultPresets
    })
    const editor = createEditor({ presets: source })
    expect(made).toBe(0)
    expect(editor.presets).toBeUndefined()
    expect(editor.presetsPending).toBe(true)

    const heard: unknown[] = []
    editor.onPresets((presets) => heard.push(presets))
    const [first, second] = await Promise.all([editor.loadPresets(), editor.loadPresets()])
    expect(made).toBe(1)
    expect(first).toBe(defaultPresets)
    expect(second).toBe(defaultPresets)
    expect(editor.presets).toBe(defaultPresets)
    expect(source.current).toBe(defaultPresets)
    expect(editor.presetsPending).toBe(false)
    expect(heard).toEqual([defaultPresets])
    // the model's schema answers from them once they are there
    expect(editor.context.systems.schema?.getScope('osm').areaKeys.building).toBeDefined()
  })

  test('presets given directly are there at once and are never pending', async () => {
    const editor = createEditor({ presets: defaultPresets })
    expect(editor.presets).toBe(defaultPresets)
    expect(editor.presetsPending).toBe(false)
    expect(await editor.loadPresets()).toBe(defaultPresets)
  })

  test('an editor without presets resolves undefined', async () => {
    const editor = createEditor()
    expect(editor.presetsPending).toBe(false)
    expect(await editor.loadPresets()).toBeUndefined()
  })

  test('a source that fails reports the error, is no longer pending and tells its listeners', async () => {
    const errors: unknown[] = []
    const editor = createEditor({
      presets: lazyPresets(() => Promise.reject(new Error('no data'))),
      onError: (error) => errors.push(error),
    })
    const heard: unknown[] = []
    editor.onPresets((presets) => heard.push(presets))
    expect(await editor.loadPresets()).toBeUndefined()
    expect(editor.presetsPending).toBe(false)
    expect(editor.presets).toBeUndefined()
    expect(heard).toEqual([undefined])
    expect(errors).toHaveLength(1)
  })

  test('presets that arrive after destroy are dropped', async () => {
    const editor = createEditor({ presets: lazyPresets(() => defaultPresets) })
    const loading = editor.loadPresets()
    editor.destroy()
    expect(await loading).toBeUndefined()
    expect(editor.presets).toBeUndefined()
  })
})

describe('canBeArea', () => {
  // a presets stand-in: a point is an area type when its `leisure` is `playground`
  const fake = {
    match: (tags: Record<string, string>) => ({
      geometry: tags.leisure === 'playground' ? ['point', 'area'] : ['point'],
    }),
  } as unknown as Presets

  test('false until the presets are loaded', () => {
    expect(canBeArea(lazyPresets(() => fake))({ leisure: 'playground' })).toBe(false)
  })

  test('true for a point whose type can also be an area, once loaded; area=no refuses', async () => {
    const presets = lazyPresets(() => fake)
    await presets.load()
    const test = canBeArea(presets)
    expect(test({ leisure: 'playground' })).toBe(true)
    expect(test({ amenity: 'bench' })).toBe(false)
    expect(test({ leisure: 'playground', area: 'no' })).toBe(false)
  })
})
