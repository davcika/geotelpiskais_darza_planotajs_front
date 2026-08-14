import { Component, input, output } from '@angular/core';

/** Viena josla visiem zīmēšanas veidiem, arī zonai ievadā, ar lielām pogām ērtai spiešanai ar pirkstu */
@Component({
  selector: 'app-draw-bar',
  styleUrl: './draw-bar.scss',
  host: { role: 'region', '[attr.aria-label]': 'mode()' },
  template: `
    <p class="text">
      <span class="chip">{{ mode() }}</span>
      <span aria-live="polite">{{ instruction() }}</span>
    </p>
    <div class="buttons">
      @if (canUndo()) {
        <button type="button" class="btn" (click)="undo.emit()" aria-keyshortcuts="Backspace">↶ Undo point</button>
      }
      <button type="button" class="btn" (click)="cancel.emit()" aria-keyshortcuts="Escape">Cancel</button>
      @if (finishLabel(); as label) {
        <button type="button" class="btn primary" [disabled]="finishDisabled()" (click)="finish.emit()" aria-keyshortcuts="Enter">
          {{ label }}
        </button>
      }
    </div>
  `,
})
export class DrawBar {
  readonly mode = input.required<string>();
  readonly instruction = input.required<string>();
  /** Ar null pogu nerāda, piemēram kokam pietiek ar vienu klikšķi */
  readonly finishLabel = input<string | null>('Finish');
  readonly finishDisabled = input(false);
  readonly canUndo = input(true);
  readonly finish = output<void>();
  readonly undo = output<void>();
  readonly cancel = output<void>();
}
