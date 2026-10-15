// Routing on the data Maid has loaded: access profiles, a routing graph, turn restrictions and an A*
// search that returns the way ranges of a route. Headless: no React, no network. See
// docs/research/relation-handling.md, section 7, for why it exists and what it is for.
//
// Typical use:
//   const rg = buildRoutingGraph(model, bicycleProfile)   // once per loaded-data version
//   const snap = snapToGraph(rg, lon, lat)                 // a click on the map
//   const route = findRoute(rg, { snap }, { node: 'n1' })  // segments, splits, length
export * from './geo.ts'
export * from './heap.ts'
export * from './profile.ts'
export * from './graph.ts'
export * from './restrictions.ts'
export * from './astar.ts'
