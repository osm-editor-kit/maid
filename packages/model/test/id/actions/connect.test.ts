// Adopted from iD test/spec/actions/connect.js (ISC, © iD contributors), at commit 0194f3926.
// Only the three survivor tests that pick the node by OSM id are parked here (F-actions-a-5). The other tests are covered by packages/model/test/actions/connect.test.js.
import { describe, it } from 'bun:test';

describe('iD.actionConnect', () => {
  // needs F-actions-a-5
  it.todo('chooses the oldest node as the survivor');
  // needs F-actions-a-5
  it.todo('chooses the oldest interesting node as the survivor');
  // needs F-actions-a-5
  it.todo('chooses an existing node as the survivor');
});
