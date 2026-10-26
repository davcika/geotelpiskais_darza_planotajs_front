import { HttpClient } from '@angular/common/http';
import { Component, DestroyRef, effect, inject, input, signal, untracked } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { TipComponent } from '../tour/tip.component';
import { Subscription } from 'rxjs';
import { problemDetail } from '../shared/format';

export interface Soil {
  soilType: string | null;
  ph: number | null;
  organicMatterPct: number | null;
  nitrogen: number | null;
  phosphorus: number | null;
  potassium: number | null;
  moisture: string | null;
  light: string | null;
  testedOn: string | null;
  labNote: string | null;
}

interface BedSoil {
  gardenId: number;
  own: Soil | null;
  gardenDefault: Soil | null;
  effective: Soil | null;
}

interface FitItem {
  plantingId: number | null;
  plantId: number;
  nameEn: string;
  nameLv: string;
  level: 'GOOD' | 'OK' | 'POOR';
  reasons: string[];
}

interface Suitability {
  soil: Soil | null;
  plantings: FitItem[];
  suggestions: FitItem[];
}

/** Skaitlisko lauku robežas tādas pašas kā backend pārbaudē */
const LIMITS: Partial<Record<keyof Soil, { min: number; max?: number; label: string }>> = {
  ph: { min: 3, max: 10, label: 'pH' },
  organicMatterPct: { min: 0, max: 100, label: 'Organic matter' },
  nitrogen: { min: 0, label: 'N' },
  phosphorus: { min: 0, label: 'P' },
  potassium: { min: 0, label: 'K' },
};

/** Skaitlisko lauku apraksti formai */
const NUMERIC_FIELDS = (
  [
    ['ph', 'pH', 0.1],
    ['organicMatterPct', 'Organic %', 0.1],
    ['nitrogen', 'N mg/kg', null],
    ['phosphorus', 'P mg/kg', null],
    ['potassium', 'K mg/kg', null],
  ] as const
).map(([key, title, step]) => ({ key, title, step, min: LIMITS[key]!.min, max: LIMITS[key]!.max ?? null }));

/** Lauka kļūda vai null */
function soilFieldError(soil: Soil, key: keyof Soil): string | null {
  const lim = LIMITS[key];
  const v = soil[key];
  if (!lim || v === null || v === undefined) return null;
  if (typeof v !== 'number' || !Number.isFinite(v)) return `${lim.label} must be a number.`;
  if (v < lim.min || (lim.max !== undefined && v > lim.max)) {
    return lim.max !== undefined ? `${lim.label} must be between ${lim.min} and ${lim.max}.` : `${lim.label} cannot be negative.`;
  }
  return null;
}

const hasErrors = (soil: Soil) => (Object.keys(LIMITS) as (keyof Soil)[]).some((k) => soilFieldError(soil, k));

let nextUid = 0;

/** Saprotami nosaukumi servera enum vērtībām */
const LABELS: Record<string, string> = {
  PART: 'Part shade', SUN: 'Full sun', SHADE: 'Shade', GOOD: 'Good fit', OK: 'OK', POOR: 'Poor fit',
};
function soilLabel(value: string | null | undefined): string {
  if (!value) return '';
  return LABELS[value] ?? value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, ' ');
}

const EMPTY: Soil = {
  soilType: null, ph: null, organicMatterPct: null, nitrogen: null, phosphorus: null, potassium: null,
  moisture: null, light: null, testedOn: null, labNote: null,
};

/** Dobes augsnes kartīte ar formu, piemērotības sarakstu un AI ieteikumu */
@Component({
  selector: 'app-soil-card',
  imports: [NgTemplateOutlet, TipComponent],
  templateUrl: './soil-card.html',
  styleUrl: './soil-card.scss',
})
export class SoilCard {
  private readonly http = inject(HttpClient);
  readonly objectId = input<number | undefined>();
  readonly year = input(new Date().getFullYear());

  protected readonly soilTypes = ['SAND', 'SANDY_LOAM', 'LOAM', 'CLAY_LOAM', 'CLAY', 'PEAT'];
  protected readonly bed = signal<BedSoil | null>(null);
  protected readonly useDefault = signal(true);
  protected readonly draft = signal<Soil>({ ...EMPTY });
  protected readonly gardenDraft = signal<Soil>({ ...EMPTY });
  protected readonly showGarden = signal(false);
  protected readonly fit = signal<Suitability | null>(null);
  protected readonly advice = signal<string | null>(null);
  protected readonly asking = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly saved = signal(false);
  protected readonly label = soilLabel;
  protected readonly numericFields = NUMERIC_FIELDS;
  private loading?: Subscription;
  private fitLoading?: Subscription;
  /** Unikāls id prefikss, jo lapā var būt vairākas kartītes */
  protected readonly uid = `soil${++nextUid}`;

  protected fieldError(target: 'bed' | 'garden', key: keyof Soil): string | null {
    return soilFieldError(target === 'bed' ? this.draft() : this.gardenDraft(), key);
  }

  protected errId(target: string, key: string): string {
    return `${this.uid}-${target}-${key}-err`;
  }

  constructor() {
    // Pārlādē, kad mainās dobe vai sezona, un veco pieprasījumu atceļ
    effect(() => {
      const id = this.objectId();
      const year = this.year();
      this.advice.set(null);
      if (id === undefined) return;
      untracked(() => {
        this.loadSoil(id);
        this.loadFit(id, year);
      });
    });
    inject(DestroyRef).onDestroy(() => {
      this.loading?.unsubscribe();
      this.fitLoading?.unsubscribe();
    });
  }

  private loadSoil(id: number): void {
    this.loading?.unsubscribe();
    this.loading = this.http.get<BedSoil>(`/api/objects/${id}/soil`).subscribe({
      next: (bed) => {
        this.error.set(null);
        this.applyBed(bed);
      },
      error: (e) => this.error.set(problemDetail(e, 'Could not load soil. Try again.')),
    });
  }

  /** Mēģina vēlreiz, ja ielāde neizdevās */
  protected retry(): void {
    const id = this.objectId();
    if (id !== undefined) this.reload(id);
  }

  private applyBed(bed: BedSoil): void {
    this.bed.set(bed);
    this.useDefault.set(!bed.own);
    this.draft.set({ ...EMPTY, ...(bed.own ?? bed.gardenDefault ?? {}) });
    this.gardenDraft.set({ ...EMPTY, ...(bed.gardenDefault ?? {}) });
  }

  private loadFit(id: number, year: number): void {
    // Atceļ iepriekšējo pieprasījumu, lai vecās sezonas atbilde nepārrakstītu jauno
    this.fitLoading?.unsubscribe();
    this.fitLoading = this.http.get<Suitability>(`/api/objects/${id}/soil/suitability`, { params: { year } }).subscribe({
      next: (fit) => this.fit.set(fit),
      error: () => this.fit.set(null),
    });
  }

  protected patch(target: 'bed' | 'garden', key: keyof Soil, raw: string, numeric = false): void {
    const value = raw === '' ? null : numeric ? Number(raw) : raw;
    const sig = target === 'bed' ? this.draft : this.gardenDraft;
    sig.update((s) => ({ ...s, [key]: value }));
    this.saved.set(false);
  }

  protected toggleDefault(checked: boolean): void {
    const id = this.objectId();
    this.useDefault.set(checked);
    if (checked && id !== undefined && this.bed()?.own) {
      // Dzēš dobes pārrakstījumu
      this.http.delete(`/api/objects/${id}/soil`).subscribe({
        next: () => this.reload(id),
        error: (e) => {
          this.useDefault.set(false);
          this.error.set(problemDetail(e, 'Could not reset soil. Try again.'));
        },
      });
    }
  }

  protected saveBed(): void {
    const id = this.objectId();
    if (id === undefined) return;
    if (!this.validate(this.draft())) return;
    this.http.put<BedSoil>(`/api/objects/${id}/soil`, this.draft()).subscribe({
      next: (bed) => {
        this.error.set(null);
        this.applyBed(bed);
        this.saved.set(true);
        this.loadFit(id, this.year());
      },
      error: (e) => this.error.set(problemDetail(e, 'Could not save soil. Try again.')),
    });
  }

  protected saveGarden(): void {
    const bed = this.bed();
    const id = this.objectId();
    if (!bed || id === undefined) return;
    if (!this.validate(this.gardenDraft())) return;
    this.http.put<Soil>(`/api/gardens/${bed.gardenId}/soil`, this.gardenDraft()).subscribe({
      next: () => this.reload(id),
      error: (e) => this.error.set(problemDetail(e, 'Could not save garden soil. Try again.')),
    });
  }

  protected ask(): void {
    const id = this.objectId();
    if (id === undefined) return;
    this.asking.set(true);
    this.advice.set(null);
    this.http.post<{ advice: string }>(`/api/objects/${id}/soil/advice`, null, { params: { year: this.year() } }).subscribe({
      next: (r) => {
        this.error.set(null);
        this.advice.set(r.advice);
        this.asking.set(false);
      },
      error: (e) => {
        this.error.set(e?.status === 503 ? 'The AI assistant is not configured.' : e?.status === 429 ? 'The assistant is busy. Try again in a minute.' : problemDetail(e, 'Could not get advice. Try again.'));
        this.asking.set(false);
      },
    });
  }

  /** Pārbauda melnrakstu pirms saglabāšanas un kļūdas gadījumā parāda paziņojumu */
  private validate(soil: Soil): boolean {
    const ok = !hasErrors(soil);
    this.error.set(ok ? null : 'Fix the highlighted fields first.');
    return ok;
  }

  private reload(id: number): void {
    this.loadSoil(id);
    this.loadFit(id, this.year());
  }
}
