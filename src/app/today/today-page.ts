import { AppIcon } from '../ui/icon/icon';
import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { catchError, of, switchMap } from 'rxjs';
import { CatalogApi } from '../catalog/catalog-api';
import { GardenStore } from '../garden/garden-store';
import { formatMonthDay } from '../shared/format';
import type { Plant } from '../planting/plant';
import { dueText, todayRiga } from '../task/garden-tasks';
import { GardenTask, TaskStore } from '../task/task-store';
import { doneLabel } from '../task/task-undo';
import { daysUntil, sowThisWeek } from './sow-this-week';

const dayCount = (n: number) => `${n} day${n === 1 ? '' : 's'}`;

interface PlantingRef {
  plantId: number;
}

/** Telefonam domāts skats ar šodienas darbiem, sēju šonedēļ un salnām */
@Component({
  selector: 'app-today-page',
  imports: [AppIcon, RouterLink],
  templateUrl: './today-page.html',
  styleUrl: './today-page.scss',
})
export class TodayPage {
  protected readonly store = inject(TaskStore);
  private readonly gardens = inject(GardenStore);
  private readonly catalog = inject(CatalogApi);

  private readonly today = todayRiga();
  private readonly mmdd = this.today.slice(5);
  private readonly plants = signal<Plant[]>([]);
  private readonly usedIds = signal<ReadonlySet<number>>(new Set());
  protected readonly plantsLoaded = signal(false);
  protected readonly plantsError = signal<string | null>(null);
  private plantsSeq = 0;

  protected readonly garden = this.gardens.current;
  protected readonly tasks = this.store.actionable;
  protected readonly sow = computed(() => sowThisWeek(this.plants(), this.mmdd, this.usedIds(), this.garden()?.frost ?? null));

  /** Piezīme par pēdējo salnu, kamēr tā vēl nav pienākusi */
  protected readonly frostNote = computed(() => {
    const last = this.garden()?.frost?.lastFrost;
    if (!last) return null;
    const days = daysUntil(last, this.mmdd);
    if (days < 0) return null;
    return days === 0
      ? `Last frost ≈ ${formatMonthDay(last)} — that’s today. Keep fleece handy.`
      : `Last frost ≈ ${formatMonthDay(last)} — ${dayCount(days)} to go. Keep tender plants indoors.`;
  });
  protected readonly firstFrostNote = computed(() => {
    const first = this.garden()?.frost?.firstFrost;
    if (!first) return null;
    const days = daysUntil(first, this.mmdd);
    if (days < 0 || days > 21) return null;
    const when = days === 0 ? 'today' : `in ${dayCount(days)}`;
    return `First autumn frost ≈ ${formatMonthDay(first)} — ${when}. Harvest tender crops.`;
  });

  protected readonly heading = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  constructor() {
    effect(() => {
      this.gardens.currentGardenId();
      untracked(() => {
        this.store.load();
        this.loadPlants();
      });
    });
  }

  protected doneLabel(task: GardenTask): string {
    return doneLabel(task.title);
  }

  protected dueText(task: GardenTask): string | null {
    return dueText(task);
  }

  protected until(mmdd: string): string {
    return formatMonthDay(mmdd, '—');
  }

  protected retryPlants(): void {
    this.loadPlants();
  }

  protected retryTasks(): void {
    this.store.load();
  }

  private loadPlants(): void {
    const year = Number(this.today.slice(0, 4));
    const seq = ++this.plantsSeq;
    this.plantsLoaded.set(false);
    this.plantsError.set(null);
    this.catalog.plants().subscribe({
      next: (plants) => {
        if (seq !== this.plantsSeq) return;
        this.plants.set(plants);
        this.plantsLoaded.set(true);
      },
      error: () => {
        if (seq !== this.plantsSeq) return;
        this.plants.set([]);
        this.plantsError.set('Could not load plants.');
        this.plantsLoaded.set(true);
      },
    });
    this.gardens
      .fetch()
      .pipe(
        switchMap((g) => this.catalog.gardenPlantings<PlantingRef>(g.id, year)),
        // Bez atzīmes, kas jau aug dārzā, saraksts joprojām der
        catchError(() => of([] as PlantingRef[])),
      )
      .subscribe((list) => {
        if (seq === this.plantsSeq) this.usedIds.set(new Set(list.map((p) => p.plantId)));
      });
  }
}
