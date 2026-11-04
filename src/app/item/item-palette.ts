import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { AppIcon } from '../ui/icon/icon';
import { CATEGORY_LABEL, ITEM_DND_MIME, ItemCategory, ItemType } from './item-api';

/** Elementu palete, ko var vilkt uz karti vai izvēlēties ar klikšķi vai tastatūru */
@Component({
  selector: 'app-item-palette',
  imports: [AppIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (group of groups(); track group.category) {
      <h4>{{ group.label }}</h4>
      <div class="grid" role="listbox" [attr.aria-label]="group.label">
        @for (t of group.types; track t.key) {
          <button type="button" class="tile" draggable="true" role="option"
                  [attr.aria-selected]="t.key === selected()" [class.selected]="t.key === selected()"
                  [attr.title]="hint(t)" (dragstart)="onDragStart($event, t)" (click)="picked.emit(t)">
            <app-icon class="icon" [item]="t.key" [emoji]="t.icon" [size]="24" />
            <span class="name">{{ t.nameEn }}</span>
          </button>
        }
      </div>
    }
  `,
  styles: `
    h4 { margin: 8px 0 4px; font-size: 12px; text-transform: uppercase; color: #666; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(84px, 1fr)); gap: 6px; }
    .tile { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 6px 4px;
      border: 1px solid #ddd; border-radius: 6px; background: #fff; cursor: grab; font-size: 12px; }
    .tile.selected, .tile:focus-visible { border-color: #2e7d32; outline: 2px solid #2e7d32; }
    .icon { font-size: 22px; }
  `,
})
export class ItemPalette {
  readonly types = input.required<ItemType[]>();
  readonly selected = input<string | null>(null);
  readonly picked = output<ItemType>();

  readonly groups = computed(() => {
    const order = Object.keys(CATEGORY_LABEL) as ItemCategory[];
    return order
      .map((category) => ({ category, label: CATEGORY_LABEL[category], types: this.types().filter((t) => t.category === category) }))
      .filter((g) => g.types.length > 0);
  });

  onDragStart(event: DragEvent, type: ItemType): void {
    event.dataTransfer?.setData(ITEM_DND_MIME, type.key);
    event.dataTransfer?.setData('text/plain', type.nameEn);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
  }

  hint(t: ItemType): string {
    const parts = [t.nameEn];
    if (t.startShiftDays) parts.push(`sow/plant ${t.startShiftDays} d earlier`);
    if (t.endShiftDays) parts.push(`${t.endShiftDays} d later`);
    if (t.frostProtectionC) parts.push(`+${t.frostProtectionC} °C frost protection`);
    if (t.climbingSupport) parts.push('climbing support');
    return parts.join(' · ');
  }
}
