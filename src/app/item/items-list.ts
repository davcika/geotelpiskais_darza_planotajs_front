import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { AppIcon } from '../ui/icon/icon';
import { GardenItem, ItemType } from './item-api';
import { summarize } from './item-effects';

/** Dārza elementu tabula ar skaitu vai kopgarumu */
@Component({
  selector: 'app-items-list',
  imports: [AppIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (rows().length) {
      <table>
        <thead><tr><th scope="col"><span class="sr-only">Icon</span></th><th scope="col">Item</th><th scope="col">Amount</th></tr></thead>
        <tbody>
          @for (r of rows(); track r.type.key) {
            <tr>
              <td class="icon"><app-icon [item]="r.type.key" [emoji]="r.type.icon" [size]="22" /></td>
              <td>{{ r.type.nameEn }}</td>
              <td class="num">{{ r.totalLengthM !== null ? r.totalLengthM + ' m' : r.count }}</td>
            </tr>
          }
        </tbody>
      </table>
    } @else {
      <p class="empty">No items placed yet.</p>
    }
  `,
  styles: `
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { padding: 4px 6px; border-bottom: 1px solid #eee; text-align: left; }
    .icon { font-size: 20px; width: 28px; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .empty { color: #777; }
  `,
})
export class ItemsList {
  readonly types = input.required<ItemType[]>();
  readonly items = input.required<GardenItem[]>();
  readonly rows = computed(() => summarize(this.types(), this.items()));
}
