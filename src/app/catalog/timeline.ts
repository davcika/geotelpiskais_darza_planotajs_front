import type { Plant } from '../planting/plant';

/** Josla laika skalā, kur 0 ir 1. janvāris un 1 ir gada beigas */
export interface Segment {
  start: number;
  end: number;
}

export type BarKind = 'indoors' | 'outdoors' | 'harvest' | 'bloom';

export interface TimelineBar {
  kind: BarKind;
  segments: Segment[];
}

export const DAYS = 365;
/** Cik dienu pagājis līdz katra mēneša sākumam parastā gadā */
const MONTH_START = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

/** Pārvērš datumu par gada dienu no 0 līdz 364 */
export function dayOfYear(mmdd: string): number {
  const month = Number(mmdd.slice(0, 2));
  const day = Number(mmdd.slice(3, 5));
  return MONTH_START[month - 1] + day - 1;
}

/** Ja logs pāriet nākamajā gadā, to sadala divās joslās, bet pārāk garš logs aizņem visu gadu */
export function daySegments(from: number, to: number): Segment[] {
  if (to - from + 1 >= DAYS) return [{ start: 0, end: 1 }];
  const a = ((from % DAYS) + DAYS) % DAYS;
  const b = ((to % DAYS) + DAYS) % DAYS;
  if (a <= b) return [{ start: a / DAYS, end: (b + 1) / DAYS }];
  return [
    { start: 0, end: (b + 1) / DAYS },
    { start: a / DAYS, end: 1 },
  ];
}

/** Logs kā dienu intervāls, un ja tas pāriet gadu miju, beigas ir aiz gada beigām */
export function windowDays(from: string, to: string): [number, number] {
  const a = dayOfYear(from);
  const b = dayOfYear(to);
  return [a, b < a ? b + DAYS : b];
}

/** Ja sākums ir vēlāk par beigām, logs pāriet gadu miju */
export function windowSegments(from: string | null, to: string | null): Segment[] {
  return from && to ? daySegments(...windowDays(from, to)) : [];
}

/** Dēstiem raža skaitās no sējas telpās, citiem no sējas ārā */
function sowFrom(plant: Plant): [string, string] | null {
  if (plant.sowMethod === 'TRANSPLANT' && plant.indoorSowFrom && plant.indoorSowTo) return [plant.indoorSowFrom, plant.indoorSowTo];
  return plant.outdoorFrom && plant.outdoorTo ? [plant.outdoorFrom, plant.outdoorTo] : null;
}

/** Raža sākas pēc agrākās sējas un ilgst līdz vēlākās sējas ražai plus ražas logs */
export function harvestSegments(plant: Plant): Segment[] {
  const sow = sowFrom(plant);
  if (!sow || !plant.daysToHarvest) return [];
  const [a, b] = windowDays(...sow);
  return daySegments(a + plant.daysToHarvest, b + plant.daysToHarvest + (plant.harvestWindowDays ?? 0));
}

/** Dekoratīviem augiem ražas vietā rāda ziedēšanu */
export function timelineBars(plant: Plant): TimelineBar[] {
  const bars: TimelineBar[] = [];
  const add = (kind: BarKind, segments: Segment[]) => segments.length && bars.push({ kind, segments });
  if (plant.sowMethod === 'TRANSPLANT') add('indoors', windowSegments(plant.indoorSowFrom, plant.indoorSowTo));
  add('outdoors', windowSegments(plant.outdoorFrom, plant.outdoorTo));
  if (plant.daysToHarvest) add('harvest', harvestSegments(plant));
  else add('bloom', windowSegments(plant.bloomFrom, plant.bloomTo));
  return bars;
}

/** Lielus atstatumus rāda metros, mazus centimetros */
export function formatCm(cm: number | null | undefined): string {
  if (!cm) return '—';
  return cm >= 100 ? `${Math.round(cm / 10) / 10} m` : `${cm} cm`;
}

/** Abi skaitļi vienās vienībās */
export function formatSpacingPair(spacing: number | null | undefined, rows: number | null | undefined): string {
  if (!spacing && !rows) return '—';
  const s = spacing ?? rows!;
  const r = rows ?? spacing!;
  if (Math.max(s, r) >= 100) return `${s / 100} × ${r / 100} m`;
  return `${s} × ${r} cm`;
}
