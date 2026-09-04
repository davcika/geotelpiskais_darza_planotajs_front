import { safeReturnUrl } from './auth.guard';

describe('safeReturnUrl', () => {
  it('pieņem lokālu ceļu', () => {
    expect(safeReturnUrl('/invite/abc')).toBe('/invite/abc');
    expect(safeReturnUrl('/today?x=1')).toBe('/today?x=1');
  });

  it('noraida tukšu, ārēju un protokola-relatīvu adresi', () => {
    expect(safeReturnUrl(null)).toBe('/');
    expect(safeReturnUrl(undefined)).toBe('/');
    expect(safeReturnUrl('')).toBe('/');
    expect(safeReturnUrl('https://evil.example')).toBe('/');
    expect(safeReturnUrl('//evil.example')).toBe('/');
    expect(safeReturnUrl('/\\evil.example')).toBe('/');
    expect(safeReturnUrl('javascript:alert(1)')).toBe('/');
  });
});
