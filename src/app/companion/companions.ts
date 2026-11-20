import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';

export type CompanionRelation = 'GOOD' | 'BAD';

export interface CompanionPair {
  plantAId: number;
  plantBId: number;
  relation: CompanionRelation;
}

/** Atrastais pāris dobē, mazākais id vienmēr ir a */
export interface BedPair {
  a: number;
  b: number;
  relation: CompanionRelation;
}

/** Dobes augu pāri ar zināmu saderību, sliktie pirmie */
export function bedPairs(plantIds: Iterable<number>, pairs: readonly CompanionPair[]): BedPair[] {
  const ids = new Set(plantIds);
  return pairs
    .filter((p) => p.plantAId !== p.plantBId && ids.has(p.plantAId) && ids.has(p.plantBId))
    .map((p) => ({ a: p.plantAId, b: p.plantBId, relation: p.relation }))
    .sort((x, y) => (x.relation === y.relation ? 0 : x.relation === 'BAD' ? -1 : 1));
}

/** Augi dobē ar doto attiecību pret augu, pēc noklusējuma sliktie kaimiņi */
export function neighboursOf(
  plantId: number,
  plantIds: Iterable<number>,
  pairs: readonly CompanionPair[],
  relation: CompanionRelation = 'BAD',
): number[] {
  const ids = new Set(plantIds);
  const out = new Set<number>();
  for (const p of pairs) {
    if (p.relation !== relation || p.plantAId === p.plantBId) continue;
    const other = p.plantAId === plantId ? p.plantBId : p.plantBId === plantId ? p.plantAId : null;
    if (other !== null && ids.has(other)) out.add(other);
  }
  return [...out];
}

/** Saderības katalogs nemainās, tāpēc to ielādē vienreiz */
@Injectable({ providedIn: 'root' })
export class CompanionStore {
  private readonly http = inject(HttpClient);
  readonly pairs = signal<CompanionPair[]>([]);
  private requested = false;

  ensureLoaded(): void {
    if (this.requested) return;
    this.requested = true;
    this.http.get<CompanionPair[]>('/api/plants/companions').subscribe({
      next: (list) => this.pairs.set(list),
      error: () => (this.requested = false),
    });
  }
}
