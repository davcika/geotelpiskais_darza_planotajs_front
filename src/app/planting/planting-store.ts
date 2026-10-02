import { HttpClient } from '@angular/common/http';
import { computed, effect, inject, Injectable, OnDestroy, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { problemDetail } from '../shared/format';
import { UNDO_MS } from '../task/task-undo';
import { Block, blockFit, blockInFrame, plantingAreaM2 } from './bed-blocks';
import type { BedFrame } from './bed-frame';
import { Cell, cellKey } from './bed-grid';
import { blockFields } from './bed-geometry';
import { defaultSowDate, Plant } from './plant';

/** Stādījums no backend, sownOn ir ISO datums */
export interface Planting {
  id: number;
  objectId: number;
  plantId: number;
  sownOn: string;
  variety: string | null;
  note: string | null;
  /** Aizņemtās šūnas, tukšs nozīmē vieta nav norādīta */
  cells: Cell[];
  /** Bloks metros dobes rāmī, ja tāds ir */
  blockX?: number | null;
  blockY?: number | null;
  blockW?: number | null;
  blockH?: number | null;
  /** Leņķis, kurā bloks saglabāts, null veciem blokiem nozīmē nulli */
  blockAngle?: number | null;
    plantCount?: number | null;
}

export type PlantingInput = Omit<Planting, 'id' | 'objectId'>;

export function toInput(p: Planting): PlantingInput {
  const { plantId, sownOn, variety, note, cells, blockX, blockY, blockW, blockH, blockAngle, plantCount } = p;
  return { plantId, sownOn, variety, note, cells, blockX, blockY, blockW, blockH, blockAngle, plantCount };
}

/** Ar dobes rāmi bloku pārrēķina tā leņķī, bez rāmja atdod kā saglabāts */
export function blockOf(p: Planting, frame?: BedFrame): Block | null {
  if (p.blockX == null || p.blockY == null || p.blockW == null || p.blockH == null) return null;
  const block = { x: p.blockX, y: p.blockY, w: p.blockW, h: p.blockH };
  return frame ? blockInFrame(block, p.blockAngle, frame) : block;
}

/** Katalogs un visa dārza sezonas stādījumi vienā pieprasījumā, lai karte rāda visas dobes */
@Injectable()
export class PlantingStore implements OnDestroy {
  private readonly http = inject(HttpClient);

  readonly plants = signal<Plant[]>([]);
  /** Kataloga stāvoklis, lai saraksts par agru nesaka, ka augu nav */
  readonly plantsLoading = signal(true);
  readonly plantsError = signal<string | null>(null);
  readonly plantById = computed(() => new Map(this.plants().map((plant) => [plant.id, plant])));
  readonly year = signal(new Date().getFullYear());
  readonly plantings = signal<Planting[]>([]);
  readonly error = signal<string | null>(null);
  private readonly gardenId = signal<number | null>(null);
  private loading?: Subscription;
  /** Pēc neveiksmīgas saglabāšanas pārlādē no servera, lai bloki atgriežas vietā */
  private readonly reloads = signal(0);
  /** Stādījums, ko tagad krāso, un tā melnraksts */
  readonly painting = signal<{ plantingId: number; cells: Map<string, Cell> } | null>(null);
  /** Dzēsts stādījums, ko vēl var atsaukt, serverī dzēš tikai pēc UNDO_MS */
  readonly pendingRemoval = signal<{ planting: Planting; label: string } | null>(null);
  private removalTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    this.loadPlants();
    // Veco pieprasījumu atceļ, lai vecas sezonas atbilde nepārraksta jauno
    effect(() => {
      const gardenId = this.gardenId();
      const year = this.year();
      this.reloads();
      if (gardenId === null) return;
      this.loading?.unsubscribe();
      this.loading = this.http.get<Planting[]>(`/api/gardens/${gardenId}/plantings`, { params: { year } }).subscribe({
        next: (plantings) => this.plantings.set(plantings.filter((p) => p.id !== this.pendingRemoval()?.planting.id)),
        error: (error) => this.fail('load plantings', error),
      });
    });
  }

  /** Ielādē katalogu, arī atkārtojot pēc kļūdas */
  loadPlants(): void {
    this.plantsLoading.set(true);
    this.plantsError.set(null);
    this.http.get<Plant[]>('/api/plants').subscribe({
      next: (plants) => {
        this.plants.set(plants);
        this.plantsLoading.set(false);
      },
      error: (error) => {
        this.plantsLoading.set(false);
        this.plantsError.set(problemDetail(error, 'Could not load plants. Try again.'));
      },
    });
  }

  /** Krāsojamam stādījumam rāda melnrakstu, citiem saglabāto */
  cellsOf(planting: Planting): Cell[] {
    const painting = this.painting();
    return painting?.plantingId === planting.id ? [...painting.cells.values()] : planting.cells;
  }

  /** Vai dobei sezonā ir krāsotas šūnas, skaitot arī melnrakstu */
  hasCells(objectId: number, painted = false): boolean {
    // Bloki arī ir piesaistīti dobes rāmim, tāpēc bloķē formas maiņu tāpat kā šūnas
    return this.forObject(objectId).some((p) => (painted ? this.cellsOf(p) : p.cells).length > 0 || blockOf(p) !== null);
  }

  /** Šūnas, ko sezonā aizņem citi stādījumi */
  takenCells(objectId: number, exceptPlantingId: number): Set<string> {
    return new Set(
      this.forObject(objectId)
        .filter((p) => p.id !== exceptPlantingId)
        .flatMap((p) => p.cells.map(cellKey)),
    );
  }

  startPaint(planting: Planting): void {
    this.painting.set({ plantingId: planting.id, cells: new Map(planting.cells.map((cell) => [cellKey(cell), cell])) });
  }

  paintCell(cell: Cell, add: boolean): void {
    this.painting.update((painting) => {
      if (!painting) return painting;
      const cells = new Map(painting.cells);
      if (add) cells.set(cellKey(cell), cell);
      else cells.delete(cellKey(cell));
      return { ...painting, cells };
    });
  }

  finishPaint(): void {
    const painting = this.painting();
    const planting = this.plantings().find((p) => p.id === painting?.plantingId);
    this.painting.set(null);
    if (painting && planting) this.update(planting.id, { ...toInput(planting), cells: [...painting.cells.values()] });
  }

  /** Dobē sezonā aizņemtā vieta m² */
  usedArea(objectId: number, cellAreaM2 = 0): number {
    const plantById = this.plantById();
    return this.forObject(objectId).reduce((sum, p) => sum + plantingAreaM2(p, plantById.get(p.plantId), cellAreaM2), 0);
  }

  setGarden(gardenId: number): void {
    this.gardenId.set(gardenId);
  }

  forObject(objectId: number): Planting[] {
    return this.plantings().filter((planting) => planting.objectId === objectId);
  }

  add(objectId: number, input: PlantingInput): void {
    this.http.post<Planting>(`/api/objects/${objectId}/plantings`, input).subscribe({
      next: (planting) => this.keepIfThisYear(planting),
      error: (error) => this.fail('save the planting', error),
    });
  }

  /** Jauns bloks ar sezonas sēšanas datumu un augu katrā šūnā */
  addBlock(objectId: number, plant: Plant, block: Block, angleDeg: number): void {
    this.add(objectId, {
      plantId: plant.id,
      sownOn: defaultSowDate(plant, this.year()),
      variety: null,
      note: null,
      cells: [],
      ...blockFields(block, angleDeg),
      plantCount: blockFit(plant, block).total,
    });
  }

  update(id: number, input: PlantingInput): void {
    this.http.put<Planting>(`/api/plantings/${id}`, input).subscribe({
      next: (planting) => {
        this.plantings.update((list) => list.filter((p) => p.id !== id));
        this.keepIfThisYear(planting);
      },
      error: (error) => {
        this.fail('save the planting', error);
        this.reloads.update((n) => n + 1);
      },
    });
  }

  /** Uzreiz maina sarakstu, tad saglabā, un kļūdas gadījumā pārlādē */
  patch(id: number, input: PlantingInput): void {
    this.plantings.update((list) => list.map((p) => (p.id === id ? { ...p, ...input } : p)));
    this.update(id, input);
  }

  /** Stādījums pazūd uzreiz, bet serverī to dzēš pēc 5 sekundēm vai nākamās dzēšanas, tāpēc to var atsaukt */
  removeWithUndo(id: number, label: string): void {
    const planting = this.plantings().find((p) => p.id === id);
    if (!planting) return;
    this.flushRemoval();
    this.plantings.update((list) => list.filter((p) => p.id !== id));
    this.pendingRemoval.set({ planting, label });
    this.removalTimer = setTimeout(() => this.flushRemoval(), UNDO_MS);
  }

  undoRemove(): void {
    const pending = this.pendingRemoval();
    clearTimeout(this.removalTimer);
    this.pendingRemoval.set(null);
    if (!pending || !pending.planting.sownOn.startsWith(`${this.year()}-`)) return;
    this.plantings.update((list) => [...list, pending.planting].sort((a, b) => a.sownOn.localeCompare(b.sownOn)));
  }

    flushRemoval(): void {
    const pending = this.pendingRemoval();
    clearTimeout(this.removalTimer);
    this.pendingRemoval.set(null);
    if (pending) this.remove(pending.planting.id);
  }

  ngOnDestroy(): void {
    this.flushRemoval();
  }

  remove(id: number): void {
    this.http.delete(`/api/plantings/${id}`).subscribe({
      next: () => this.plantings.update((list) => list.filter((p) => p.id !== id)),
      error: (error) => {
        this.fail('delete the planting', error);
        this.reloads.update((n) => n + 1);
      },
    });
  }

  /** Backend stādījumus dzēš pats, šeit tos tikai aizmirst */
  forgetObject(objectId: number): void {
    this.plantings.update((list) => list.filter((p) => p.objectId !== objectId));
  }

  /** Ar citas sezonas datumu stādījums pazūd no saraksta, jo tas ir citā gadā */
  private keepIfThisYear(planting: Planting): void {
    this.error.set(null);
    if (planting.sownOn.startsWith(`${this.year()}-`)) {
      this.plantings.update((list) => [...list, planting].sort((a, b) => a.sownOn.localeCompare(b.sownOn)));
    }
  }

  private fail(action: string, error: unknown): void {
    console.error(error);
    this.error.set(problemDetail(error, `Could not ${action}. Try again.`));
  }
}
