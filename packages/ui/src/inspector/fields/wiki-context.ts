import { createContext } from 'react'
import type { WikiSource } from './wiki-service.ts'

/**
 * The Wikipedia and Wikidata lookups of the inspector, given by the app (`createWikiSource` on the editor's fetch
 * and query client). Absent (the default): the two fields are plain text inputs, which is also what automated
 * runs get, since no source is given then.
 */
export const WikiContext = createContext<WikiSource | undefined>(undefined)
