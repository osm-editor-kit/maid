/** Single source for local ports. Import from here, do not repeat the numbers. */
export const PORTS = {
  maid: 5173,
  /** The second app, apps/maid-bicycle */
  maidBicycle: 5176,
  /** Production build of Maid, used by the benchmark */
  maidBuild: 5175,
  // not 5174: that is taken by other Vite projects on this machine
  compare: 5184,
  id: 8081,
  rapid: 8082,
  mockApi: 8090,
} as const
