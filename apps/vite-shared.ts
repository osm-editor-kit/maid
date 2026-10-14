/** Build settings shared by the three apps' vite configs (each app's `vite.config.ts` imports this file). */

/**
 * packages/ui is a barrel of many modules (inspector fields, tags sheet, ...). Without this, the bundler keeps every
 * module of it in the entry chunk, also those only the lazy inspector uses. None of them does work at import time
 * (`extension-points.ts` only declares types), so a module nobody imports can go.
 */
export const treeshake = {
  moduleSideEffects: [
    { test: /[\\/]packages[\\/]ui[\\/]src[\\/]/, sideEffects: false },
    // the same for the presets package: the shell imports `discardedTags` from its index, which must not keep the
    // matching code and the country data in the entry
    { test: /[\\/]packages[\\/]presets[\\/]src[\\/]/, sideEffects: false },
  ],
}
