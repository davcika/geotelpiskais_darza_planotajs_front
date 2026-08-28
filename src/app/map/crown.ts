import type { Coordinate } from 'ol/coordinate';
import { LineString, Polygon } from 'ol/geom';
import { formatMeters, type Plant, type PlantCategory } from '../planting/plant';

/** Koku vainagu izmēri un pārklāšanās, koordinātas jau ir metros, tāpēc attālumus var rēķināt tieši */

export const WOODY_CATEGORIES: PlantCategory[] = ['TREE', 'SHRUB', 'HEDGE'];
/** Cik liels vainags ir tikko iestādītam kokam */
export const PLANTED_CROWN_RADIUS_M = 0.3;

export function isWoody(plant: Plant): boolean {
  return WOODY_CATEGORIES.includes(plant.category);
}

/** Katalogā glabā diametru, tāpēc dalām uz pusi */
export function matureRadius(plant: Plant): number | null {
  return plant.spreadM ? plant.spreadM / 2 : null;
}

/** Vainags aug vienmērīgi līdz pilnam izmēram, un ja nezinām stādīšanas gadu, uzskatām koku par pieaugušu */
export function crownRadiusAt(plant: Plant, plantedYear: number | undefined, year: number): number | null {
  const full = matureRadius(plant);
  if (full === null) return null;
  if (plantedYear === undefined || !plant.yearsToMature || full <= PLANTED_CROWN_RADIUS_M) return full;
  const share = Math.min(1, Math.max(0, (year - plantedYear) / plant.yearsToMature));
  return Math.round((PLANTED_CROWN_RADIUS_M + (full - PLANTED_CROWN_RADIUS_M) * share) * 10) / 10;
}

/** Cik liels vainags būs pēc dažiem gadiem, ja stādīšanas gads nav zināms, to aptuveni uzminam pēc tagadējā izmēra */
export function projectedCrownRadius(plant: Plant, currentRadius: number, plantedYear: number | undefined, thisYear: number, ahead: number): number | null {
  const full = matureRadius(plant);
  if (full === null) return null;
  if (ahead <= 0) return currentRadius;
  if (!plant.yearsToMature || full <= PLANTED_CROWN_RADIUS_M) return Math.max(currentRadius, full);
  let planted = plantedYear;
  if (planted === undefined) {
    const share = Math.min(1, Math.max(0, (currentRadius - PLANTED_CROWN_RADIUS_M) / (full - PLANTED_CROWN_RADIUS_M)));
    planted = thisYear - share * plant.yearsToMature;
  }
  const growth = crownRadiusAt(plant, planted, thisYear + ahead)! - crownRadiusAt(plant, planted, thisYear)!;
  const target = Math.max(currentRadius, Math.min(full, currentRadius + Math.max(0, growth)));
  return Math.round(target * 10) / 10;
}

function distanceToEdge(center: Coordinate, polygon: Polygon): number {
  const edge = new LineString(polygon.getLinearRing(0)!.getCoordinates());
  const [x, y] = edge.getClosestPoint(center);
  return Math.hypot(x - center[0], y - center[1]);
}

export function circleOverlapsPolygon(center: Coordinate, radius: number, polygon: Polygon): boolean {
  return polygon.intersectsCoordinate(center) || distanceToEdge(center, polygon) < radius;
}

/** Ja apļi tikai pieskaras, tas vēl neskaitās pārklāšanās */
export function circlesOverlap(a: Coordinate, ra: number, b: Coordinate, rb: number): boolean {
  return Math.hypot(a[0] - b[0], a[1] - b[1]) < ra + rb;
}

export function circleInside(center: Coordinate, radius: number, zone: Polygon): boolean {
  return zone.intersectsCoordinate(center) && distanceToEdge(center, zone) >= radius;
}

/** Ja pieaugušā izmēra nezinām, mature ir null */
export interface CrownTree<T> {
  feature: T;
  name: string;
  center: Coordinate;
  mature: number | null;
  shown: number;
}

export interface CrownWarning<T> {
  text: string;
  features: T[];
}

/** Brīdina, ja pieaudzis vainags uzlīdīs dobei, citam kokam vai pāri zonas malai */
export function findCrownConflicts<T>(
  trees: CrownTree<T>[],
  beds: { feature: T; name: string; polygon: Polygon }[],
  zone: Polygon | null,
): { conflicts: Set<T>; warnings: CrownWarning<T>[] } {
  const conflicts = new Set<T>();
  const warnings: CrownWarning<T>[] = [];
  trees.forEach((tree, i) => {
    const mature = tree.mature;
    if (mature === null) return;
    const hits: string[] = [];
    const touched: T[] = [tree.feature];
    for (const bed of beds) {
      if (circleOverlapsPolygon(tree.center, mature, bed.polygon)) {
        hits.push(bed.name);
        touched.push(bed.feature);
      }
    }
    trees.forEach((other, j) => {
      // Ja abiem kokiem zinām pieaugušo izmēru, pāri ziņojam tikai vienreiz
      if (j === i || (other.mature !== null && j < i)) return;
      if (circlesOverlap(tree.center, mature, other.center, other.mature ?? other.shown)) {
        hits.push(`${other.name}'s crown`);
        conflicts.add(other.feature);
        touched.push(other.feature);
      }
    });
    const leaves = zone !== null && !circleInside(tree.center, mature, zone);
    if (hits.length > 0 || leaves) {
      conflicts.add(tree.feature);
      const parts = [hits.length > 0 ? `overlaps ${hits.join(', ')}` : '', leaves ? 'leaves the zone' : ''];
      warnings.push({
        text: `${tree.name}: mature crown (Ø ${formatMeters(mature * 2)} m) ${parts.filter(Boolean).join(' and ')}`,
        features: touched,
      });
    }
  });
  return { conflicts, warnings };
}
