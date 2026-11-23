import { Polygon } from 'ol/geom';
import type { Plant } from '../planting/plant';
import { circleInside, circleOverlapsPolygon, circlesOverlap, crownRadiusAt } from './crown';
import { bareMonths, bareWarning, combineLooks, describeMonths, plantingLook, rangeTouchesMonth, treeLook } from './season';

const base: Plant = {
  id: 1,
  nameEn: 'Test',
  nameLv: 'Tests',
  family: 'ROSACEAE',
  category: 'VEGETABLE',
  sowMethod: 'DIRECT',
  indoorSowFrom: null,
  indoorSowTo: null,
  outdoorFrom: '05-01',
  outdoorTo: '06-01',
  daysToHarvest: 60,
  harvestWindowDays: 20,
  frostSensitive: false,
  perennial: false,
  evergreen: false,
  foliageFrom: null,
  foliageTo: null,
  bloomFrom: null,
  bloomTo: null,
  bloomColor: null,
  heightM: null,
  spreadM: null,
  yearsToMature: null,
  phMin: null,
  phMax: null,
  light: null,
};

const tulip: Plant = {
  ...base,
  category: 'BULB',
  sowMethod: 'PLANT',
  perennial: true,
  foliageFrom: '04-01',
  foliageTo: '06-15',
  bloomFrom: '04-25',
  bloomTo: '05-20',
  bloomColor: '#d8577e',
};
const spruce: Plant = { ...base, category: 'TREE', perennial: true, evergreen: true, spreadM: 6, yearsToMature: 20 };

describe('season', () => {
  it('handles ranges across the new year', () => {
    expect(rangeTouchesMonth('11-15', '02-10', 0)).toBe(true);
    expect(rangeTouchesMonth('11-15', '02-10', 5)).toBe(false);
    expect(rangeTouchesMonth('04-25', '05-20', 3)).toBe(true);
  });

  it('shows a vegetable from sowing until the end of harvest', () => {
    // Pirmais maijs plus 80 dienas ir ap 20. jūliju
    expect(plantingLook(base, '2026-05-01', 2026, 3).kind).toBe('bare');
    expect(plantingLook(base, '2026-05-01', 2026, 6).kind).toBe('foliage');
    expect(plantingLook(base, '2026-05-01', 2026, 7).kind).toBe('bare');
  });

  it('carries an autumn-sown vegetable into the next year', () => {
    const garlic: Plant = { ...base, daysToHarvest: 270, harvestWindowDays: 14 };
    expect(plantingLook(garlic, '2025-10-01', 2026, 5).kind).toBe('foliage');
    expect(plantingLook(garlic, '2025-10-01', 2026, 9).kind).toBe('bare');
  });

  it('shows autumn bulbs in the following years', () => {
    expect(plantingLook(tulip, '2025-10-01', 2025, 4).kind).toBe('bare');
    expect(plantingLook(tulip, '2025-10-01', 2026, 4)).toEqual({ kind: 'bloom', color: '#d8577e' });
    expect(plantingLook(tulip, '2025-10-01', 2027, 5).kind).toBe('foliage');
    expect(plantingLook(tulip, '2025-10-01', 2026, 11).kind).toBe('bare');
  });

  it('keeps evergreens green and unknown trees green', () => {
    expect(treeLook(spruce, 0).kind).toBe('foliage');
    expect(treeLook(undefined, 0).kind).toBe('foliage');
  });

  it('prefers bloom over foliage', () => {
    expect(combineLooks([{ kind: 'bare' }, { kind: 'foliage' }, { kind: 'bloom', color: '#fff' }]).kind).toBe('bloom');
    expect(combineLooks([]).kind).toBe('bare');
  });

  it('describes bare months across the new year', () => {
    const bare = bareMonths((m) => plantingLook(tulip, '2025-10-01', 2026, m));
    expect(describeMonths(bare)).toBe('Jul–Mar');
    expect(bareWarning(bare)).toBe('Bare Jul–Mar — consider an evergreen');
    expect(describeMonths(new Array(12).fill(false))).toBeNull();
    expect(describeMonths(new Array(12).fill(true))).toBe('all year');
    const two = new Array(12).fill(false);
    two[0] = true;
    two[5] = two[6] = true;
    expect(describeMonths(two)).toBe('Jan, Jun–Jul');
  });
});

describe('crown', () => {
  it('grows linearly to the mature size', () => {
    expect(crownRadiusAt(spruce, 2026, 2026)).toBe(0.3);
    expect(crownRadiusAt(spruce, 2026, 2036)).toBe(1.7);
    expect(crownRadiusAt(spruce, 2026, 2060)).toBe(3);
    expect(crownRadiusAt(spruce, undefined, 2026)).toBe(3);
    expect(crownRadiusAt(base, 2026, 2026)).toBeNull();
  });

  it('detects overlaps', () => {
    const square = new Polygon([[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]]);
    expect(circleOverlapsPolygon([12, 5], 3, square)).toBe(true);
    expect(circleOverlapsPolygon([15, 5], 3, square)).toBe(false);
    expect(circlesOverlap([0, 0], 2, [3, 0], 2)).toBe(true);
    expect(circlesOverlap([0, 0], 1, [3, 0], 2)).toBe(false);
    expect(circleInside([5, 5], 4, square)).toBe(true);
    expect(circleInside([5, 5], 6, square)).toBe(false);
  });
});
