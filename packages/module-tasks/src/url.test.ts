import { describe, expect, it } from 'bun:test'
import { fileNameOfUrl, parseAsTasksUrl } from './url.ts'

describe('the tasks URL parameter', () => {
  it('takes https addresses', () => {
    expect(parseAsTasksUrl.parse('https://example.org/a/b.tasks.geojson')).toBe(
      'https://example.org/a/b.tasks.geojson',
    )
  })
  it('takes http only on this computer', () => {
    expect(parseAsTasksUrl.parse('http://localhost:8090/x.geojson')).toBe(
      'http://localhost:8090/x.geojson',
    )
    expect(parseAsTasksUrl.parse('http://127.0.0.1/x')).toBe('http://127.0.0.1/x')
    expect(parseAsTasksUrl.parse('http://example.org/x')).toBeNull()
  })
  it('refuses other schemes and text that is no address', () => {
    for (const bad of [
      'javascript:alert(1)',
      'file:///etc/passwd',
      'data:text/plain,x',
      'ftp://x.org/a',
      'nonsense',
      '',
      '//x.org/a',
    ]) {
      expect(parseAsTasksUrl.parse(bad)).toBeNull()
    }
  })
  it('serialises as it is', () => {
    expect(parseAsTasksUrl.serialize('https://x.org/a')).toBe('https://x.org/a')
  })
  it('names a file by the last part of the path', () => {
    expect(fileNameOfUrl('https://x.org/a/my%20list.geojson?v=1')).toBe('my list.geojson')
    expect(fileNameOfUrl('https://x.org/')).toBe('https://x.org/')
  })
})
