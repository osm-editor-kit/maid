import { ownNextProps } from '../util/clone.ts';
import { OsmNode } from './OsmNode.ts';
import { OsmRelation } from './OsmRelation.ts';
import { OsmWay } from './OsmWay.ts';

import type { Context } from '../Context.ts';
import type { OsmEntity } from './OsmEntity.ts';

/** One element of the OSM API's JSON (`/api/0.6/map.json` and friends) */
export interface OsmJsonElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  nodes?: number[];
  members?: { type: 'node' | 'way' | 'relation'; ref: number; role: string }[];
  tags?: Record<string, string>;
  version?: number;
  changeset?: number;
  timestamp?: string;
  user?: string;
  uid?: number;
  visible?: boolean;
}

/**
 * Entities straight from the elements of the OSM API's JSON.
 *
 * Not in Rapid. Maid's load path: `OsmJSONParser` builds an intermediate object per element and
 * copies its properties generically, which took longer than creating the entities themselves
 * (docs/architecture/05-data-store.md). The properties here match what the parser produces.
 *
 * @param context  - id sequences and schema lookup
 * @param elements - `elements` of an API response
 * @param known    - return true for an entity id that is already loaded; that element is skipped
 */
export function entitiesFromOsmJson(
  context: Context,
  elements: OsmJsonElement[],
  known?: (entityID: EntityID) => boolean
): OsmEntity[] {
  const entities: OsmEntity[] = [];
  for (const el of elements) {
    const id = el.type[0] + String(el.id);
    if (known?.(id)) continue;

    const props: Record<string, unknown> = { id: id, visible: el.visible ?? true, tags: el.tags ?? {} };
    if (el.version !== undefined)   props.version = el.version;
    if (el.changeset !== undefined) props.changeset = el.changeset;
    if (el.timestamp !== undefined) props.timestamp = el.timestamp;
    if (el.user !== undefined)      props.user = el.user;
    if (el.uid !== undefined)       props.uid = String(el.uid);

    if (el.type === 'node') {
      props.loc = [el.lon, el.lat];
      ownNextProps();
      entities.push(new OsmNode(context, props));
    } else if (el.type === 'way') {
      props.nodes = (el.nodes ?? []).map(ref => 'n' + ref);
      ownNextProps();
      entities.push(new OsmWay(context, props));
    } else {
      props.members = (el.members ?? []).map(m => ({ id: m.type[0] + String(m.ref), type: m.type, role: m.role }));
      ownNextProps();
      entities.push(new OsmRelation(context, props));
    }
  }
  return entities;
}
