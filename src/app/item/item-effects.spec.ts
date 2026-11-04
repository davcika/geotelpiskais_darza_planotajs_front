import type { ItemType } from './item-api';
import { adjustWindows, boxOf, coveringItems, summarize } from './item-effects';

function type(key: string, shape: ItemType['shape'], s: number, e: number, h: number, frost: number, w: number | null = 1): ItemType {
  return { key, nameEn: key, nameLv: key, icon: 'x', shape, category: 'PROTECTION', defaultWM: w, defaultHM: w,
    startShiftDays: s, endShiftDays: e, harvestShiftDays: h, frostProtectionC: frost, climbingSupport: false };
}
const GH = type('GREENHOUSE', 'AREA', 35, 30, 30, 3);
const CF = type('COLD_FRAME', 'AREA', 21, 21, 21, 2);
const FENCE = type('FENCE', 'LINE', 0, 0, 0, 0, null);

describe('item-effects', () => {
  const bed = { minX: 0, minY: 0, maxX: 4, maxY: 1 };

  it('covers when at least half of the target', () => {
    const half = { id: 1, type: CF, box: { minX: 0, minY: 0, maxX: 2, maxY: 1 } };
    const less = { id: 2, type: CF, box: { minX: 0, minY: 0, maxX: 1.9, maxY: 1 } };
    expect(coveringItems(bed, [half, less]).map((i) => i.id)).toEqual([1]);
  });

  it('ignores non-protection items', () => {
    expect(coveringItems(bed, [{ id: 1, type: FENCE, box: { minX: 0, minY: 0, maxX: 5, maxY: 5 } }])).toEqual([]);
  });

  it('point item gets a footprint of default width', () => {
    const b = boxOf(JSON.stringify({ type: 'Point', coordinates: [10, 10] }), 0.4);
    expect(b.maxX - b.minX).toBeCloseTo(0.4);
  });

  it('shifts by the largest item and clamps to the year', () => {
    expect(adjustWindows('04-15', '06-30', 2026, [CF, GH])).toEqual(
      { outdoorFrom: '03-11', outdoorTo: '07-30', harvestExtraDays: 30, frostProtectionC: 3 });
    const c = adjustWindows('01-20', '12-15', 2026, [GH]);
    expect(c.outdoorFrom).toBe('01-01');
    expect(c.outdoorTo).toBe('12-31');
  });

  it('summarizes counts and lengths', () => {
    const rows = summarize([GH, FENCE], [
      { typeKey: 'FENCE', lengthM: 2.5 }, { typeKey: 'FENCE', lengthM: 1.25 }, { typeKey: 'GREENHOUSE', lengthM: null }]);
    expect(rows.map((r) => [r.type.key, r.count, r.totalLengthM])).toEqual([['GREENHOUSE', 1, null], ['FENCE', 2, 3.75]]);
  });
});
