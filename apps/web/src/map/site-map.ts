/** Map data beyond the snapshot: zones and the operator's trail (S4). Read via DataPort.siteMap(). */
export type LatLon = { lat: number; lon: number };

export type Zone = { id: string; name: string; zone_type: string; polygon: LatLon[] };

export type SiteMapData = {
  center: LatLon;
  zones: Zone[];
  /** The operator's GPS trail, oldest first. */
  trail: LatLon[];
  /** Other machines on the site (mine comes from the snapshot). */
  machines: Array<{ id: string; code: string; lat: number; lon: number; moving: boolean; health: "ok" | "caution" | "fault" }>;
};

/** Guardian rings around the operator (ISO 21815-informed, not a certified collision-warning system). */
export const RING_M = { danger: 15, warning: 50 } as const;

/** Bearing (degrees from north) from a to b, for the "go north" hint and the wind arrow. */
export function bearingDeg(a: LatLon, b: LatLon): number {
  const φ1 = (a.lat * Math.PI) / 180;
  const φ2 = (b.lat * Math.PI) / 180;
  const Δλ = ((b.lon - a.lon) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function distanceM(a: LatLon, b: LatLon): number {
  const R = 6_371_000;
  const φ1 = (a.lat * Math.PI) / 180;
  const φ2 = (b.lat * Math.PI) / 180;
  const dφ = φ2 - φ1;
  const dλ = ((b.lon - a.lon) * Math.PI) / 180;
  const h = Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** A ring as a GeoJSON polygon (64 points), so MapLibre draws it in metres, not pixels. */
export function ringPolygon(center: LatLon, radiusM: number, steps = 64): LatLon[] {
  const dLat = radiusM / 111_320;
  const dLon = radiusM / (111_320 * Math.cos((center.lat * Math.PI) / 180));
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = (i / steps) * 2 * Math.PI;
    return { lat: center.lat + dLat * Math.cos(a), lon: center.lon + dLon * Math.sin(a) };
  });
}

/** Compass word for a bearing: N, NE, E… used in "Move upwind: go north". */
export function compassKey(deg: number): "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw" {
  const keys = ["n", "ne", "e", "se", "s", "sw", "w", "nw"] as const;
  return keys[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}
