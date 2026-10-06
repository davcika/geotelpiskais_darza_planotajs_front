import { Component, computed, input } from '@angular/core';
import { capacity } from './bed-blocks';

/** Aizņemtās vietas josla, kur līmeni rāda arī teksts un simbols, ne tikai krāsa */
@Component({
  selector: 'app-space-bar',
  template: `
    @if (bedM2() > 0) {
      <div class="space" [class]="cap().level" role="meter" aria-valuemin="0" aria-valuemax="100"
        [attr.aria-valuenow]="cap().percent" [attr.aria-label]="cap().label">
        @if (!compact()) {
          <span class="label">@if (icon(); as i) {<span class="sym" aria-hidden="true">{{ i }}</span> }{{ cap().label }}</span>
        }
        <span class="track" [title]="cap().label"><span class="fill" [style.width.%]="Math.min(100, cap().percent)"></span></span>
        @if (compact()) {
          <span class="pct">@if (icon(); as i) {<span class="sym" aria-hidden="true">{{ i }}</span> }{{ cap().percent }}%@if (cap().level !== 'ok') { {{ cap().level === 'over' ? 'Overcrowded' : 'Tight' }}}</span>
        }
      </div>
    }
  `,
  styles: `
    .space { display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.85rem; }
    :host([compact]) .space, .space:has(.pct) { flex-direction: row; align-items: center; gap: 0.35rem; font-size: 0.75rem; }
    .track { display: block; flex: 1; min-width: 3rem; height: 0.45rem; border-radius: 99px; background: rgba(0, 0, 0, 0.1); overflow: hidden; }
    .fill { display: block; height: 100%; background: #3d8a4b; }
    .tight .fill { background: #d39b3a; }
    .over .fill { background: #c0392b; }
    .over .label, .over .pct { color: #c0392b; font-weight: 600; }
    .tight .label, .tight .pct { color: #8a5a12; font-weight: 600; }
    .sym { font-weight: 700; }
    /* Pārpildītai dobei josla svītrota, lai atšķirtu ne tikai pēc krāsas */
    .over .fill { background-image: repeating-linear-gradient(45deg, transparent 0 4px, rgba(255, 255, 255, 0.45) 4px 7px); }
    @media (prefers-reduced-motion: no-preference) { .fill { transition: width 0.2s; } }
  `,
})
export class SpaceBar {
  readonly usedM2 = input.required<number>();
  readonly bedM2 = input.required<number>();
  /** Īsā forma dobju sarakstam ar joslu un procentiem */
  readonly compact = input(false);
  protected readonly Math = Math;
  protected readonly cap = computed(() => capacity(this.usedM2(), this.bedM2()));
  protected readonly icon = computed(() => ({ ok: null, tight: '▲', over: '⚠' })[this.cap().level]);
}
