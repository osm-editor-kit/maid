// Type tests. `tsc --noEmit` is the test: each `@ts-expect-error` line fails the check
// if the line below it stops being an error. The functions are never called, because the
// wrong lines would also be wrong at run time.
import { expect, test } from 'bun:test'
import { createEditor, declareHooks, defineModule } from './index.ts'
import './test-fixtures.ts'

export function _moduleApiTypes(): void {
  defineModule({
    id: 'types',
    setup(api) {
      // fine
      api.register('test:layers', { id: 'a', color: 'red' })
      api.on('test:selected', (id) => void id.length)
      api.on('test:title', (title, id) => title + id)

      // @ts-expect-error unknown extension point
      api.register('test:nope', { id: 'a' })
      // @ts-expect-error wrong item type: color must be a string
      api.register('test:layers', { id: 'a', color: 1 })
      // @ts-expect-error missing property
      api.register('test:layers', { id: 'a' })
      // @ts-expect-error unknown hook
      api.on('test:nope', () => {})
      // @ts-expect-error listener argument is a string, not a number
      api.on('test:selected', (id: number) => void id)
      // @ts-expect-error a filter listener must return the value
      api.on('test:title', (title) => title.length)
      // @ts-expect-error a filter listener must return something
      api.on('test:title', () => {})
    },
  })
}

export function _editorTypes(): void {
  const editor = createEditor()
  // @ts-expect-error unknown action
  editor.hooks.run('test:nope')
  // @ts-expect-error wrong argument type
  editor.hooks.run('test:selected', 1)
  // @ts-expect-error missing argument
  editor.hooks.run('test:selected')
  // @ts-expect-error a filter cannot be run as an action
  editor.hooks.run('test:title', 'x', 'n1')
  // @ts-expect-error an action cannot be applied as a filter
  editor.hooks.apply('test:selected', 'x', 'n1')
  // @ts-expect-error value must be a string
  editor.hooks.apply('test:title', 1, 'n1')
  // @ts-expect-error unknown extension point
  editor.registry('test:nope')
  // @ts-expect-error the registry is read only
  editor.registry('test:layers').add({ id: 'a', color: 'red' })
  // @ts-expect-error unknown config key (until a package adds it by declaration merging)
  createEditor({ nope: true })
  // @ts-expect-error a module needs an id
  defineModule({ setup() {} })
  // @ts-expect-error test:ping is declared stable
  declareHooks({ 'test:ping': 'experimental' })
  // @ts-expect-error unknown hook
  declareHooks({ 'test:nope': 'stable' })
}

test('right calls get the right types', () => {
  const editor = createEditor()
  const title: string = editor.hooks.apply('test:title', 'x', 'n1')
  const color: string | undefined = editor.registry('test:layers').get('a')?.color
  expect(title).toBe('x')
  expect(color).toBeUndefined()
})
