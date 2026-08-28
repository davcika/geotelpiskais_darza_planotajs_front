import { Component, computed, input, output, signal } from '@angular/core';
import { AppIcon } from '../../ui/icon/icon';
import type { Plant } from '../../planting/plant';

let nextId = 0;
const ICONS: Record<string, string> = { TREE: '🌳', SHRUB: '🌿', HEDGE: '🌲' };

/** Koku meklētājs, kas ar tastatūru strādā tāpat kā adreses meklēšana */
@Component({
  selector: 'app-tree-picker',
  styleUrl: './tree-picker.scss',
  imports: [AppIcon],
  template: `
    <label [for]="inputId">Plant</label>
    <div class="box">
      <input
        #search
        class="field"
        [id]="inputId"
        role="combobox"
        aria-autocomplete="list"
        autocomplete="off"
        [attr.aria-expanded]="open()"
        [attr.aria-controls]="listId"
        [attr.aria-activedescendant]="open() && active() >= 0 ? listId + '-' + active() : null"
        placeholder="Search trees, shrubs, hedges…"
        [value]="open() ? query() : selectedLabel()"
        (focus)="openList()"
        (input)="query.set(search.value); active.set(0); open.set(true)"
        (keydown)="onKey($event)"
        (blur)="open.set(false)"
      />
      @if (open()) {
        <ul class="list" role="listbox" [id]="listId" aria-label="Plants">
          @for (option of options(); track option.id; let i = $index) {
            <li
              role="option"
              [id]="listId + '-' + i"
              [class.active]="i === active()"
              [attr.aria-selected]="option.id === (selectedId() ?? 0)"
              (mousedown)="$event.preventDefault(); pick(option.id)"
            >
              <app-icon [plant]="option.name" [emoji]="option.icon" [size]="18" /> {{ option.label }}
            </li>
          } @empty {
            <li class="empty" role="option" aria-disabled="true">No match</li>
          }
        </ul>
      }
    </div>
  `,
})
export class TreePicker {
  readonly plants = input.required<Plant[]>();
  readonly selectedId = input<number | null>(null);
  /** Nulle nozīmē koku bez kataloga auga */
  readonly picked = output<number>();

  protected readonly inputId = `tree-picker-${nextId}`;
  protected readonly listId = `tree-picker-list-${nextId++}`;
  protected readonly open = signal(false);
  protected readonly query = signal('');
  protected readonly active = signal(0);

  protected readonly selectedLabel = computed(() => this.plants().find((p) => p.id === this.selectedId())?.nameEn ?? 'Not from catalog');
  protected readonly options = computed(() => {
    const q = this.query().trim().toLowerCase();
    const list = this.plants()
      .filter((p) => !q || p.nameEn.toLowerCase().includes(q) || p.category.toLowerCase().includes(q))
      .map((p) => ({ id: p.id, name: p.nameEn as string | null, icon: p.icon || ICONS[p.category] || '🌳', label: `${p.nameEn} (${p.category.toLowerCase()})` }));
    return q ? list : [{ id: 0, name: null, icon: '○', label: 'Not from catalog' }, ...list];
  });

  protected openList(): void {
    this.query.set('');
    this.active.set(Math.max(0, this.options().findIndex((o) => o.id === (this.selectedId() ?? 0))));
    this.open.set(true);
  }

  protected onKey(event: KeyboardEvent): void {
    const count = this.options().length;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!this.open()) return this.openList();
      if (count) this.active.update((i) => (i + (event.key === 'ArrowDown' ? 1 : -1) + count) % count);
    } else if (event.key === 'Enter' && this.open()) {
      event.preventDefault();
      const option = this.options()[this.active()];
      if (option) this.pick(option.id);
    } else if (event.key === 'Escape' && this.open()) {
      event.stopPropagation();
      this.open.set(false);
    }
  }

  protected pick(id: number): void {
    this.open.set(false);
    this.picked.emit(id);
  }
}
