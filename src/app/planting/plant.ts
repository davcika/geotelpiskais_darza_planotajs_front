import { formatMonthDay, formatNumber } from '../shared/format';

/** Kataloga augs no backend, datumi ir mēnesis un diena */
export interface Plant {
  id: number;
  nameEn: string;
  nameLv: string;
  family: string;
  category: PlantCategory;
  /** PLANT nozīmē, ka stāda sīpolu vai stādu, nevis sēj */
  sowMethod: 'DIRECT' | 'TRANSPLANT' | 'PLANT';
  indoorSowFrom: string | null;
  indoorSowTo: string | null;
  outdoorFrom: string;
  outdoorTo: string;
  /** Dekoratīviem augiem ražas nav */
  daysToHarvest: number | null;
  harvestWindowDays: number | null;
  frostSensitive: boolean;
  perennial: boolean;
  /** Lapas visu gadu, citādi augs redzams tikai foliage periodā */
  evergreen: boolean;
  foliageFrom: string | null;
  foliageTo: string | null;
  bloomFrom: string | null;
  bloomTo: string | null;
  bloomColor: string | null;
  /** Pieauguša auga izmēri metros, spreadM ir vainaga diametrs */
  heightM: number | null;
  spreadM: number | null;
  yearsToMature: number | null;
  phMin: number | null;
  phMax: number | null;
  light: 'SUN' | 'PART' | 'SHADE' | null;
}

export type PlantCategory = 'VEGETABLE' | 'HERB' | 'FLOWER' | 'BULB' | 'SHRUB' | 'TREE' | 'HEDGE';

/** Dzimtu krāsas kartei un sarakstam vienā vietā */
export const FAMILY_COLORS: Record<string, string> = {
  SOLANACEAE: '#c0563f',
  CUCURBITACEAE: '#d39b3a',
  BRASSICACEAE: '#5f7f9a',
  APIACEAE: '#e08a3c',
  AMARYLLIDACEAE: '#9a7bb0',
  FABACEAE: '#7a9a45',
  AMARANTHACEAE: '#a8455f',
  ASTERACEAE: '#c9b23f',
  LAMIACEAE: '#4f9a7a',
  POACEAE: '#b59a6a',
  // Puķes, krūmi un koki
  LILIACEAE: '#d8577e',
  IRIDACEAE: '#7d62b8',
  PAEONIACEAE: '#e39bb0',
  ASPARAGACEAE: '#6f9e6a',
  ERICACEAE: '#b8407a',
  OLEACEAE: '#9b7fc4',
  HYDRANGEACEAE: '#8fb3cf',
  ROSACEAE: '#cf6f6f',
  GROSSULARIACEAE: '#5a4a7a',
  CUPRESSACEAE: '#3f6b4a',
  BETULACEAE: '#a3a86a',
  SAPINDACEAE: '#c27a3a',
  PINACEAE: '#2f5a44',
};

export function colorOfFamily(family: string): string {
  return FAMILY_COLORS[family] ?? '#999999';
}

export function familyColor(plant: Plant | undefined): string {
  return plant ? colorOfFamily(plant.family) : colorOfFamily('');
}

export function formatMeters(m: number): string {
  return formatNumber(m);
}

export { formatArea } from '../shared/format';

/** Der gan mēnesis ar dienu, gan pilns datums */
export function formatDate(date: string): string {
  return formatMonthDay(date);
}

/** Dēstiem sēja telpās, pārējiem sēja ārā */
function sowWindow(plant: Plant): [string, string] {
  return plant.sowMethod === 'TRANSPLANT' ? [plant.indoorSowFrom!, plant.indoorSowTo!] : [plant.outdoorFrom, plant.outdoorTo];
}

/** Sēšanas un stādīšanas ieteikums lietotājam */
export function sowingHint(plant: Plant): string {
  const range = (from: string, to: string) => `${formatDate(from)} – ${formatDate(to)}`;
  if (plant.sowMethod === 'PLANT') return `Plant ${range(plant.outdoorFrom, plant.outdoorTo)}`;
  return plant.sowMethod === 'TRANSPLANT'
    ? `Sow indoors ${range(plant.indoorSowFrom!, plant.indoorSowTo!)}, plant out ${range(plant.outdoorFrom, plant.outdoorTo)}`
    : `Sow outdoors ${range(plant.outdoorFrom, plant.outdoorTo)}`;
}

/** Vai datums ir sēšanas logā, mēneša un dienas virknes var salīdzināt tieši */
export function isInSowWindow(plant: Plant, date: string): boolean {
  const [from, to] = sowWindow(plant);
  const mmdd = date.slice(5);
  return mmdd >= from && mmdd <= to;
}

/** Šodiena, ja tā ir logā, citādi loga sākums */
export function defaultSowDate(plant: Plant, year: number): string {
  const today = new Date().toLocaleDateString('sv-SE'); // sv locale dod vietējo datumu ISO formā
  if (today.startsWith(`${year}-`) && isInSowWindow(plant, today)) return today;
  return `${year}-${sowWindow(plant)[0]}`;
}

/** APPROVED augus redz visi, pārējos tikai īpašnieks */
export type PlantStatus = 'APPROVED' | 'PRIVATE' | 'PENDING' | 'REJECTED';

/** Neobligāti, lai vecie testu dati vēl derētu */
export interface Plant {
  status?: PlantStatus;
  /** Paša lietotāja augs */
  mine?: boolean;
  /** Admina piezīme noraidītam augam */
  reviewNote?: string | null;
}

/** Atstatumi un ikona, neobligāti, lai vecie testu dati vēl derētu */
export interface Plant {
  /** Starp augiem rindā cm */
  spacingCm?: number | null;
  /** Starp rindām cm */
  rowSpacingCm?: number | null;
  /** Emocijzīme vai ikonas atslēga */
  icon?: string | null;
}

/** Atstatumi metros, bez rindu atstatuma lieto to pašu kā rindā */
export function spacingM(plant: Plant): [number, number] | null {
  const s = plant.spacingCm ?? plant.rowSpacingCm;
  const r = plant.rowSpacingCm ?? plant.spacingCm;
  return s && r ? [s / 100, r / 100] : null;
}

/** Laukums vienam augam m², ja atstatumi zināmi */
export function areaPerPlantM2(plant: Plant): number | null {
  const sp = spacingM(plant);
  return sp ? sp[0] * sp[1] : null;
}

/** Cik augu ietilpst dobē, ja rindas iet gar garumu un augam līdz malai vajag pusi atstatuma */
export function plantsFit(plant: Plant, widthM: number, lengthM: number): { cols: number; rows: number; total: number } {
  const sp = spacingM(plant);
  if (!sp || widthM <= 0 || lengthM <= 0) return { cols: 0, rows: 0, total: 0 };
  const eps = 1e-9;
  const cols = Math.max(1, Math.floor(lengthM / sp[0] + eps));
  const rows = Math.max(1, Math.floor(widthM / sp[1] + eps));
  return { cols, rows, total: cols * rows };
}
