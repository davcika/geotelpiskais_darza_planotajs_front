import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Plant, PlantCategory, sowingHint } from '../../planting/plant';
import { CatalogApi, PlantInput } from '../catalog-api';
import { errorText } from '../../shared/format';
import { CATEGORY_LABELS, FIELD_ORDER, FieldErrors, FieldName, validatePlant } from './plant-validation';

const CATEGORIES: PlantCategory[] = ['VEGETABLE', 'HERB', 'FLOWER', 'BULB', 'SHRUB', 'TREE', 'HEDGE'];

function emptyDraft(): PlantInput {
  return {
    nameEn: '', nameLv: '', family: '', category: 'VEGETABLE', sowMethod: 'DIRECT',
    indoorSowFrom: null, indoorSowTo: null, outdoorFrom: '', outdoorTo: '',
    daysToHarvest: null, harvestWindowDays: null, frostSensitive: false, perennial: false, evergreen: false,
    foliageFrom: null, foliageTo: null, bloomFrom: null, bloomTo: null, bloomColor: null,
    heightM: null, spreadM: null, yearsToMature: null, phMin: null, phMax: null, light: null,
    shareWithEveryone: false,
  };
}

/** Lietotāja paša augi, un kopīgotos vispirms pārbauda admins */
@Component({
  selector: 'app-my-plants',
  imports: [FormsModule, RouterLink],
  templateUrl: './my-plants.html',
  styleUrls: ['../catalog.scss', './my-plants.scss'],
})
export class MyPlants {
  private readonly api = inject(CatalogApi);

  protected readonly categories = CATEGORIES;
  protected readonly sowingHint = sowingHint;
  protected readonly categoryLabels = CATEGORY_LABELS;
  /** Lauki, no kuriem lietotājs jau aizgājis */
  protected readonly touched = signal<ReadonlySet<string>>(new Set());
  protected readonly submitted = signal(false);
  protected readonly plants = signal<Plant[]>([]);
  protected readonly mine = computed(() => this.plants().filter((p) => p.mine));
  protected readonly builtInCount = computed(() => this.plants().length - this.mine().length);
  protected readonly isAdmin = signal(false);
  protected readonly listLoading = signal(true);
  protected readonly listError = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly saving = signal(false);
  /** null nozīmē jaunu augu */
  protected readonly editingId = signal<number | null>(null);
  protected draft: PlantInput = emptyDraft();

  constructor() {
    this.reload();
    this.api.isAdmin().subscribe({ next: (r) => this.isAdmin.set(r.admin), error: () => this.isAdmin.set(false) });
  }

  private reload(): void {
    this.listError.set(null);
    this.api.plants().subscribe({
      next: (p) => {
        this.plants.set(p);
        this.listLoading.set(false);
      },
      error: (e) => {
        this.listError.set(errorText(e));
        this.listLoading.set(false);
      },
    });
  }

  protected edit(plant: Plant): void {
    const { id, status, mine, reviewNote, ...fields } = plant;
    this.draft = { ...fields, shareWithEveryone: status === 'PENDING' };
    this.editingId.set(id);
    this.error.set(null);
    this.resetValidation();
  }

  protected errors(): FieldErrors {
    return validatePlant(this.draft);
  }

  protected errorCount(): number {
    return Object.keys(this.errors()).length;
  }

  /** Kļūdu rāda tikai pēc lauka atstāšanas vai saglabāšanas mēģinājuma */
  protected shown(f: FieldName): string | null {
    const msg = this.errors()[f];
    return msg && (this.submitted() || this.touched().has(f)) ? msg : null;
  }

  protected touch(f: string): void {
    if (!this.touched().has(f)) this.touched.set(new Set([...this.touched(), f]));
  }

  private resetValidation(): void {
    this.touched.set(new Set());
    this.submitted.set(false);
  }

  protected cancel(): void {
    this.resetValidation();
    this.draft = emptyDraft();
    this.editingId.set(null);
    this.error.set(null);
  }

  protected save(): void {
    this.submitted.set(true);
    const errs = this.errors();
    const first = FIELD_ORDER.find((f) => errs[f]);
    if (first) {
      setTimeout(() => document.getElementById('f-' + first)?.focus());
      return;
    }
    const input = this.normalized();
    const id = this.editingId();
    this.saving.set(true);
    this.error.set(null);
    (id === null ? this.api.create(input) : this.api.update(id, input)).subscribe({
      next: () => {
        this.saving.set(false);
        this.cancel();
        this.reload();
      },
      error: (e) => {
        this.saving.set(false);
        this.error.set(errorText(e));
      },
    });
  }

  protected remove(plant: Plant): void {
    if (!confirm(`Delete ${plant.nameEn}?`)) return;
    this.listError.set(null);
    this.api.delete(plant.id).subscribe({ next: () => this.reload(), error: (e) => this.listError.set(errorText(e)) });
  }

  /** Tukšus laukus pārvērš par null, dēstu logu sūta tikai TRANSPLANT augiem */
  private normalized(): PlantInput {
    const d: Record<string, unknown> = { ...this.draft };
    for (const [k, v] of Object.entries(d)) if (v === '' || v === undefined) d[k] = null;
    const input = d as unknown as PlantInput;
    if (input.sowMethod !== 'TRANSPLANT') {
      input.indoorSowFrom = null;
      input.indoorSowTo = null;
    }
    return input;
  }
}
