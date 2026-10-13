/**
 * A bridge, until step 3 of docs/research/shell-package-plan.md replaces it by `createApp(config)`
 * and one React context.
 *
 * The shell creates its editor and engine when `editor.ts` is first imported, and that needs the
 * app's modules, presets and filters. The app cannot be imported from here, so the app hands its
 * factory over first (`setAppConfig`) and only then loads the shell's entry (`mountEditor`) with a
 * dynamic `import()`. No shell module is evaluated before the factory is set.
 *
 * The holder is a `const` object whose property is set once: a module-level `let` that is
 * reassigned is not allowed in this repo (React Compiler).
 */
import type { EditorConfig } from '@osm-editor-kit/maid-core'
import type { Config } from './config'

/** What an app says about its editor: the modules, presets and filters, for the run-time settings */
export type AppConfigFactory = (config: Config) => EditorConfig

const holder: { factory?: AppConfigFactory } = {}

/** Called once by the app, before the shell's entry is imported */
export function setAppConfig(factory: AppConfigFactory) {
  holder.factory = factory
}

/** The app's factory. Throws if the shell is used before the app has set it. */
export function appConfig() {
  if (!holder.factory) {
    throw new Error(
      'The editor shell was loaded before the app set its config. Call setAppConfig(editorConfig) ' +
        'first, then load the shell with a dynamic import (see packages/shell/README.md).',
    )
  }
  return holder.factory
}
