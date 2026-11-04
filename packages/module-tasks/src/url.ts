/** The `tasks` URL parameter: the address of a task file. */
import type { UrlParser } from '@osm-editor-kit/maid-core'

/** The name of the parameter */
export const TASKS_PARAM = 'tasks'

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

/**
 * Reads the address of a task file: an `https:` URL, or an `http:` URL on this computer (the mock and the dev server).
 * Anything else is null, as if the parameter were absent.
 */
export const parseAsTasksUrl: UrlParser<string> = {
  parse(value) {
    let url: URL
    try {
      url = new URL(value)
    } catch {
      return null
    }
    if (url.protocol === 'https:' || (url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname))) {
      return url.href
    }
    return null
  },
  serialize: (value) => value,
}

/** A short name for a file at this address, for the dock: the last part of the path */
export function fileNameOfUrl(address: string): string {
  try {
    const parts = new URL(address).pathname.split('/').filter(Boolean)
    return decodeURIComponent(parts.at(-1) ?? address)
  } catch {
    return address
  }
}
