import type { Plant } from '../planting/plant';
import { plantsFit, areaPerPlantM2 } from '../planting/plant';
import { dayOfYear, daySegments, formatSpacingPair, harvestSegments, timelineBars, windowSegments } from './timeline';

const base = {
  id: 1, nameEn: 'X', nameLv: 'X', family: 'APIACEAE', category: 'VEGETABLE', sowMethod: 'DIRECT',
  indoorSowFrom: null, indoorSowTo: null, outdoorFrom: '04-25', outdoorTo: '05-25', daysToHarvest: 100,
  harvestWindowDays: 40, frostSensitive: false, perennial: false, evergreen: false, foliageFrom: null, foliageTo: null,
  bloomFrom: null, bloomTo: null, bloomColor: null, heightM: null, spreadM: null, yearsToMature: null,
  phMin: null, phMax: null, light: null,
} as Plant;

describe('timeline', () => {
  it('dayOfYear', () => {
    expect(dayOfYear('01-01')).toBe(0);
    expect(dayOfYear('03-01')).toBe(59);
    expect(dayOfYear('12-31')).toBe(364);
  });

  it('simple window is one segment', () => {
    const [s] = windowSegments('04-25', '05-25');
    expect(s.start).toBeCloseTo(114 / 365);
    expect(s.end).toBeCloseTo(145 / 365);
  });

  it('window crossing year end splits in two', () => {
    const segs = windowSegments('11-01', '02-01');
    expect(segs.length).toBe(2);
    expect(segs[0].start).toBe(0);
    expect(segs[1].end).toBe(1);
  });

  it('longer than a year fills everything', () => {
    expect(daySegments(10, 500)).toEqual([{ start: 0, end: 1 }]);
  });

  it('garlic sown in autumn is harvested next summer', () => {
    const garlic = { ...base, outdoorFrom: '09-15', outdoorTo: '10-15', daysToHarvest: 290, harvestWindowDays: 20 };
    const segs = harvestSegments(garlic);
    expect(segs.length).toBe(1);
    // 15. septembris plus 290 dienas ir ap 2. jūliju
    expect(segs[0].start * 365).toBeCloseTo(dayOfYear('07-02'), 0);
  });

  it('transplant has indoors, ornamental has bloom', () => {
    const tomato = { ...base, sowMethod: 'TRANSPLANT', indoorSowFrom: '03-01', indoorSowTo: '04-01' } as Plant;
    expect(timelineBars(tomato).map((b) => b.kind)).toEqual(['indoors', 'outdoors', 'harvest']);
    const tulip = { ...base, sowMethod: 'PLANT', daysToHarvest: null, bloomFrom: '04-20', bloomTo: '05-20' } as Plant;
    expect(timelineBars(tulip).map((b) => b.kind)).toEqual(['outdoors', 'bloom']);
  });

  it('formats spacing', () => {
    expect(formatSpacingPair(50, 70)).toBe('50 × 70 cm');
    expect(formatSpacingPair(400, 500)).toBe('4 × 5 m');
    expect(formatSpacingPair(null, null)).toBe('—');
  });

  it('plantsFit and areaPerPlant', () => {
    const tomato = { ...base, spacingCm: 50, rowSpacingCm: 70 };
    expect(areaPerPlantM2(tomato)).toBeCloseTo(0.35);
    expect(plantsFit(tomato, 1.4, 2)).toEqual({ cols: 4, rows: 2, total: 8 });
    expect(plantsFit(base, 1, 1).total).toBe(0);
  });
});
