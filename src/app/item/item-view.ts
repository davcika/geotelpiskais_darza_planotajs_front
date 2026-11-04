/** Palīgfunkcijas elementu rādīšanai dobes skatā un pārskatā */
import type { Plant } from '../planting/plant';
import { formatDate } from '../planting/plant';
import { daysBetween } from '../shared/format';
import type { GardenItem, ItemEffect, ItemType } from './item-api';
import { Box, boxOf } from './item-effects';

/** Dienas kā teksts, pilnas nedēļas rāda nedēļās */
export function formatShift(days: number): string {
  if (days % 7 === 0 && days >= 7) return days === 7 ? '1 week' : `${days / 7} weeks`;
  return days === 1 ? '1 day' : `${days} days`;
}

/** Sējas ieteikums ar elementa ietekmi vai null, ja āra sākums nemainās */
export function shiftedHint(plant: Plant, effect: ItemEffect | undefined): string | null {
  if (!effect || !effect.affectedBy.length || !plant.outdoorFrom) return null;
  const earlier = daysBetween(effect.outdoorFrom, plant.outdoorFrom);
  const verb = plant.sowMethod === 'DIRECT' ? 'Sow outdoors' : 'Plant out';
  const names = effect.affectedBy.map((a) => a.name).join(', ');
  const shift = earlier > 0 ? `${names}: ${formatShift(earlier)} earlier` : names;
  const extra = effect.harvestExtraDays > 0 ? `, harvest +${formatShift(effect.harvestExtraDays)}` : '';
  return `${verb} from ${formatDate(effect.outdoorFrom)} (${shift}${extra})`;
}

/** Augs ar nobīdītiem logiem pārskata laika joslai */
export function effectPlant(plant: Plant, effect: ItemEffect): Plant {
  return {
    ...plant,
    outdoorFrom: effect.outdoorFrom,
    outdoorTo: effect.outdoorTo,
    harvestWindowDays: (plant.harvestWindowDays ?? 0) + effect.harvestExtraDays,
  };
}

/** SVG taisnstūris dobes koordinātās metros, y iet uz leju */
export interface LocalRect { x: number; y: number; w: number; h: number }

/** Elementa taisnstūris dobes SVG koordinātās, apgriezts līdz dobei, vai null ja nepārklājas */
export function rectInBed(item: GardenItem, type: ItemType | undefined, bed: Box): LocalRect | null {
  const b = boxOf(item.geometry, type?.defaultWM ?? 0);
  const minX = Math.max(b.minX, bed.minX);
  const maxX = Math.min(b.maxX, bed.maxX);
  const minY = Math.max(b.minY, bed.minY);
  const maxY = Math.min(b.maxY, bed.maxY);
  if (maxX - minX <= 1e-9 || maxY - minY <= 1e-9) return null;
  return { x: minX - bed.minX, y: bed.maxY - maxY, w: maxX - minX, h: maxY - minY };
}
