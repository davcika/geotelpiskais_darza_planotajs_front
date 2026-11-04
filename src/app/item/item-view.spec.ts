import type { Plant } from '../planting/plant';
import type { GardenItem, ItemEffect } from './item-api';
import { effectPlant, formatShift, rectInBed, shiftedHint } from './item-view';

const lettuce = { nameEn: 'Lettuce', sowMethod: 'TRANSPLANT', outdoorFrom: '05-22', outdoorTo: '06-30', harvestWindowDays: 20 } as Plant;
const effect: ItemEffect = {
  affectedBy: [{ itemId: 1, name: 'Cold frame', icon: '🪟' }],
  outdoorFrom: '05-01', outdoorTo: '07-21', harvestExtraDays: 21, frostProtectionC: 2,
};

describe('item-view', () => {
  it('formats shifts in weeks or days', () => {
    expect(formatShift(21)).toBe('3 weeks');
    expect(formatShift(10)).toBe('10 days');
  });

  it('builds the shifted sowing hint', () => {
    expect(shiftedHint(lettuce, effect)).toBe('Plant out from 1 May (Cold frame: 3 weeks earlier, harvest +3 weeks)');
    expect(shiftedHint(lettuce, undefined)).toBeNull();
  });

  it('shifts timeline windows', () => {
    const p = effectPlant(lettuce, effect);
    expect([p.outdoorFrom, p.outdoorTo, p.harvestWindowDays]).toEqual(['05-01', '07-21', 41]);
  });

  it('clips item rectangle to the bed in local SVG coordinates', () => {
    const item = { geometry: JSON.stringify({ type: 'Polygon', coordinates: [[[1, 0], [3, 0], [3, 2], [1, 2], [1, 0]]] }) } as GardenItem;
    expect(rectInBed(item, undefined, { minX: 0, minY: 0, maxX: 4, maxY: 1 })).toEqual({ x: 1, y: 0, w: 2, h: 1 });
    expect(rectInBed(item, undefined, { minX: 10, minY: 10, maxX: 12, maxY: 12 })).toBeNull();
  });
});
