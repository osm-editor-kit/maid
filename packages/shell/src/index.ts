// What an app imports from the shell: the entry (`mountEditor`), the config type, and the
// built-in modules an app switches on. Nothing here makes an editor at import time, because the
// app's config imports this file (see shell.ts, which `mountEditor` calls with that config).
export { mountEditor } from './mount'
export type { AppConfig } from './shell'
export type { Config } from './config'
export { elementInfo } from './modules/element-info'
export { relations } from './modules/relations'
export { fixtureBounds, sceneBounds, type Bbox } from './modules/scene-bounds'
export { validation } from './modules/validation'
export * from './platform'
export * from './stack'
