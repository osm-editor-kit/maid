import { describe, expect, test } from 'bun:test'
import { buildAllProperties, mustacheContextFromTask, replaceMustacheTags } from './mustache.ts'

describe('buildAllProperties', () => {
  test('feature properties, then properties, then the top level', () => {
    const all = buildAllProperties({
      taskFeatures: [{ properties: { a: 1, b: 'x' } }],
      properties: { b: 'y' },
      geometries: { features: [{ properties: { c: 3 } }] },
      title: 'T',
      a: 'top',
    })
    expect(all.get('a')).toBe(1)
    expect(all.get('b')).toBe('y')
    expect(all.get('c')).toBe(3)
    expect(all.get('title')).toBe('T')
  })

  test('empty for no object', () => {
    expect(buildAllProperties(null).size).toBe(0)
  })
})

describe('replaceMustacheTags', () => {
  const task = {
    title: 'w123@0',
    geometries: { features: [{ properties: { name: 'Main <St>', n: 0 } }] },
  }

  test('replaces property tags, an unknown tag by nothing', () => {
    expect(replaceMustacheTags('Fix {{name}} {{missing}}!', task)).toBe('Fix Main <St> !')
    expect(replaceMustacheTags('n={{n}}', task)).toBe('n=0')
  })

  test('osmIdentifier gives the long form of the title', () => {
    expect(replaceMustacheTags('{{osmIdentifier}}', task)).toBe('way/123')
    expect(replaceMustacheTags('{{osmIdentifier}}', { title: 'n5' })).toBe('node/5')
    expect(replaceMustacheTags('{{osmIdentifier}}', { title: 'abc@1' })).toBe('abc')
  })

  test('htmlEscape escapes values and keeps unknown tags', () => {
    expect(replaceMustacheTags('{{name}} {{missing}}', task, { htmlEscape: true })).toBe(
      'Main &lt;St&gt; {{missing}}',
    )
  })

  test('empty text, null values', () => {
    expect(replaceMustacheTags('', task)).toBe('')
    expect(replaceMustacheTags('[{{x}}]', { x: null })).toBe('[]')
  })

  test('mustacheContextFromTask adds the title', () => {
    expect(mustacheContextFromTask({ name: 'N' }).title).toBe('N')
    expect(mustacheContextFromTask(null)).toEqual({})
  })
})
