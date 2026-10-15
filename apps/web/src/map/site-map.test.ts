import { describe, expect, it } from "vitest";
import { bearingDeg, compassKey, distanceM, planBounds, planProject, ringPolygon, RING_M, type LatLon } from "./site-map";

const SITE: LatLon = { lat: 21.1463, lon: 79.0882 };

describe("geo helpers", () => {
  it("measures distance and bearing between two site points", () => {
    const north: LatLon = { lat: SITE.lat + 0.001, lon: SITE.lon }; // ~111 m north
    expect(distanceM(SITE, north)).toBeGreaterThan(105);
    expect(distanceM(SITE, north)).toBeLessThan(118);
    expect(bearingDeg(SITE, north)).toBeCloseTo(0, 1);
    const east: LatLon = { lat: SITE.lat, lon: SITE.lon + 0.001 };
    expect(bearingDeg(SITE, east)).toBeCloseTo(90, 1);
  });

  it("names the compass sector for the upwind hint", () => {
    expect(compassKey(0)).toBe("n");
    expect(compassKey(45)).toBe("ne");
    expect(compassKey(359)).toBe("n");
    expect(compassKey(-90)).toBe("w"); // negative bearings wrap
    expect(compassKey(450)).toBe("e"); // over one turn wraps
  });
});

describe("Guardian rings", () => {
  it("closes the polygon and keeps every vertex at the ring radius", () => {
    for (const r of [RING_M.danger, RING_M.warning]) {
      const ring = ringPolygon(SITE, r, 32);
      expect(ring).toHaveLength(33);
      expect(ring[0]).toEqual(ring[32]); // closed
      for (const p of ring) expect(distanceM(SITE, p)).toBeCloseTo(r, 0);
    }
  });
});

describe("paper site plan projection", () => {
  it("puts the centre at the origin, east on +x and south on +y", () => {
    expect(planProject(SITE, SITE)).toEqual({ x: 0, y: 0 });
    const east = planProject({ lat: SITE.lat, lon: SITE.lon + 0.001 }, SITE);
    expect(east.x).toBeGreaterThan(0);
    expect(east.y).toBeCloseTo(0, 6);
    const north = planProject({ lat: SITE.lat + 0.001, lon: SITE.lon }, SITE);
    expect(north.y).toBeLessThan(0); // north is up, so negative y in SVG
  });

  it("projects one metre per unit, so the 50 m ring is 100 units wide", () => {
    const ring = ringPolygon(SITE, RING_M.warning, 64);
    const box = planBounds(ring, SITE, 0);
    expect(box.w).toBeCloseTo(2 * RING_M.warning, 0);
    expect(box.h).toBeCloseTo(2 * RING_M.warning, 0);
  });

  it("always contains the centre and the requested padding", () => {
    const box = planBounds([{ lat: SITE.lat + 0.002, lon: SITE.lon + 0.002 }], SITE, 40);
    expect(box.x).toBeLessThanOrEqual(-40);
    expect(box.y + box.h).toBeGreaterThanOrEqual(40);
    expect(box.w).toBeGreaterThan(0);
    expect(box.h).toBeGreaterThan(0);
  });

  it("degrades to a padded box around the centre when there is nothing to show", () => {
    const box = planBounds([SITE], SITE, 40);
    expect(box).toMatchObject({ x: -40, y: -40, w: 80, h: 80 });
  });
});
