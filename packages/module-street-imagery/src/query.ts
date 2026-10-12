import { QueryClient } from '@tanstack/react-query'

/**
 * The package's hooks read provider data through TanStack Query. Maid has no query client of its
 * own, so the module brings one for the two places where its components render (the map and the
 * dock).
 */
export const photoQueries = new QueryClient({ defaultOptions: { queries: { retry: 1 } } })
