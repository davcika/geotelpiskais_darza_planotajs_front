import type { Plant } from '../planting/plant';
import { DAYS, dayOfYear, windowDays } from '../catalog/timeline';

export type SowWhere = 'indoors' | 'outdoors';

export interface SowSuggestion {
  plant: Plant;
  where: SowWhere;
  /** Šogad jau iestādīts šajā dārzā */
  used: boolean;
  /** Loga beigu datums tekstam until */
  until: string;
}

/** Logs ir aktīvs, ja tas ir tuvu šodienai, arī pāri gadu mijai */
export function windowNear(from: string | null, to: string | null, todayMmdd: string, margin = 7): boolean {
  if (!from || !to) return false;
  const [a, b] = windowDays(from, to);
  const t = dayOfYear(todayMmdd);
  return [-DAYS, 0, DAYS].some((shift) => a + shift <= t + margin && b + shift >= t - margin);
}

/**
 * Augi, ko šonedēļ var sēt vai stādīt, salnu jutīgiem ārā tikai starp salnām.
 * Vispirms tie, kas jau aug šajā dārzā, tad populārākie.
 */
export function sowThisWeek(
  plants: Plant[],
  todayMmdd: string,
  usedIds: ReadonlySet<number>,
  frost?: { lastFrost: string | null; firstFrost: string | null } | null,
  limit = 8,
): SowSuggestion[] {
  const out: SowSuggestion[] = [];
  for (const plant of plants) {
    const used = usedIds.has(plant.id);
    if (plant.sowMethod === 'TRANSPLANT' && windowNear(plant.indoorSowFrom, plant.indoorSowTo, todayMmdd)) {
      out.push({ plant, where: 'indoors', used, until: plant.indoorSowTo! });
      continue;
    }
    let from = plant.outdoorFrom;
    let to = plant.outdoorTo;
    if (plant.frostSensitive && frost?.lastFrost && from && dayOfYear(from) < dayOfYear(frost.lastFrost)) from = frost.lastFrost;
    if (plant.frostSensitive && frost?.firstFrost && to && dayOfYear(to) > dayOfYear(frost.firstFrost)) to = frost.firstFrost;
    if (from && to && dayOfYear(from) > dayOfYear(to) && plant.frostSensitive) continue; // starp salnām logs nepaliek
    if (windowNear(from, to, todayMmdd)) out.push({ plant, where: 'outdoors', used, until: to });
  }
  const rank = (s: SowSuggestion) => (s.used ? 0 : POPULAR.has(s.plant.category) ? 1 : 2);
  return out
    .map((s, i) => ({ s, i }))
    .sort((x, y) => rank(x.s) - rank(y.s) || x.i - y.i)
    .slice(0, limit)
    .map((x) => x.s);
}

/** Popularitātes datu nav, tāpēc dārzeņi un garšaugi iet pirms dekoratīvajiem */
const POPULAR = new Set(['VEGETABLE', 'HERB']);

/** Dienas līdz datumam šogad, negatīvs, ja jau pagājis */
export function daysUntil(mmdd: string, todayMmdd: string): number {
  return dayOfYear(mmdd) - dayOfYear(todayMmdd);
}
