import { Component, computed, input } from '@angular/core';
import { GARDEN_ICONS, GardenIcon } from './garden-store';

/** Krāsains aplis ar dārza ikonu */
@Component({
  selector: 'app-garden-badge',
  template: `<span class="badge" aria-hidden="true" [style.background]="color()" [style.width.px]="size()" [style.height.px]="size()">{{ glyph() }}</span>`,
  styles: `
    :host { display: inline-flex; }
    .badge { display: inline-grid; place-items: center; border-radius: 50%; font-size: 0.85em; line-height: 1; }
  `,
})
export class GardenBadge {
  readonly icon = input<GardenIcon>('leaf');
  readonly color = input('#2d6a3d');
  readonly size = input(24);
  protected readonly glyph = computed(() => GARDEN_ICONS[this.icon()] ?? GARDEN_ICONS.leaf);
}
