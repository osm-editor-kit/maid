// The OSM id of a map or GeoJSON feature: the key the engine keeps its features by.
// The builder (promoteId) makes it the entity id, a string such as `w123`; other ids give undefined.

/** The OSM id of a map or GeoJSON feature: the builder and promoteId make it the entity id, a string such as `w123` */
export function featureId(f: { id?: string | number }) {
  return typeof f.id === 'string' ? f.id : undefined
}
