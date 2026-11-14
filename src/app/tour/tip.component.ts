import { Component, computed, inject, input } from '@angular/core';
import { TipService } from './tip.service';

/** Mazs padoms, ko lietotājs redz tikai vienreiz, līdz to aizver */
@Component({
  selector: 'app-tip',
  template: `
    @if (visible()) {
      <aside class="tip" role="note" [attr.aria-label]="'Tip'">
        <span class="bulb" aria-hidden="true">💡</span>
        <p>{{ text() }}</p>
        <button type="button" class="close" aria-label="Dismiss tip" (click)="dismiss()">Got it</button>
      </aside>
    }
  `,
  styles: `
    .tip { display: flex; align-items: flex-start; gap: 8px; padding: 8px 10px; margin: 0 0 8px;
      border: 1px solid #c8dcc9; border-radius: 10px; background: #eef6ee; color: #1b261c; font-size: 0.85rem; }
    .bulb { font-size: 1rem; line-height: 1.3; }
    p { flex: 1; margin: 0; line-height: 1.4; }
    .close { border: 0; background: none; color: #2d6a3d; font: inherit; font-weight: 600; cursor: pointer;
      min-height: 24px; padding: 2px 6px; border-radius: 6px; }
    .close:focus-visible { outline: 2px solid #2d6a3d; }
  `,
})
export class TipComponent {
  private readonly tips = inject(TipService);
  readonly id = input.required<string>();
  readonly text = input.required<string>();
  /** Pazūd uzreiz pēc aizvēršanas, jo serviss tur signālu */
  protected readonly visible = computed(() => !this.tips.isDismissed(this.id()));

  protected dismiss(): void {
    this.tips.dismiss(this.id());
  }
}
