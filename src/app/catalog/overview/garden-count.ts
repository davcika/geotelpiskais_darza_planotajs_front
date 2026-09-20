import { areaPerPlantM2, Plant } from '../../planting/plant';
import { defaultDivisions } from '../../planting/bed-grid';

/** Dārza objekts ar tikai mums vajadzīgajiem laukiem */
export interface ObjectLite {
  id: number;
  type: 'BED' | 'TREE';
  geometry: string;
  gridCols?: number | null;
  gridRows?: number | null;
  plantId?: number | null;
}

export interface PlantingLite {
  /** Vajadzīgs, lai atrastu dārza elementu ietekmi */
  id?: number;
  objectId: number;
  plantId: number;
  cells: [number, number][];
}

/** Vienas šūnas laukums m², EPSG 3059 koordinātas jau ir metros */
export function cellAreaM2(obj: ObjectLite): number | null {
  try {
    const coords: number[][] = (JSON.parse(obj.geometry).coordinates?.[0] ?? []) as number[][];
    if (!coords.length) return null;
    const xs = coords.map((c) => c[0]);
    const ys = coords.map((c) => c[1]);
    const w = Math.max(...xs) - Math.min(...xs);
    const h = Math.max(...ys) - Math.min(...ys);
    const cols = obj.gridCols ?? defaultDivisions(w);
    const rows = obj.gridRows ?? defaultDivisions(h);
    return (w / cols) * (h / rows);
  } catch {
    return null;
  }
}

/** Saskaita augus dārzā, iekrāsotām šūnām pēc laukuma un pārējiem stādījumiem un kokiem pa vienam */
export function countPlants(plantings: PlantingLite[], objects: ObjectLite[], plantById: Map<number, Plant>): Map<number, number> {
  const counts = new Map<number, number>();
  const add = (id: number, n: number) => counts.set(id, (counts.get(id) ?? 0) + n);
  const objById = new Map(objects.map((o) => [o.id, o]));
  for (const p of plantings) {
    const plant = plantById.get(p.plantId);
    const perPlant = plant ? areaPerPlantM2(plant) : null;
    const obj = objById.get(p.objectId);
    const cell = obj ? cellAreaM2(obj) : null;
    if (p.cells.length && perPlant && cell) add(p.plantId, Math.max(1, Math.floor((p.cells.length * cell) / perPlant + 1e-9)));
    else add(p.plantId, 1);
  }
  for (const o of objects) if (o.type === 'TREE' && o.plantId) add(o.plantId, 1);
  return counts;
}
