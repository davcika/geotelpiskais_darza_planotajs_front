import { HttpErrorResponse } from '@angular/common/http';
import { daysBetween, errorText, formatArea, formatMonthDay, formatNumber, pathOf, problemDetail } from './format';
import { readStored, removeStoredWithPrefix, writeStored } from './storage';

describe('shared format', () => {
  it('formats month-day with fallback', () => {
    expect(formatMonthDay('05-18')).toBe('18 May');
    expect(formatMonthDay('2026-03-01')).toBe('1 Mar');
    expect(formatMonthDay(null)).toBe('');
    expect(formatMonthDay(undefined, '—')).toBe('—');
  });

  it('counts days for full and month-day dates', () => {
    expect(daysBetween('2026-03-01', '2026-03-11')).toBe(10);
    expect(daysBetween('03-01', '02-28')).toBe(-1);
    expect(daysBetween('02-28', '03-01', 2024)).toBe(2);
  });

  it('formats numbers and areas', () => {
    expect(formatNumber(12.34)).toBe('12.3');
    expect(formatNumber(1234.5, 0)).toBe('1,235');
    expect(formatArea(70)).toBe('70 m²');
    expect(formatArea(640.4, 0)).toBe('640 m²');
  });

  it('reads error texts and paths', () => {
    expect(problemDetail({ error: { detail: 'Bad' } }, 'x')).toBe('Bad');
    expect(problemDetail(null, 'x')).toBe('x');
    expect(errorText(new HttpErrorResponse({ error: { detail: 'Nope' }, status: 400 }))).toBe('Nope');
    expect(errorText('boom')).toBe('Something went wrong');
    expect(pathOf('/a/b?x=1#y')).toBe('/a/b');
  });
});

describe('shared storage', () => {
  afterEach(() => localStorage.clear());

  it('writes, reads and removes values', () => {
    writeStored('k', 'v');
    expect(readStored('k')).toBe('v');
    writeStored('k', null);
    expect(readStored('k')).toBeNull();
  });

  it('uses session storage when asked', () => {
    writeStored('s', '1', 'session');
    expect(readStored('s', 'session')).toBe('1');
    expect(readStored('s')).toBeNull();
    sessionStorage.clear();
  });

  it('removes keys by prefix', () => {
    writeStored('tip.a', '1');
    writeStored('tip.b', '1');
    writeStored('other', '1');
    removeStoredWithPrefix('tip.');
    expect(readStored('tip.a')).toBeNull();
    expect(readStored('other')).toBe('1');
  });
});
