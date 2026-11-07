import type { Plant } from '../planting/plant';
import { MONTHS } from '../shared/format';

/** Ko katrā mēnesī redz dobē vai kokā, bez Angular un OL, lai vieglāk testēt. Janvāris ir mēnesis 0. */

export type Look = { kind: 'bloom'; color: string } | { kind: 'foliage' } | { kind: 'bare' };

export const FOLIAGE_COLOR = '#4f8a4b';
export const BARE_COLOR = '#c9b9a0';
export { MONTHS };

/** Ja dārzenim nav ražas datu, pieņemam, ka tas redzams kādus trīs mēnešus */
const DEFAULT_VISIBLE_DAYS = 90;
const DAY_MS = 86_400_000;

export function lookColor(look: Look): string {
  return look.kind === 'bloom' ? look.color : look.kind === 'foliage' ? FOLIAGE_COLOR : BARE_COLOR;
}

/** Intervāls var iet pāri gadumijai, piemēram no novembra līdz martam */
export function rangeTouchesMonth(from: string, to: string, month: number): boolean {
  const mm = String(month + 1).padStart(2, '0');
  const start = `${mm}-01`;
  const end = `${mm}-31`;
  if (from <= to) return from <= end && to >= start;
  return from <= end || to >= start;
}

function datesTouchMonth(from: number, to: number, year: number, month: number): boolean {
  return from < Date.UTC(year, month + 1, 1) && to >= Date.UTC(year, month, 1);
}

function utc(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

/** Puķēm un kokiem katalogā ir ziedēšanas un lapu dati, dārzeņiem nav */
function hasLookData(plant: Plant): boolean {
  return plant.evergreen || plant.foliageFrom !== null || plant.bloomFrom !== null;
}

/** Skatās tikai kataloga datus, stādīšanas datums te nav svarīgs */
function seasonalLook(plant: Plant, month: number): Look {
  if (plant.bloomFrom && plant.bloomTo && rangeTouchesMonth(plant.bloomFrom, plant.bloomTo, month)) {
    return { kind: 'bloom', color: plant.bloomColor ?? FOLIAGE_COLOR };
  }
  if (plant.evergreen) return { kind: 'foliage' };
  if (plant.foliageFrom && plant.foliageTo && rangeTouchesMonth(plant.foliageFrom, plant.foliageTo, month)) {
    return { kind: 'foliage' };
  }
  return { kind: 'bare' };
}

/** Daudzgadīgie redzami katru gadu, bet dārzenis tikai no sējas līdz ražas beigām, kas var būt jau nākamajā gadā kā ķiplokam */
export function plantingLook(plant: Plant, sownOn: string, year: number, month: number): Look {
  const sownYear = Number(sownOn.slice(0, 4));
  const sownMonth = Number(sownOn.slice(5, 7)) - 1;
  if (hasLookData(plant)) {
    if (sownYear > year) return { kind: 'bare' };
    if (sownYear === year && month < sownMonth) return { kind: 'bare' };
    if (sownYear < year && !plant.perennial) return { kind: 'bare' };
    return seasonalLook(plant, month);
  }

  if (plant.perennial && sownYear < year) {
    return rangeTouchesMonth(plant.outdoorFrom, '10-31', month) ? { kind: 'foliage' } : { kind: 'bare' };
  }
  let from = utc(sownOn);
  if (plant.sowMethod === 'TRANSPLANT') from = Math.max(from, utc(`${sownYear}-${plant.outdoorFrom}`));
  const days =
    plant.daysToHarvest !== null ? plant.daysToHarvest + (plant.harvestWindowDays ?? 0) : DEFAULT_VISIBLE_DAYS;
  const to = utc(sownOn) + days * DAY_MS;
  return datesTouchMonth(from, to, year, month) ? { kind: 'foliage' } : { kind: 'bare' };
}

/** Par koku bez kataloga auga nekā nezinām, tāpēc rādām zaļu */
export function treeLook(plant: Plant | undefined, month: number): Look {
  return plant ? seasonalLook(plant, month) : { kind: 'foliage' };
}

/** Ziedi uzvar lapas, lapas uzvar tukšumu */
export function combineLooks(looks: Look[]): Look {
  return looks.find((look) => look.kind === 'bloom') ?? looks.find((look) => look.kind === 'foliage') ?? { kind: 'bare' };
}

export function bareMonths(looksByMonth: (month: number) => Look): boolean[] {
  return MONTHS.map((_, month) => looksByMonth(month).kind === 'bare');
}

/** Blakus esošos tukšos mēnešus apvieno vienā posmā, arī pāri gadumijai */
export function describeMonths(bare: boolean[]): string | null {
  if (!bare.some(Boolean)) return null;
  if (bare.every(Boolean)) return 'all year';
  // Sākam aiz pēdējā zaļā mēneša, lai posms pāri gadumijai nesadalās divās daļās
  const offset = (bare.lastIndexOf(false) + 1) % 12;
  const parts: string[] = [];
  let runStart: number | null = null;
  for (let i = 0; i <= 12; i++) {
    const month = (offset + i) % 12;
    const isBare = i < 12 && bare[month];
    if (isBare && runStart === null) runStart = month;
    if (!isBare && runStart !== null) {
      const last = (month + 11) % 12;
      parts.push(runStart === last ? MONTHS[runStart] : `${MONTHS[runStart]}–${MONTHS[last]}`);
      runStart = null;
    }
  }
  return parts.join(', ');
}

export function bareWarning(bare: boolean[]): string | null {
  const months = describeMonths(bare);
  return months === null ? null : `Bare ${months} — consider an evergreen`;
}
