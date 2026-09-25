export type PointTuple = [number, number];

export type GeoJsonPoint = {
  type: "Point";
  coordinates: PointTuple;
};

export type GeoJsonPolygon = {
  type: "Polygon";
  coordinates: PointTuple[][];
};

export type GeoJsonMultiPolygon = {
  type: "MultiPolygon";
  coordinates: PointTuple[][][];
};

export type GeoJsonGeometry =
  | GeoJsonPoint
  | GeoJsonPolygon
  | GeoJsonMultiPolygon
  | { type: "GeometryCollection"; geometries: GeoJsonGeometry[] }
  | null;

export type GeoJsonFeature = {
  type: "Feature";
  id?: string | number;
  properties?: Record<string, unknown>;
  geometry: GeoJsonGeometry;
};

export type GeoJsonFeatureCollection = {
  type: "FeatureCollection";
  features: GeoJsonFeature[];
};

export type GeoJsonInput = GeoJsonGeometry | GeoJsonFeature | GeoJsonFeatureCollection;

export function normalizePoint(input: unknown): PointTuple | null {
  if (!input || typeof input !== "object" || !("coordinates" in input)) {
    return null;
  }

  const { coordinates } = input as { coordinates?: unknown };

  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    return null;
  }

  const lng = Number(coordinates[0]);
  const lat = Number(coordinates[1]);

  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return null;
  }

  return [lng, lat];
}

function isPointInsideRing(point: PointTuple, ring: PointTuple[]) {
  const [lng, lat] = point;
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];

    const intersects =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi + Number.EPSILON) + xi;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function polygonContainsPoint(polygon: GeoJsonPolygon, point: PointTuple) {
  const rings = polygon.coordinates;

  if (!rings?.length) {
    return false;
  }

  const outerRing = rings[0];
  const containsOuter = isPointInsideRing(point, outerRing);

  if (!containsOuter) {
    return false;
  }

  for (let i = 1; i < rings.length; i += 1) {
    if (isPointInsideRing(point, rings[i])) {
      return false;
    }
  }

  return true;
}

function geometryContainsPoint(geometry: GeoJsonGeometry, point: PointTuple): boolean {
  if (!geometry) {
    return false;
  }

  if (geometry.type === "Point") {
    const [lng, lat] = geometry.coordinates;
    return lng === point[0] && lat === point[1];
  }

  if (geometry.type === "Polygon") {
    return polygonContainsPoint(geometry, point);
  }

  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.some((polygon) => polygonContainsPoint({ type: "Polygon", coordinates: polygon }, point));
  }

  if (geometry.type === "GeometryCollection") {
    return geometry.geometries.some((item) => geometryContainsPoint(item, point));
  }

  return false;
}

export function findMatchingFeatures(geojson: unknown, point: unknown) {
  const normalizedPoint = normalizePoint(point);

  if (!normalizedPoint) {
    return [] as Array<{ id?: string | number; name?: string; properties?: Record<string, unknown> }>;
  }

  if (!geojson || typeof geojson !== "object") {
    return [] as Array<{ id?: string | number; name?: string; properties?: Record<string, unknown> }>;
  }

  const matches: Array<{ id?: string | number; name?: string; properties?: Record<string, unknown> }> = [];

  if ("type" in geojson && geojson.type === "FeatureCollection") {
    const features = (geojson as GeoJsonFeatureCollection).features ?? [];

    features.forEach((feature) => {
      if (!feature || typeof feature !== "object") {
        return;
      }

      const geometry = feature.geometry;
      if (geometry && geometryContainsPoint(geometry, normalizedPoint)) {
        const name =
          typeof feature.properties?.name === "string"
            ? feature.properties.name
            : typeof feature.properties?.label === "string"
              ? feature.properties.label
              : `Feature ${feature.id ?? "unknown"}`;

        matches.push({
          id: feature.id,
          name,
          properties: feature.properties ?? {},
        });
      }
    });

    return matches;
  }

  if ("type" in geojson && geojson.type === "Feature") {
    const feature = geojson as GeoJsonFeature;
    if (feature.geometry && geometryContainsPoint(feature.geometry, normalizedPoint)) {
      const name =
        typeof feature.properties?.name === "string"
          ? feature.properties.name
          : typeof feature.properties?.label === "string"
            ? feature.properties.label
            : `Feature ${feature.id ?? "unknown"}`;

      return [{ id: feature.id, name, properties: feature.properties ?? {} }];
    }

    return [];
  }

  if ("type" in geojson && (geojson.type === "Polygon" || geojson.type === "MultiPolygon" || geojson.type === "GeometryCollection")) {
    if (geometryContainsPoint(geojson as GeoJsonGeometry, normalizedPoint)) {
      return [{ name: "Geometría coincidente" }];
    }
  }

  return [];
}
