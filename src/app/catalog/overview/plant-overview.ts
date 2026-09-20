import { AppIcon } from '../../ui/icon/icon';
import { HttpClient } from '@angular/common/http';
import { Component, computed, effect, ElementRef, HostListener, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { GardenStore } from '../../garden/garden-store';
import { formatDate, Plant, PlantCategory, sowingHint } from '../../planting/plant';
import { CatalogApi } from '../catalog-api';
import { errorText, MONTHS } from '../../shared/format';
import { readStored, writeStored } from '../../shared/storage';
import { focusables, trapTab } from '../../ui/focus-trap';
import { formatCm, formatSpacingPair, TimelineBar, timelineBars } from '../timeline';
import { countPlants, ObjectLite, PlantingLite } from './garden-count';
import { affectedLabel, ItemEffects } from '../../item/item-api';
import { effectPlant } from '../../item/item-view';

const CATEGORY_LABEL: Record<PlantCategory, string> = {
  VEGETABLE: 'Vegetables', HERB: 'Herbs', FLOWER: 'Flowers', BULB: 'Bulbs', SHRUB: 'Shrubs', TREE: 'Trees', HEDGE: 'Hedges',
};
const FAV_KEY = 'plant-favourites';

interface Row {
  /** Unikāla atslēga no auga un elementiem, kas to ietekmē */
  key: string;
  /** Piedēklis rindai ar stādījumiem zem dārza elementa, piemēram lecekta */
  suffix: string;
  plant: Plant;
  bars: TimelineBar[];
  count: number | null;
}

function loadFavs(): Set<number> {
  try {
    return new Set(JSON.parse(readStored(FAV_KEY) ?? '[]') as number[]);
  } catch {
    return new Set();
  }
}

/** Augu pārskats ar atstatumiem un sējas un ražas laiku pa mēnešiem */
@Component({
  selector: 'app-plant-overview',
  imports: [AppIcon, FormsModule, RouterLink],
  templateUrl: './plant-overview.html',
  styleUrl: './plant-overview.scss',
})
export class PlantOverview {
  private readonly api = inject(CatalogApi);
  private readonly http = inject(HttpClient);
  private readonly gardens = inject(GardenStore);

  protected readonly months = MONTHS;
  protected readonly categories = Object.keys(CATEGORY_LABEL) as PlantCategory[];
  protected readonly categoryLabel = CATEGORY_LABEL;
  protected readonly formatCm = formatCm;
  protected readonly formatSpacingPair = formatSpacingPair;
  protected readonly formatDate = formatDate;
  protected readonly sowingHint = sowingHint;
  protected readonly lightLabel = { SUN: 'Full sun', PART: 'Part shade', SHADE: 'Shade' } as const;

  protected readonly view = signal<'all' | 'garden'>('all');
  protected readonly search = signal('');
  protected readonly category = signal<PlantCategory | null>(null);
  protected readonly sort = signal<{ key: 'name' | 'category' | 'count'; dir: 1 | -1 }>({ key: 'name', dir: 1 });
  protected readonly favourites = signal(loadFavs());
  protected readonly favouritesOnly = signal(false);
  protected readonly selected = signal<Plant | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly loading = signal(true);

  protected readonly plants = signal<Plant[]>([]);
  private readonly gardenCounts = signal<Map<number, number> | null>(null);
  /** Parasto stādījumu skaits un atsevišķās rindas tiem, ko ietekmē dārza elementi */
  private readonly plainCounts = signal<Map<number, number>>(new Map());
  private readonly affectedRows = signal<Row[]>([]);
  private readonly gardenId = signal<number | null>(null);

  constructor() {
    this.api.plants().subscribe({
      next: (plants) => {
        this.plants.set(plants);
        this.loading.set(false);
      },
      error: (e) => {
        this.error.set(errorText(e));
        this.loading.set(false);
      },
    });
    // Ja dārzs vēl nav izvēlēts, ņem pirmo
    effect(() => {
      const id = this.gardens.currentGardenId();
      if (id !== null) this.gardenId.set(id);
      else this.gardens.fetch().subscribe({ next: (g) => this.gardenId.set(g?.id ?? null), error: () => undefined });
    });
    effect((onCleanup) => {
      const id = this.gardenId();
      const plants = this.plants();
      if (id === null || !plants.length) return;
      const byId = new Map(plants.map((p) => [p.id, p]));
      const year = new Date().getFullYear();
      const sub = forkJoin({
        plantings: this.api.gardenPlantings<PlantingLite>(id, year).pipe(catchError(() => of([]))),
        objects: this.http.get<ObjectLite[]>(`/api/gardens/${id}/objects`).pipe(catchError(() => of([]))),
        effects: this.http
          .get<ItemEffects>(`/api/gardens/${id}/items/effects`, { params: { year } })
          .pipe(catchError(() => of({} as ItemEffects))),
      })
        .pipe(map(({ plantings, objects, effects }) => this.splitByEffects(plantings, objects, effects, byId)))
        .subscribe(({ total, plain, affected }) => {
          this.plainCounts.set(plain);
          this.affectedRows.set(affected);
          this.gardenCounts.set(total);
        });
      onCleanup(() => sub.unsubscribe());
    });
  }

  /** Stādījumi siltumnīcā vai lecektā dabū savu rindu, jo to laiki ir nobīdīti */
  private splitByEffects(plantings: PlantingLite[], objects: ObjectLite[], effects: ItemEffects, byId: Map<number, Plant>) {
    const total = countPlants(plantings, objects, byId);
    const isAffected = (p: PlantingLite) => p.id !== undefined && affectedLabel(effects[String(p.id)]) !== '';
    const plain = countPlants(plantings.filter((p) => !isAffected(p)), objects, byId);
    const groups = new Map<string, { plant: Plant; suffix: string; list: PlantingLite[]; effect: ItemEffects[string] }>();
    for (const p of plantings.filter(isAffected)) {
      const plant = byId.get(p.plantId);
      const effect = effects[String(p.id)];
      if (!plant) continue;
      const suffix = affectedLabel(effect);
      const key = `${p.plantId}|${suffix}`;
      const g = groups.get(key) ?? { plant, suffix, list: [], effect };
      g.list.push(p);
      groups.set(key, g);
    }
    const beds = objects.filter((o) => o.type !== 'TREE');
    const affected: Row[] = [...groups.entries()].map(([key, g]) => ({
      key,
      suffix: g.suffix,
      plant: g.plant,
      bars: timelineBars(effectPlant(g.plant, g.effect)),
      count: countPlants(g.list, beds, byId).get(g.plant.id) ?? g.list.length,
    }));
    return { total, plain, affected };
  }

  protected readonly rows = computed<Row[]>(() => {
    const q = this.search().trim().toLowerCase();
    const cat = this.category();
    const counts = this.gardenCounts();
    const garden = this.view() === 'garden';
    const favs = this.favourites();
    const { key, dir } = this.sort();
    const plain = this.plainCounts();
    const keep = (p: Plant) =>
      (!cat || p.category === cat) &&
      (!q || p.nameEn.toLowerCase().includes(q) || p.nameLv.toLowerCase().includes(q)) &&
      (!this.favouritesOnly() || favs.has(p.id));
    const base: Row[] = this.plants()
      .filter(keep)
      .filter((p) => !garden || (plain.get(p.id) ?? 0) > 0)
      .map((plant) => ({
        key: String(plant.id),
        suffix: '',
        plant,
        bars: timelineBars(plant),
        count: (garden ? plain.get(plant.id) : counts?.get(plant.id)) ?? null,
      }));
    const extra = garden ? this.affectedRows().filter((r) => keep(r.plant)) : [];
    return [...base, ...extra]
      .sort((a, b) => {
        const byName = a.plant.nameEn.localeCompare(b.plant.nameEn) || a.suffix.localeCompare(b.suffix);
        if (key === 'category') return (a.plant.category.localeCompare(b.plant.category) || byName) * dir;
        if (key === 'count') return ((a.count ?? 0) - (b.count ?? 0) || byName) * dir;
        return byName * dir;
      });
  });

  private readonly closeBtn = viewChild<ElementRef<HTMLButtonElement>>('closeBtn');
  private readonly modal = viewChild<ElementRef<HTMLElement>>('modal');
  private lastFocus: HTMLElement | null = null;
  private readonly focusOnOpen = effect(() => this.closeBtn()?.nativeElement.focus());

  protected open(p: Plant, ev: Event): void {
    this.lastFocus = ev.currentTarget as HTMLElement;
    this.selected.set(p);
  }

  protected close(): void {
    if (!this.selected()) return;
    this.selected.set(null);
    this.lastFocus?.focus();
    this.lastFocus = null;
  }

  @HostListener('document:keydown.escape')
  protected onEsc(): void {
    this.close();
  }

  /** Tab nelaiž fokusu ārā no modālā loga */
  protected trapFocus(ev: KeyboardEvent): void {
    if (ev.key !== 'Tab') return;
    const root = this.modal()?.nativeElement;
    if (!root) return;
    trapTab(ev, root, focusables(root, 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'));
  }

  protected readonly gardenLoaded = computed(() => this.gardenCounts() !== null);

  protected setSort(key: 'name' | 'category' | 'count'): void {
    this.sort.update((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }));
  }

  protected sortMark(key: string): string {
    const s = this.sort();
    return s.key === key ? (s.dir === 1 ? '▲' : '▼') : '';
  }

  protected toggleFav(id: number): void {
    const next = new Set(this.favourites());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.favourites.set(next);
    // Piemēram privātajā režīmā izlase paliek tikai atmiņā
    writeStored(FAV_KEY, JSON.stringify([...next]));
  }

  protected notes(p: Plant): string {
    const parts: string[] = [];
    if (p.frostSensitive) parts.push('Frost sensitive');
    if (p.perennial) parts.push('Perennial');
    if (p.light) parts.push(this.lightLabel[p.light]);
    return parts.join(' · ');
  }

  protected range(from: string | null, to: string | null): string {
    return from && to ? `${formatDate(from)} – ${formatDate(to)}` : '—';
  }

  protected pct(n: number): string {
    return `${(n * 100).toFixed(2)}%`;
  }
}
