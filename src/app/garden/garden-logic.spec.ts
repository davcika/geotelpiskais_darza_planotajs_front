import { dateToMonthDay, frostProblem, monthDayToDate } from './frost-logic';
import { GardenDto, pickCurrent } from './garden-store';
import { formatMonthDay } from '../shared/format';

const g = (id: number) => ({ id }) as GardenDto;

describe('pickCurrent', () => {
  it('keeps the remembered garden if it still exists', () => {
    expect(pickCurrent([g(1), g(2)], 2)).toBe(2);
  });
  it('falls back to the first garden', () => {
    expect(pickCurrent([g(1), g(2)], 9)).toBe(1);
    expect(pickCurrent([g(3)], null)).toBe(3);
  });
  it('is null without gardens', () => {
    expect(pickCurrent([], 1)).toBeNull();
  });
});

describe('frost helpers', () => {
  it('validates last < first', () => {
    expect(frostProblem('05-18', '09-27')).toBeNull();
    expect(frostProblem('09-27', '05-18')).not.toBeNull();
    expect(frostProblem('', '05-18')).not.toBeNull();
  });
  it('converts date input values', () => {
    expect(dateToMonthDay('2001-05-18')).toBe('05-18');
    expect(monthDayToDate('05-18')).toBe('2001-05-18');
    expect(formatMonthDay('05-18')).toBe('18 May');
  });
});
