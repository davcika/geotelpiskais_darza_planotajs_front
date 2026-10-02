import { AppIcon } from '../ui/icon/icon';
import { Component, computed, input, output, signal } from '@angular/core';
import { familyColor, Plant, PlantCategory } from './plant';
import { plantIconUrl } from '../ui/icons';

const CATEGORIES: PlantCategory[] = ['VEGETABLE', 'HERB', 'FLOWER', 'BULB', 'SHRUB', 'TREE', 'HEDGE'];
const label = (c: string) => c.charAt(0) + c.slice(1).toLowerCase();

/** Kopīga augu izvēle visai lietotnei, un dobes lapā augu var arī vilkt */
@Component({
  selector: 'app-plant-picker',
  imports: [AppIcon],
  template: `
    <input class="field" type="search" placeholder="Search plants" aria-label="Search plants"
      [value]="search()" (input)="search.set(searchInput.value)" #searchInput />
    <div class="chips" role="group" aria-label="Category">
      <button type="button" class="chip" [attr.aria-pressed]="category() === ''" (click)="category.set('')">All</button>
      @for (c of categories; track c) {
        <button type="button" class="chip" [attr.aria-pressed]="category() === c" (click)="category.set(category() === c ? '' : c)">{{ label(c) }}</button>
      }
    </div>
    <ul class="list" [style.max-height]="maxHeight()">
      @for (p of matches(); track p.id) {
        <li>
          <button type="button" class="plant" [class.draggable]="draggable()"
            (pointerdown)="pressed.emit({ plant: p, event: $event })" (click)="picked.emit(p)"
            [attr.aria-label]="actionLabel() + ' ' + p.nameEn">
            @if (p.icon || hasIcon(p)) {
              <app-icon class="icon" [plant]="p.nameEn" [emoji]="p.icon" [size]="20" />
            } @else {
              <span class="dot" aria-hidden="true" [style.background]="familyColor(p)"></span>
            }
            <span>{{ p.nameEn }} <small>{{ p.nameLv }}</small></span>
          </button>
        </li>
      } @empty {
        @if (loading()) {
          <li class="muted" role="status">Loading plants…</li>
        } @else if (error(); as message) {
          <li class="muted" role="alert">{{ message }} <button type="button" class="link" (click)="retry.emit()">Retry</button></li>
        } @else {
          <li class="muted">No plants found</li>
        }
      }
    </ul>
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 0.4rem; min-width: 0; }
    .chips { display: flex; flex-wrap: wrap; gap: 4px; }
    .chip { min-height: 28px; padding: 2px 10px; border: 1px solid var(--color-border, #d5d9d2); border-radius: 99px;
      background: var(--color-surface, #fff); font: inherit; font-size: 0.8rem; cursor: pointer; }
    .chip[aria-pressed='true'] { background: #2d6a3d; border-color: #2d6a3d; color: #fff; }
    .chip:focus-visible, .plant:focus-visible { outline: 2px solid #2d6a3d; outline-offset: 1px; }
    .list { list-style: none; margin: 0; padding: 0; overflow-y: auto; }
    .plant { display: flex; align-items: center; gap: 0.4rem; width: 100%; min-height: 36px; padding: 0.3rem 0.4rem;
      border: 0; border-radius: 6px; background: none; text-align: left; font: inherit; cursor: pointer; }
    .plant.draggable { cursor: grab; touch-action: pan-y; user-select: none; }
    .plant:hover { background: rgba(61, 138, 75, 0.12); }
    .plant small { color: #6b6b6b; }
    .icon { font-size: 1.2rem; width: 1.4rem; text-align: center; }
    .dot { width: 0.8rem; height: 0.8rem; border-radius: 50%; margin: 0 0.3rem; flex: none; }
    .link { border: 0; background: none; padding: 0; font: inherit; color: inherit; text-decoration: underline; cursor: pointer; }
    .muted { color: #6b6b6b; font-size: 0.85rem; }
  `,
})
export class PlantPicker {
  readonly plants = input.required<Plant[]>();
  /** Dobes lapā augus var vilkt */
  readonly draggable = input(false);
  readonly actionLabel = input('Add');
  readonly maxHeight = input('16rem');
  /** Katalogs vēl lādējas vai neizdevās */
  readonly loading = input(false);
  readonly error = input<string | null>(null);
  readonly picked = output<Plant>();
  readonly retry = output<void>();
  readonly pressed = output<{ plant: Plant; event: PointerEvent }>();

  protected readonly categories = CATEGORIES;
  protected readonly label = label;
  protected readonly familyColor = familyColor;
  protected hasIcon(p: Plant): boolean { return !!plantIconUrl(p.nameEn); }
  protected readonly search = signal('');
  protected readonly category = signal<PlantCategory | ''>('');

  protected readonly matches = computed(() => {
    const query = this.search().trim().toLowerCase();
    const category = this.category();
    return this.plants()
      .filter((p) => !category || p.category === category)
      .filter((p) => !query || p.nameEn.toLowerCase().includes(query) || p.nameLv.toLowerCase().includes(query));
  });
}
