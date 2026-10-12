// Adopted from iD test/spec/osm/tags.js (ISC, © iD contributors), at commit 0194f3926.
import { beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import * as Rapid from '../../rapid.ts';
import osmRulesets from '../../../src/schema/osm_rulesets.json5';

const context = new Rapid.MockContext();
context.systems.schema = new Rapid.SchemaSystem(context);

beforeAll(() => {
  const schema = context.systems.schema;
  schema.requestedAssetIDs = '';
  return schema.initAsync().then(() => schema.merge(osmRulesets));
});

// iD's osmRemoveLifecyclePrefix is a method of the schema here (RulesetSchema.removeLifecyclePrefix).
describe('iD.osmRemoveLifecyclePrefix', function () {
  it('removes the lifecycle prefix from a tag key', function () {
    expect(context.systems.schema.removeLifecyclePrefix('was:natural')).toEqual('natural');
    expect(context.systems.schema.removeLifecyclePrefix('destroyed:seamark:type')).toEqual('seamark:type');
  });

  it('ignores invalid lifecycle prefixes', function () {
    expect(context.systems.schema.removeLifecyclePrefix('ex:leisure')).toEqual('ex:leisure');
  });
});

// iD's osmTagSuggestingArea is OsmWay.tagSuggestingArea here, with the area keys set on the osm scope.
describe('osmTagSuggestingArea', function () {
  beforeEach(function () {
    context.systems.schema.getScope('osm').areaKeys = { leisure: {} };
  });

  it('handles features with a lifecycle prefixes', function () {
    const way = new Rapid.OsmWay(context);
    expect(way.tagSuggestingArea({ leisure: 'stadium' })).toEqual({ leisure: 'stadium' });
    expect(way.tagSuggestingArea({ 'disused:leisure': 'stadium' })).toEqual({ 'disused:leisure': 'stadium' });
    expect(way.tagSuggestingArea({ 'ex:leisure': 'stadium' })).toBeNull();
  });
});
