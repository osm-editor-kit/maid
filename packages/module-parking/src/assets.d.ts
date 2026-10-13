// Vite (and Bun) turn an imported image into its URL
declare module '*.png' {
  const url: string
  export default url
}
