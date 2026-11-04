import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { AppIcon } from '../ui/icon/icon';

/** Mazs čips ar elementu, kas ietekmē stādījumu */
@Component({
  selector: 'app-item-badge',
  imports: [AppIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="badge" [attr.title]="'Affected by ' + name()"><app-icon [item]="typeKey()" [emoji]="icon()" [size]="14" /> {{ name() }}</span>`,
  styles: `.badge { display: inline-flex; gap: 4px; align-items: center; padding: 1px 8px; border-radius: 999px;
    font-size: 12px; background: #e8f1fb; color: #1d4f7a; border: 1px solid #b9d3ec; white-space: nowrap; }`,
})
export class ItemBadge {
  readonly icon = input.required<string>();
  readonly name = input.required<string>();
  readonly typeKey = input<string | null | undefined>(null);
}
