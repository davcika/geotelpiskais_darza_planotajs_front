import { PlantCategory } from '../../planting/plant';
import { PlantInput } from '../catalog-api';

/** Tāda pati secība kā formā, lai fokuss nonāk uz pirmo kļūdaino lauku */
export const FIELD_ORDER = [
  'nameEn', 'nameLv', 'family', 'indoorSowFrom', 'indoorSowTo', 'outdoorFrom', 'outdoorTo',
  'daysToHarvest', 'harvestWindowDays', 'bloomFrom', 'bloomTo', 'bloomColor',
  'heightM', 'spreadM', 'yearsToMature', 'phMin', 'phMax',
] as const;
export type FieldName = (typeof FIELD_ORDER)[number];
export type FieldErrors = Partial<Record<FieldName, string>>;

export const CATEGORY_LABELS: Record<PlantCategory, string> = {
  VEGETABLE: 'Vegetable', HERB: 'Herb', FLOWER: 'Flower', BULB: 'Bulb', SHRUB: 'Shrub', TREE: 'Tree', HEDGE: 'Hedge',
};

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const blank = (v: unknown) => v === null || v === undefined || String(v).trim() === '';

/** Pārbauda MM DD datumu un atdod kļūdu vai null */
export function monthDayError(v: string | null | undefined): string | null {
  if (blank(v)) return null;
  const m = /^(\d{2})-(\d{2})$/.exec(String(v).trim());
  if (!m) return 'Use month-day format MM-DD, e.g. 05-25';
  const month = +m[1], day = +m[2];
  if (month < 1 || month > 12) return 'Month must be 01–12';
  if (day < 1 || day > DAYS_IN_MONTH[month - 1]) return `Day must be 01–${DAYS_IN_MONTH[month - 1]} for this month`;
  return null;
}

function numberError(v: unknown, opts: { integer?: boolean; min?: number; max?: number; positive?: boolean }): string | null {
  if (blank(v)) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return 'Enter a number';
  if (opts.integer && !Number.isInteger(n)) return 'Enter a whole number';
  if (opts.positive && n <= 0) return 'Must be greater than 0';
  if (opts.min !== undefined && opts.max !== undefined && (n < opts.min || n > opts.max)) return `Must be between ${opts.min} and ${opts.max}`;
  return null;
}

/** Tie paši noteikumi kā backend PlantRequest un PlantService.validate */
export function validatePlant(d: PlantInput): FieldErrors {
  const e: FieldErrors = {};
  const set = (f: FieldName, msg: string | null) => { if (msg && !e[f]) e[f] = msg; };
  const required = (f: FieldName, label: string) => { if (blank(d[f])) set(f, `${label} is required`); };

  required('nameEn', 'English name');
  if (String(d.nameEn ?? '').length > 60) set('nameEn', 'At most 60 characters');
  required('nameLv', 'Latvian name');
  if (String(d.nameLv ?? '').length > 60) set('nameLv', 'At most 60 characters');
  required('family', 'Family');
  if (!blank(d.family) && !/^[A-Za-z]+$/.test(String(d.family).trim())) set('family', 'Letters only (A–Z), no spaces');
  if (String(d.family ?? '').length > 30) set('family', 'At most 30 characters');

  if (d.sowMethod === 'TRANSPLANT') {
    required('indoorSowFrom', 'Indoor sowing start');
    required('indoorSowTo', 'Indoor sowing end');
  }
  required('outdoorFrom', 'Start date');
  required('outdoorTo', 'End date');

  const dates: FieldName[] = ['outdoorFrom', 'outdoorTo', 'bloomFrom', 'bloomTo'];
  if (d.sowMethod === 'TRANSPLANT') dates.unshift('indoorSowFrom', 'indoorSowTo');
  for (const f of dates) set(f, monthDayError(d[f] as string | null));

  if (blank(d.bloomFrom) !== blank(d.bloomTo)) set(blank(d.bloomFrom) ? 'bloomFrom' : 'bloomTo', 'Set both bloom dates, or neither');
  if (!blank(d.bloomColor) && !/^#[0-9a-f]{6}$/.test(String(d.bloomColor))) set('bloomColor', 'Use lowercase hex like #d8577e');

  set('daysToHarvest', numberError(d.daysToHarvest, { integer: true, positive: true }));
  set('harvestWindowDays', numberError(d.harvestWindowDays, { integer: true, positive: true }));
  if (blank(d.daysToHarvest) !== blank(d.harvestWindowDays))
    set(blank(d.daysToHarvest) ? 'daysToHarvest' : 'harvestWindowDays', 'Set both days to harvest and harvest window, or neither');

  set('heightM', numberError(d.heightM, { positive: true }));
  set('spreadM', numberError(d.spreadM, { positive: true }));
  set('yearsToMature', numberError(d.yearsToMature, { integer: true, positive: true }));
  set('phMin', numberError(d.phMin, { min: 3, max: 9 }));
  set('phMax', numberError(d.phMax, { min: 3, max: 9 }));
  if (!e.phMin && !e.phMax && !blank(d.phMin) && !blank(d.phMax) && Number(d.phMin) > Number(d.phMax))
    set('phMax', 'pH max must be at least pH min');
  return e;
}
