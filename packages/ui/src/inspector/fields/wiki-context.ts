import { createContext } from 'react'
import type { WikiSource } from './wiki-service.ts'

/**
 * The Wikipedia and Wikidata lookups of the inspector, given by the app (`createWikiSource` on the editor's fetch).
 * Absent (the default): the two fields are plain text inputs. Automated runs get no source (the app gives none under
 * automation), so they are plain text inputs too.
 */
export const WikiContext = createContext<WikiSource | undefined>(undefined)
