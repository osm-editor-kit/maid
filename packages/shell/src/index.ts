// What an app imports from the shell. The shell's entry, `mountEditor`, is its own subpath
// (`@osm-editor-kit/maid-shell/mount`): this barrel must not evaluate `editor.ts`, because the
// app's config imports it (see app-config.ts).
export { setAppConfig, type AppConfigFactory } from './app-config'
export type { Config } from './config'
export { elementInfo } from './modules/element-info'
export { relations } from './modules/relations'
export { sceneBounds, type Bbox } from './modules/scene-bounds'
export { validation } from './modules/validation'
export * from './platform'
export * from './stack'
