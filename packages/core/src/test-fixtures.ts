// Test-only declarations. They show how another package adds extension points and hooks.
// The augmentation names `./index.ts`, like a real package names `@osm-editor-kit/maid-core`.
import { declareHooks } from './index.ts'
import type { Action, Filter } from './index.ts'

export interface TestLayer {
  id: string
  color: string
}

declare module './index.ts' {
  interface ExtensionPoints {
    'test:layers': TestLayer
    'test:tools': { id: string }
  }
  interface Hooks {
    'test:selected': Action<[id: string], 'experimental'>
    'test:ping': Action<[], 'stable'>
    'test:title': Filter<string, [id: string], 'stable'>
    'test:count': Filter<number, [], 'experimental'>
  }
}

declareHooks({
  'test:selected': 'experimental',
  'test:ping': 'stable',
  'test:title': 'stable',
  'test:count': 'experimental',
})
