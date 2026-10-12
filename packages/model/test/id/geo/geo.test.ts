// Adopted from iD test/spec/geo/geo.js (ISC, © iD contributors), at commit 0194f3926.
import { describe, expect, it } from 'bun:test'
import * as sdk from '../../sdk.ts'

describe('iD.geo - geography', () => {
    describe('geoLatToMeters', function() {
        it('0 degrees latitude is 0 meters', function() {
            expect(sdk.geoLatToMeters(0)).toEqual(0);
        });
        it('1 degree latitude is approx 111 km', function() {
            expect(sdk.geoLatToMeters(1)).toBeCloseTo(110946, -1);
        });
        it('-1 degree latitude is approx -111 km', function() {
            expect(sdk.geoLatToMeters(-1)).toBeCloseTo(-110946, -1);
        });
    });

    describe('geoLonToMeters', function() {
        it('0 degrees longitude is 0 km', function() {
            expect(sdk.geoLonToMeters(0, 0)).toEqual(0);
        });
        it('distance of 1 degree longitude varies with latitude', function() {
            expect(sdk.geoLonToMeters(1,  0)).toBeCloseTo(111319, -1);
            expect(sdk.geoLonToMeters(1, 15)).toBeCloseTo(107526, -1);
            expect(sdk.geoLonToMeters(1, 30)).toBeCloseTo(96405, -1);
            expect(sdk.geoLonToMeters(1, 45)).toBeCloseTo(78714, -1);
            expect(sdk.geoLonToMeters(1, 60)).toBeCloseTo(55659, -1);
            expect(sdk.geoLonToMeters(1, 75)).toBeCloseTo(28811, -1);
            expect(sdk.geoLonToMeters(1, 90)).toEqual(0);
        });
        it('distance of -1 degree longitude varies with latitude', function() {
            expect(sdk.geoLonToMeters(-1,  -0)).toBeCloseTo(-111319, -1);
            expect(sdk.geoLonToMeters(-1, -15)).toBeCloseTo(-107526, -1);
            expect(sdk.geoLonToMeters(-1, -30)).toBeCloseTo(-96405, -1);
            expect(sdk.geoLonToMeters(-1, -45)).toBeCloseTo(-78714, -1);
            expect(sdk.geoLonToMeters(-1, -60)).toBeCloseTo(-55659, -1);
            expect(sdk.geoLonToMeters(-1, -75)).toBeCloseTo(-28811, -1);
            expect(sdk.geoLonToMeters(-1, -90)).toEqual(0);
        });
    });

    describe('geoMetersToLat', function() {
        it('0 meters is 0 degrees latitude', function() {
            expect(sdk.geoMetersToLat(0)).toEqual(0);
        });
        it('111 km is approx 1 degree latitude', function() {
            expect(sdk.geoMetersToLat(110946)).toBeCloseTo(1, 4);
        });
        it('-111 km is approx -1 degree latitude', function() {
            expect(sdk.geoMetersToLat(-110946)).toBeCloseTo(-1, 4);
        });
    });

    describe('geoMetersToLon', function() {
        it('0 meters is 0 degrees longitude', function() {
            expect(sdk.geoMetersToLon(0, 0)).toEqual(0);
        });
        it('distance of 1 degree longitude varies with latitude', function() {
            expect(sdk.geoMetersToLon(111319,  0)).toBeCloseTo(1, 4);
            expect(sdk.geoMetersToLon(107526, 15)).toBeCloseTo(1, 4);
            expect(sdk.geoMetersToLon(96405,  30)).toBeCloseTo(1, 4);
            expect(sdk.geoMetersToLon(78714,  45)).toBeCloseTo(1, 4);
            expect(sdk.geoMetersToLon(55659,  60)).toBeCloseTo(1, 4);
            expect(sdk.geoMetersToLon(28811,  75)).toBeCloseTo(1, 4);
            expect(sdk.geoMetersToLon(1, 90)).toEqual(0);
        });
        it('distance of -1 degree longitude varies with latitude', function() {
            expect(sdk.geoMetersToLon(-111319,  -0)).toBeCloseTo(-1, 4);
            expect(sdk.geoMetersToLon(-107526, -15)).toBeCloseTo(-1, 4);
            expect(sdk.geoMetersToLon(-96405,  -30)).toBeCloseTo(-1, 4);
            expect(sdk.geoMetersToLon(-78714,  -45)).toBeCloseTo(-1, 4);
            expect(sdk.geoMetersToLon(-55659,  -60)).toBeCloseTo(-1, 4);
            expect(sdk.geoMetersToLon(-28811,  -75)).toBeCloseTo(-1, 4);
            expect(sdk.geoMetersToLon(-1, -90)).toEqual(0);
        });
    });

    describe('geoOffsetToMeters', function() {
        it('[0, 0] pixel offset is [0, -0] meter offset', function() {
            var meters = sdk.geoOffsetToMeters([0, 0]);
            expect(meters[0]).toEqual(0);
            expect(meters[1]).toEqual(-0);
        });
        it('[0.00064, -0.00064] pixel offset is roughly [100, 100] meter offset', function() {
            var meters = sdk.geoOffsetToMeters([0.00064, -0.00064]);
            expect(meters[0]).toBeGreaterThanOrEqual(99.5);
            expect(meters[0]).toBeLessThanOrEqual(100.5);
            expect(meters[1]).toBeGreaterThanOrEqual(99.5);
            expect(meters[1]).toBeLessThanOrEqual(100.5);
        });
    });

    describe('geoMetersToOffset', function() {
        it('[0, 0] meter offset is [0, -0] pixel offset', function() {
            var offset = sdk.geoMetersToOffset([0, 0]);
            expect(offset[0]).toEqual(0);
            expect(offset[1]).toEqual(-0);
        });
        it('[100, 100] meter offset is roughly [0.00064, -0.00064] pixel offset', function() {
            var offset = sdk.geoMetersToOffset([100, 100]);
            expect(offset[0]).toBeGreaterThanOrEqual(0.000635);
            expect(offset[0]).toBeLessThanOrEqual(0.000645);
            expect(offset[1]).toBeGreaterThanOrEqual(-0.000645);
            expect(offset[1]).toBeLessThanOrEqual(-0.000635);
        });
    });

    describe('geoSphericalDistance', function() {
        it('distance between two same points is zero', function() {
            var a = [0, 0];
            var b = [0, 0];
            expect(sdk.geoSphericalDistance(a, b)).toEqual(0);
        });
        it('a straight 1 degree line at the equator is approximately 111 km', function() {
            var a = [0, 0];
            var b = [1, 0];
            expect(sdk.geoSphericalDistance(a, b)).toBeCloseTo(111319, -1);
        });
        it('a pythagorean triangle is (nearly) right', function() {
            var a = [0, 0];
            var b = [4, 3];
            expect(sdk.geoSphericalDistance(a, b)).toBeCloseTo(555804, -1);
        });
        it('east-west distances at high latitude are shorter', function() {
            var a = [0, 60];
            var b = [1, 60];
            expect(sdk.geoSphericalDistance(a, b)).toBeCloseTo(55659, -1);
        });
        it('north-south distances at high latitude are not shorter', function() {
            var a = [0, 60];
            var b = [0, 61];
            expect(sdk.geoSphericalDistance(a, b)).toBeCloseTo(110946, -1);
        });
    });

    describe('geoZoomToScale', function() {
        it('converts from zoom to projection scale (tileSize = 256)', function() {
            expect(sdk.geoZoomToScale(17)).toBeCloseTo(5340353.715440872, 6);
        });
        it('converts from zoom to projection scale (tileSize = 512)', function() {
            expect(sdk.geoZoomToScale(17, 512)).toBeCloseTo(10680707.430881744, 6);
        });
    });

    describe('geoScaleToZoom', function() {
        it('converts from projection scale to zoom (tileSize = 256)', function() {
            expect(sdk.geoScaleToZoom(5340353.715440872)).toBeCloseTo(17, 6);
        });
        it('converts from projection scale to zoom (tileSize = 512)', function() {
            expect(sdk.geoScaleToZoom(10680707.430881744, 512)).toBeCloseTo(17, 6);
        });
    });
})
