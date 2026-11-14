import { Component, computed, effect, input, output, signal } from '@angular/core';

/** Visas redzamās joslas, lai tās kraujas viena virs otras, nevis pārklājas */
const visible = signal<readonly object[]>([]);

/** Josla ar Undo pogu, kas paslēpjas, kad ziņa ir null */
@Component({
  selector: 'app-undo-snackbar',
  template: `
    <div class="snack-region" role="status" aria-live="polite" [style.--snack-index]="index()">
      @if (message(); as msg) {
        <div class="snack">
          <span>{{ msg }}</span>
          <button type="button" class="undo" (click)="undo.emit()">Undo</button>
          <button type="button" class="dismiss" aria-label="Dismiss" (click)="dismiss.emit()">×</button>
        </div>
      }
    </div>
  `,
  styles: `
    .snack-region {
      position: fixed;
      left: 50%;
      transform: translateX(-50%);
      bottom: calc(16px + var(--tabbar-height, 0px) + env(safe-area-inset-bottom, 0px) + var(--snack-index, 0) * 64px);
      z-index: 9000;
      width: min(480px, calc(100% - 32px));
      pointer-events: none;
      transition: bottom 150ms ease;
    }
    .snack {
      pointer-events: auto;
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 4px 4px 4px 16px;
      border-radius: 12px;
      background: var(--color-snackbar-bg);
      color: #fff;
      box-shadow: var(--card-shadow);
      font-size: 0.9rem;
    }
    .snack span { flex: 1; }
    .undo, .dismiss {
      min-height: 44px;
      min-width: 44px;
      border: 0;
      border-radius: 8px;
      background: transparent;
      color: var(--color-snackbar-action);
      font: inherit;
      font-weight: 700;
      cursor: pointer;
    }
    .undo { min-width: 64px; }
    .dismiss { color: rgba(255, 255, 255, 0.7); font-size: 1.2rem; font-weight: 400; }
    .undo:focus-visible, .dismiss:focus-visible { outline: 2px solid var(--color-snackbar-action); outline-offset: -2px; }
  `,
})
export class UndoSnackbar {
  readonly message = input<string | null | undefined>(null);
  readonly undo = output<void>();
  readonly dismiss = output<void>();

  private readonly key = {};
  protected readonly index = computed(() => Math.max(0, visible().indexOf(this.key)));

  constructor() {
    effect((onCleanup) => {
      if (!this.message()) return;
      visible.update((v) => [...v, this.key]);
      onCleanup(() => visible.update((v) => v.filter((k) => k !== this.key)));
    });
  }
}
