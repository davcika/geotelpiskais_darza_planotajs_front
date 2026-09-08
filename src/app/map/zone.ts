import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import booleanWithin from '@turf/boolean-within';
import kinks from '@turf/kinks';
import { Feature } from 'ol';
import GeoJSON from 'ol/format/GeoJSON';
import { Geometry, Point, Polygon } from 'ol/geom';
import { fromExtent } from 'ol/geom/Polygon';
import { Fill, Stroke, Style } from 'ol/style';
import type { StyleFunction } from 'ol/style/Style';
import { formatArea as formatAreaDigits } from '../shared/format';
import { LATVIA_EXTENT } from './base-map';

/** Zonas noteikumiem jāsakrīt ar ZoneRules.java backendā, citādi serveris noraidīs to, ko te atļaujam */
export const ZONE_MIN_AREA_M2 = 20;
export const ZONE_MAX_AREA_M2 = 50_000;

const geoJson = new GeoJSON();

export function readZone(geoJsonText: string): Polygon {
  return geoJson.readGeometry(geoJsonText) as Polygon;
}

export function writeZone(zone: Polygon): string {
  return geoJson.writeGeometry(zone);
}

export function formatArea(m2: number): string {
  return formatAreaDigits(m2, 0);
}

// Robeža ir klusa, jo zonu jau tāpat izceļ aptumšotā maska apkārt
export const zoneStyle = new Style({
  stroke: new Stroke({ color: 'rgba(60, 45, 20, 0.35)', width: 1.5 }),
});

/** Aptumšo visu apkārt zonai, uzliekot visai Latvijai pārklāju ar caurumu zonas vietā */
export function createMask(zone: Polygon): Feature {
  const mask = fromExtent(LATVIA_EXTENT);
  mask.appendLinearRing(zone.getLinearRing(0)!);
  return new Feature({ geometry: mask });
}

export const maskStyle = new Style({ fill: new Fill({ color: 'rgba(246, 242, 234, 0.65)' }) });

export const outsideStyle = new Style({
  stroke: new Stroke({ color: '#c0392b', width: 3 }),
  fill: new Fill({ color: 'rgba(192, 57, 43, 0.25)' }),
});

/** Kokam skatāmies tikai stumbru, tāpēc vainags drīkst karāties pāri zonas malai */
export function isInsideZone(geometry: Geometry, zone: Polygon): boolean {
  const zoneJson = geoJson.writeGeometryObject(zone) as GeoJSON.Polygon;
  if (geometry instanceof Point) {
    return booleanPointInPolygon(geometry.getCoordinates(), zoneJson);
  }
  return booleanWithin(geoJson.writeGeometryObject(geometry) as GeoJSON.Polygon, zoneJson);
}

/** Atzīmē objektus ārpus zonas klusi, bez notikuma, tāpēc slānis jāpārzīmē pašam izsaucējam */
export function markOutside(features: Feature[], zone: Polygon): number {
  let count = 0;
  for (const feature of features) {
    const outside = !isInsideZone(feature.getGeometry()!, zone);
    feature.set('outside', outside, true);
    if (outside) count++;
  }
  return count;
}

/** Objektus, ko atzīmēja markOutside, rāda sarkanus */
export function withOutsideHighlight(style: StyleFunction): StyleFunction {
  return (feature, resolution) => (feature.get('outside') === true ? outsideStyle : style(feature, resolution));
}

/** Atgriež iemeslu, kāpēc zonu nevar saglabāt, vai null, ja viss kārtībā */
export function zoneProblem(zone: Polygon, objectsOutside: number): string | null {
  const ring = zone.getLinearRing(0)!.getCoordinates();
  if (ring.length < 4) {
    return 'Add at least 3 points';
  }
  if (kinks(geoJson.writeGeometryObject(zone) as GeoJSON.Polygon).features.length > 0) {
    return 'The zone must not cross itself';
  }
  const area = zone.getArea();
  if (area < ZONE_MIN_AREA_M2 || area > ZONE_MAX_AREA_M2) {
    return `The zone must be between ${formatArea(ZONE_MIN_AREA_M2)} and ${formatArea(ZONE_MAX_AREA_M2)}`;
  }
  if (objectsOutside > 0) {
    return `${objectsOutside} objects are outside the zone. Enlarge the zone or delete them first.`;
  }
  return null;
}
