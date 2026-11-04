/** Tā pati loģika kā backend, bet ar robežtaisnstūriem, tāpēc pagrieztiem elementiem var nedaudz atšķirties un noteicējs ir serveris */
import type { ItemType } from './item-api';

export const MIN_COVER_SHARE = 0.5;

export interface Box { minX: number; minY: number; maxX: number; maxY: number }

export interface PlacedItem { id: number; type: ItemType; box: Box }

export function affectsSeason(t: ItemType): boolean {
  return t.startShiftDays > 0 || t.endShiftDays > 0 || t.harvestShiftDays > 0 || t.frostProtectionC > 0;
}

function area(b: Box): number {
  return Math.max(0, b.maxX - b.minX) * Math.max(0, b.maxY - b.minY);
}

function overlap(a: Box, b: Box): number {
  return area({ minX: Math.max(a.minX, b.minX), minY: Math.max(a.minY, b.minY),
    maxX: Math.min(a.maxX, b.maxX), maxY: Math.min(a.maxY, b.maxY) });
}

/** Robežtaisnstūris no GeoJSON, punktam tas ir kvadrāts ar noklusējuma malu */
export function boxOf(geoJson: string, pointSizeM = 0): Box {
  const g = JSON.parse(geoJson) as { type: string; coordinates: unknown };
  const pts: number[][] = g.type === 'Point' ? [g.coordinates as number[]]
    : g.type === 'LineString' ? (g.coordinates as number[][]) : (g.coordinates as number[][][])[0];
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const r = g.type === 'Point' ? pointSizeM / 2 : 0;
  return { minX: Math.min(...xs) - r, minY: Math.min(...ys) - r, maxX: Math.max(...xs) + r, maxY: Math.max(...ys) + r };
}

/** Aizsardzības elementi, kas pārklāj vismaz pusi mērķa vai satur mērķa punktu */
export function coveringItems(target: Box, items: PlacedItem[]): PlacedItem[] {
  const targetArea = area(target);
  return items.filter((i) => {
    if (!affectsSeason(i.type) || area(i.box) <= 0) return false;
    if (targetArea <= 0) {
      return target.minX >= i.box.minX && target.maxX <= i.box.maxX && target.minY >= i.box.minY && target.maxY <= i.box.maxY;
    }
    return overlap(i.box, target) >= MIN_COVER_SHARE * targetArea - 1e-9;
  });
}

export interface AdjustedWindows {
  outdoorFrom: string;
  outdoorTo: string;
  harvestExtraDays: number;
  frostProtectionC: number;
}

function shiftMd(md: string, year: number, days: number): string {
  const [m, d] = md.split('-').map(Number);
  const date = new Date(Date.UTC(year, m - 1, d + days));
  const min = Date.UTC(year, 0, 1);
  const max = Date.UTC(year, 11, 31);
  const t = Math.min(max, Math.max(min, date.getTime()));
  const c = new Date(t);
  return `${String(c.getUTCMonth() + 1).padStart(2, '0')}-${String(c.getUTCDate()).padStart(2, '0')}`;
}

/** Ņem lielāko nobīdi, jo tās nesummējas, un paliek tā paša gada robežās */
export function adjustWindows(outdoorFrom: string, outdoorTo: string, year: number, types: ItemType[]): AdjustedWindows {
  const max = (f: (t: ItemType) => number) => types.reduce((acc, t) => Math.max(acc, f(t)), 0);
  return {
    outdoorFrom: shiftMd(outdoorFrom, year, -max((t) => t.startShiftDays)),
    outdoorTo: shiftMd(outdoorTo, year, max((t) => t.endShiftDays)),
    harvestExtraDays: max((t) => t.harvestShiftDays),
    frostProtectionC: max((t) => t.frostProtectionC),
  };
}

export interface ItemSummaryRow { type: ItemType; count: number; totalLengthM: number | null }

/** Tabulai skaits katram tipam, bet līnijām kopgarums */
export function summarize(types: ItemType[], items: { typeKey: string; lengthM: number | null }[]): ItemSummaryRow[] {
  return types
    .map((type) => {
      const mine = items.filter((i) => i.typeKey === type.key);
      const total = type.shape === 'LINE' ? Math.round(mine.reduce((s, i) => s + (i.lengthM ?? 0), 0) * 100) / 100 : null;
      return { type, count: mine.length, totalLengthM: total };
    })
    .filter((r) => r.count > 0);
}
