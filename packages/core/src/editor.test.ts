import { describe, expect, test } from 'bun:test'
import { createEditor, defineModule } from './index.ts'
import type { ErrorContext, MaidModule } from './index.ts'
import './test-fixtures.ts'

function recorder() {
  const log: string[] = []
  const errors: { error: unknown; context: ErrorContext }[] = []
  const onError = (error: unknown, context: ErrorContext) => errors.push({ error, context })
  const mod = (id: string): MaidModule =>
    defineModule({
      id,
      setup() {
        log.push(`setup ${id}`)
        return () => log.push(`cleanup ${id}`)
      },
    })
  return { log, errors, onError, mod }
}

describe('lifecycle', () => {
  test('works without config', () => {
    const editor = createEditor()
    expect(editor.moduleIds).toEqual([])
    editor.destroy()
  })

  test('sets up in array order and cleans up in reverse', () => {
    const { log, mod } = recorder()
    const editor = createEditor({ modules: [mod('a'), mod('b'), mod('c')] })
    expect(editor.moduleIds).toEqual(['a', 'b', 'c'])
    editor.destroy()
    expect(log).toEqual(['setup a', 'setup b', 'setup c', 'cleanup c', 'cleanup b', 'cleanup a'])
  })

  test('destroy twice cleans up once', () => {
    const { log, mod } = recorder()
    const editor = createEditor({ modules: [mod('a')] })
    editor.destroy()
    editor.destroy()
    expect(log).toEqual(['setup a', 'cleanup a'])
  })

  test('a module without a cleanup function is fine', () => {
    const editor = createEditor({ modules: [{ id: 'a', setup() {} }] })
    editor.destroy()
  })

  test('duplicate ids throw before any module is set up', () => {
    const { log, mod } = recorder()
    expect(() => createEditor({ modules: [mod('a'), mod('b'), mod('a')] })).toThrow(
      'Duplicate module id "a"',
    )
    expect(log).toEqual([])
  })

  test('a failing setup cleans up the modules before it and rethrows', () => {
    const { log, mod } = recorder()
    const bad = defineModule({
      id: 'bad',
      setup(api) {
        api.on('test:ping', () => {})
        throw new Error('no')
      },
    })
    expect(() => createEditor({ modules: [mod('a'), bad, mod('c')] })).toThrow('no')
    expect(log).toEqual(['setup a', 'cleanup a'])
  })

  test('a failing cleanup is reported and the others still run', () => {
    const { log, errors, onError, mod } = recorder()
    const bad = defineModule({
      id: 'bad',
      setup: () => () => {
        throw new Error('boom')
      },
    })
    const editor = createEditor({ modules: [mod('a'), bad, mod('c')], onError })
    editor.destroy()
    expect(log).toEqual(['setup a', 'setup c', 'cleanup c', 'cleanup a'])
    expect(errors[0]?.context).toEqual({ source: 'cleanup', name: 'bad', moduleId: 'bad' })
  })

  test('using the api after destroy throws', () => {
    let saved: Parameters<MaidModule['setup']>[0] | undefined
    const editor = createEditor({ modules: [{ id: 'a', setup: (api) => void (saved = api) }] })
    editor.destroy()
    expect(() => saved?.on('test:ping', () => {})).toThrow('after editor.destroy()')
  })

  test('the default onError is console.error', () => {
    const original = console.error
    const calls: unknown[][] = []
    console.error = (...args: unknown[]) => void calls.push(args)
    try {
      const editor = createEditor({
        modules: [
          {
            id: 'a',
            setup(api) {
              api.on('test:ping', () => {
                throw new Error('x')
              })
            },
          },
        ],
      })
      editor.hooks.run('test:ping')
    } finally {
      console.error = original
    }
    expect(calls).toHaveLength(1)
  })
})

// The pattern the docs ask for: one test per mechanism, written with a fake module.
describe('fake modules', () => {
  test('extension point: a module registers an item, the editor reads it, cleanup removes it', () => {
    const seen: string[][] = []
    const fake = defineModule({
      id: 'fake-layers',
      setup(api) {
        api.register('test:layers', { id: 'roads', color: 'red' })
        api.register('test:layers', { id: 'paths', color: 'green' })
      },
    })
    const editor = createEditor({ modules: [fake] })
    const layers = editor.registry('test:layers')
    expect(layers.list().map((l) => l.color)).toEqual(['red', 'green'])
    layers.subscribe((items) => seen.push(items.map((i) => i.id)))
    editor.destroy()
    expect(layers.list()).toEqual([])
    expect(seen.at(-1)).toEqual([])
  })

  test('extension point: two modules cannot register the same id', () => {
    const make = (id: string) =>
      defineModule({ id, setup: (api) => api.register('test:tools', { id: 'same' }) })
    expect(() => createEditor({ modules: [make('m1'), make('m2')] })).toThrow(
      'already has an item with the id "same"',
    )
  })

  test('extension point: a module registered after another sees its items', () => {
    const first = defineModule({
      id: 'first',
      setup: (api) => api.register('test:tools', { id: 'hammer' }),
    })
    let count = -1
    const second = defineModule({
      id: 'second',
      setup: (api) => void (count = api.editor.registry('test:tools').list().length),
    })
    createEditor({ modules: [first, second] })
    expect(count).toBe(1)
  })

  test('action hook: a module listens, the editor runs it, cleanup removes the listener', () => {
    const got: string[] = []
    const fake = defineModule({
      id: 'fake-selection',
      setup: (api) => api.on('test:selected', (id) => got.push(id)),
    })
    const editor = createEditor({ modules: [fake] })
    editor.hooks.run('test:selected', 'w1')
    editor.destroy()
    editor.hooks.run('test:selected', 'w2')
    expect(got).toEqual(['w1'])
  })

  test('filter hook: modules change the value in module order, cleanup removes them', () => {
    const upper = defineModule({
      id: 'upper',
      setup: (api) => api.on('test:title', (title) => title.toUpperCase()),
    })
    const suffix = defineModule({
      id: 'suffix',
      setup: (api) => api.on('test:title', (title, id) => `${title} (${id})`),
    })
    const editor = createEditor({ modules: [upper, suffix] })
    expect(editor.hooks.apply('test:title', 'road', 'w1')).toBe('ROAD (w1)')
    editor.destroy()
    expect(editor.hooks.apply('test:title', 'road', 'w1')).toBe('road')
  })

  test('hooks: a throwing module does not break the others and is reported with its id', () => {
    const { errors, onError } = recorder()
    const bad = defineModule({
      id: 'bad',
      setup: (api) =>
        api.on('test:selected', () => {
          throw new Error('boom')
        }),
    })
    const got: string[] = []
    const good = defineModule({
      id: 'good',
      setup: (api) => api.on('test:selected', (id) => got.push(id)),
    })
    const editor = createEditor({ modules: [bad, good], onError })
    editor.hooks.run('test:selected', 'n1')
    expect(got).toEqual(['n1'])
    expect(errors[0]?.context.moduleId).toBe('bad')
  })

  test('cleanup order inside a module: own cleanup first, then registrations', () => {
    const order: string[] = []
    const fake = defineModule({
      id: 'm',
      setup(api) {
        api.register('test:tools', { id: 't' })
        api.on('test:ping', () => {})
        return () => order.push(`own sees ${api.editor.registry('test:tools').list().length}`)
      },
    })
    const editor = createEditor({ modules: [fake] })
    editor.destroy()
    expect(order).toEqual(['own sees 1'])
    expect(editor.registry('test:tools').list()).toEqual([])
  })
})
