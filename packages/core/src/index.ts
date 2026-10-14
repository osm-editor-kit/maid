export { isAutomated } from './automated.ts'
export { createEditor, defineModule } from './editor.ts'
export { canBeArea, lazyPresets } from './lazy-presets.ts'
export { toMapZoom, toOsmZoom } from './zoom.ts'
export { declareHooks, declaredHooks, hookStability } from './hooks.ts'
export type { HookStabilities } from './hooks.ts'
export { startSetting, writesStored } from './layers.ts'
export type { SettingLayers, SettingStart } from './layers.ts'
export type { Registry } from './registry.ts'
export { moduleStorage } from './storage.ts'
export type { ModuleStorage } from './storage.ts'
export type {
  Action,
  ActionName,
  Editor,
  EditorConfig,
  EditorHooks,
  ErrorContext,
  ExtensionPoints,
  Filter,
  FilterName,
  HookArgs,
  HookName,
  HookStability,
  HookValue,
  Hooks,
  Listener,
  MaidModule,
  ModuleApi,
  OnError,
  PointName,
  PresetsSource,
  ReadonlyRegistry,
  Stability,
} from './types.ts'
export {
  createEditorFetch,
  type EditorFetch,
  type EditorFetchOptions,
  type FetchPause,
  type FetchPauses,
} from './fetching/editor-fetch.ts'
export {
  createGate,
  createGates,
  rateLimitPauseMs,
  RATE_LIMIT_FIRST_PAUSE_MS,
  RATE_LIMIT_MAX_PAUSE_MS,
  type Gate,
  type GateOptions,
  type Gates,
  type PauseListener,
} from './fetching/gate.ts'
export {
  AutomationBlockedError,
  createRemoteFetch,
  DEFAULT_TIMEOUT_MS,
  HttpError,
  parseRetryAfter,
  RateLimitedError,
  RemoteTimeoutError,
  type FetchLike,
  type RemoteFetch,
  type RemoteFetchDeps,
  type RemoteFetchOptions,
  type RemoteRequestInit,
} from './fetching/remote-fetch.ts'
export {
  createEditorQueryClient,
  keys,
  MAXLAG_RETRY_DELAY_MS,
  MaxlagError,
  retryDelayFor,
  SESSION_DATA,
  shouldRetry,
  VIEW_DATA,
  type KeyParam,
  type KeyParams,
  type PhotoProvider,
} from './fetching/query-client.ts'
export {
  createServiceRegistry,
  isLocalUrl,
  SERVICE_IDS,
  SERVICES,
  type HostMatch,
  type ServiceId,
  type ServiceRegistry,
} from './fetching/services.ts'
export {
  createTaginfo,
  MIN_QUERY_LENGTH,
  TAGINFO_API,
  type Taginfo,
  type TaginfoGeometry,
  type TaginfoOptions,
  type TagSuggestion,
} from './taginfo/taginfo.ts'
