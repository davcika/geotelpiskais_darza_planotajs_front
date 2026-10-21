import type { Plant } from '../planting/plant';
import { daysUntil, sowThisWeek, windowNear } from './sow-this-week';

const base = {
  id: 1, nameEn: 'X', nameLv: 'X', family: 'APIACEAE', category: 'VEGETABLE', sowMethod: 'DIRECT',
  indoorSowFrom: null, indoorSowTo: null, outdoorFrom: '04-25', outdoorTo: '05-25', daysToHarvest: 100,
  harvestWindowDays: 40, frostSensitive: false, perennial: false, evergreen: false, foliageFrom: null, foliageTo: null,
  bloomFrom: null, bloomTo: null, bloomColor: null, heightM: null, spreadM: null, yearsToMature: null,
  phMin: null, phMax: null, light: null,
} as Plant;
const p = (over: Partial<Plant>) => ({ ...base, ...over }) as Plant;

describe('sow this week', () => {
  it('window near today ±7 days', () => {
    expect(windowNear('05-01', '05-10', '05-15')).toBe(true); // beidzās pirms 5 dienām
    expect(windowNear('05-01', '05-10', '05-20')).toBe(false);
    expect(windowNear('05-20', '06-10', '05-14')).toBe(true); // sākas pēc 6 dienām
    expect(windowNear('11-01', '02-01', '01-15')).toBe(true); // šķērso gadu miju
    expect(windowNear(null, null, '05-15')).toBe(false);
  });

  it('indoor window for transplants, outdoor for others', () => {
    const tomato = p({ id: 2, sowMethod: 'TRANSPLANT', indoorSowFrom: '03-15', indoorSowTo: '04-10', outdoorFrom: '06-01', outdoorTo: '06-15' });
    const carrot = p({ id: 3 });
    const res = sowThisWeek([tomato, carrot], '03-20', new Set());
    expect(res.map((s) => [s.plant.id, s.where])).toEqual([[2, 'indoors']]);
    expect(sowThisWeek([tomato, carrot], '05-01', new Set()).map((s) => s.plant.id)).toEqual([3]);
  });

  it('frost-sensitive plants wait for the garden last frost', () => {
    const bean = p({ id: 4, frostSensitive: true, outdoorFrom: '05-10', outdoorTo: '06-20' });
    expect(sowThisWeek([bean], '05-05', new Set(), { lastFrost: '05-30', firstFrost: '09-20' })).toEqual([]);
    expect(sowThisWeek([bean], '05-05', new Set(), null).length).toBe(1);
    expect(sowThisWeek([bean], '05-25', new Set(), { lastFrost: '05-30', firstFrost: '09-20' })[0].until).toBe('06-20');
  });

  it('plants already used in the garden come first, then vegetables', () => {
    const flower = p({ id: 5, category: 'FLOWER' });
    const herb = p({ id: 6, category: 'HERB' });
    const used = p({ id: 7, category: 'FLOWER' });
    const res = sowThisWeek([flower, herb, used], '05-01', new Set([7]));
    expect(res.map((s) => s.plant.id)).toEqual([7, 6, 5]);
    expect(res[0].used).toBe(true);
    expect(sowThisWeek([flower, herb, used], '05-01', new Set(), null, 1).length).toBe(1);
  });

  it('days until last frost', () => {
    expect(daysUntil('05-18', '05-01')).toBe(17);
    expect(daysUntil('05-18', '06-01')).toBeLessThan(0);
  });
});
