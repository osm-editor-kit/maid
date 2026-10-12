// Adopted from iD test/spec/services/osm.js (ISC, © iD contributors), at commit 0194f3926.
// API changes: iD's loadFromAPI fetches and parses in one call. Maid's engine fetches the tile,
// and the same parser that the model uses (OsmJSONParser) turns the JSON into data. The fetch
// itself is not tested here: no network in tests.
import { describe, expect, it } from 'bun:test'
import { OsmJSONParser } from '@osm-editor-kit/maid-model'

describe('iD.serviceOsm#loadFromAPI', () => {
  const response =
    '{' +
    '    "version":"0.6",' +
    '    "bounds":{"minlat":40.6550000,"minlon":-74.5420000,"maxlat":40.6560000,"maxlon":-74.5410000},' +
    '    "elements":[' +
    '        {"type":"node","id":"105340439","visible":true,"version":2,"changeset":2880013,"timestamp":"2009-10-18T07:47:39Z","user":"woodpeck_fixbot","uid":147510,"lat":40.6555,"lon":-74.5415},' +
    '        {"type":"node","id":"105340442","visible":true,"version":2,"changeset":2880013,"timestamp":"2009-10-18T07:47:39Z","user":"woodpeck_fixbot","uid":147510,"lat":40.6556,"lon":-74.5416},' +
    '        {"type":"way","id":"40376199","visible":true,"version":1,"changeset":2403012,"timestamp":"2009-09-07T16:01:13Z","user":"NJDataUploads","uid":148169,"nodes":[105340439,105340442],"tags":{"highway":"residential","name":"Potomac Drive"}}' +
    '    ]' +
    '}'

  it('returns an object', () => {
    const payload = new OsmJSONParser().parse(response)
    expect(typeof payload).toEqual('object')
  })

  it('handles empty response gracefully', () => {
    const emptyResponse = JSON.parse(response)
    emptyResponse.elements = []
    // Maid's parser returns { osm, data }. The data holds the bounds of the response as one item
    // of its own; iD's payload holds only the elements, so only those are counted here.
    const payload = new OsmJSONParser().parse(JSON.stringify(emptyResponse))
    expect(typeof payload).toEqual('object')
    const elements = payload.data.filter((item) => item.type !== 'bounds')
    expect(elements).toHaveLength(0)
  })
})
