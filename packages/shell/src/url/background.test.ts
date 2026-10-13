import { describe, expect, test } from 'bun:test'
import { customBackgroundLink } from './background.ts'

describe('background=custom:<template>', () => {
  test('everything after custom: is the template', () => {
    expect(
      customBackgroundLink('?background=custom:https://tiles.example.org/{z}/{x}/{y}.png'),
    ).toBe('https://tiles.example.org/{z}/{x}/{y}.png')
  })

  test('a template with & arrives decoded, as the URL encodes it', () => {
    const template = 'https://tiles.example.org/{z}/{x}/{y}.png?key=abc&style=2'
    const search = `?background=${encodeURIComponent(`custom:${template}`)}&map=16/52.5/13.4`
    expect(customBackgroundLink(search)).toBe(template)
  })

  test('other backgrounds, an empty template and no parameter give nothing', () => {
    expect(customBackgroundLink('?background=Bing')).toBeUndefined()
    expect(customBackgroundLink('?background=custom:')).toBeUndefined()
    expect(customBackgroundLink('?map=16/52.5/13.4')).toBeUndefined()
  })
})
