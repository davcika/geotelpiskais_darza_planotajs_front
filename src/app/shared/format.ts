import { HttpErrorResponse } from '@angular/common/http';

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const monthDay = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** Datumu bez gada liek dotajā gadā un skaita UTC, lai laika josla nesabojā dienas */
function utcDay(date: string, year: number): number {
  const iso = date.length === 5 ? `${year}-${date}` : date;
  return Date.parse(`${iso}T00:00:00Z`);
}

/** Pārvērš datumu par 1 Mar formu */
export function formatMonthDay(date: string | null | undefined, fallback = ''): string {
  if (!date) return fallback;
  return monthDay.format(utcDay(date, 2000));
}

/** Datumiem bez gada ņem doto gadu */
export function daysBetween(from: string, to: string, year = 2026): number {
  return Math.round((utcDay(to, year) - utcDay(from, year)) / 86_400_000);
}

const numberFormats = new Map<number, Intl.NumberFormat>();

export function formatNumber(n: number, digits = 1): string {
  let format = numberFormats.get(digits);
  if (!format) numberFormats.set(digits, (format = new Intl.NumberFormat('en-GB', { maximumFractionDigits: digits })));
  return format.format(n);
}

export function formatArea(m2: number, digits = 1): string {
  return `${formatNumber(m2, digits)} m²`;
}

/** Backend kļūdas tekstu liek ProblemDetail laukā detail */
export function problemDetail(error: unknown, fallback: string): string {
  return (error as { error?: { detail?: string } })?.error?.detail ?? fallback;
}

export function errorText(e: unknown): string {
  return e instanceof HttpErrorResponse ? problemDetail(e, e.message) : 'Something went wrong';
}

/** Nogriež visu pēc jautājuma zīmes vai restītes */
export const pathOf = (url: string) => url.split(/[?#]/)[0];
