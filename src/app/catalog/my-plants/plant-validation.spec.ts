import { PlantInput } from '../catalog-api';
import { monthDayError, validatePlant } from './plant-validation';

const valid = (): PlantInput => ({
  nameEn: 'Tomato', nameLv: 'Tomāts', family: 'Solanaceae', category: 'VEGETABLE', sowMethod: 'DIRECT',
  indoorSowFrom: null, indoorSowTo: null, outdoorFrom: '05-25', outdoorTo: '06-10',
  daysToHarvest: null, harvestWindowDays: null, frostSensitive: false, perennial: false, evergreen: false,
  foliageFrom: null, foliageTo: null, bloomFrom: null, bloomTo: null, bloomColor: null,
  heightM: null, spreadM: null, yearsToMature: null, phMin: null, phMax: null, light: null,
  shareWithEveryone: false,
});

describe('plant validation', () => {
  it('accepts a valid plant', () => expect(validatePlant(valid())).toEqual({}));

  it('checks MM-DD format and calendar', () => {
    expect(monthDayError('sds')).toContain('MM-DD');
    expect(monthDayError('13-01')).toContain('Month');
    expect(monthDayError('02-30')).toContain('Day');
    expect(monthDayError('02-29')).toBeNull();
  });

  it('reports the user example errors', () => {
    const e = validatePlant({ ...valid(), outdoorFrom: 'sds', phMin: 32, phMax: 23, bloomTo: '23' });
    expect(Object.keys(e).sort()).toEqual(['bloomFrom', 'bloomTo', 'outdoorFrom', 'phMax', 'phMin']);
  });

  it('requires names and ph min <= max', () => {
    const e = validatePlant({ ...valid(), nameEn: ' ', phMin: 7, phMax: 6 });
    expect(e.nameEn).toBeTruthy();
    expect(e.phMax).toContain('pH min');
  });
});
