import { AfterViewInit, Component, ElementRef, inject, input, output, signal, viewChild } from '@angular/core';
import { GardenDto, GardenStore } from './garden-store';
import { problemDetail } from '../shared/format';

/** Dzēšana divos soļos, vispirms jāapstiprina un tad jāieraksta DELETE */
@Component({
  selector: 'app-delete-garden-dialog',
  styleUrl: './dialog.scss',
  template: `
    <dialog #dialog role="alertdialog" aria-labelledby="delete-title" aria-describedby="delete-text" (cancel)="onCancel($event)">
      @if (stage() === 'ask') {
        <h2 id="delete-title">Delete “{{ garden().name }}”?</h2>
        <p id="delete-text">Deleting the garden removes all its beds, plantings, tasks and photos.</p>
        <div class="actions">
          <button type="button" class="btn" (click)="close()" #noButton>No</button>
          <button type="button" class="btn danger" (click)="confirmStage()">Yes</button>
        </div>
      } @else {
        <h2 id="delete-title">Type DELETE to confirm</h2>
        <p id="delete-text">This cannot be undone. “{{ garden().name }}” will be deleted permanently.</p>
        <label class="block">
          <span class="muted">Type DELETE</span>
          <input #confirmInput class="field" autocomplete="off" spellcheck="false" [value]="typed()" (input)="typed.set(confirmInput.value)" (keydown.enter)="remove()" />
        </label>
        @if (error(); as message) {
          <p class="error" role="alert">{{ message }}</p>
        }
        <div class="actions">
          <button type="button" class="btn" (click)="close()">Cancel</button>
          <button type="button" class="btn danger" [disabled]="typed() !== 'DELETE' || busy()" (click)="remove()">Delete</button>
        </div>
      }
    </dialog>
  `,
})
export class DeleteGardenDialog implements AfterViewInit {
  readonly garden = input.required<GardenDto>();
  readonly deleted = output<void>();
  readonly closed = output<void>();

  private readonly store = inject(GardenStore);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly confirmInput = viewChild<ElementRef<HTMLInputElement>>('confirmInput');
  private readonly noButton = viewChild<ElementRef<HTMLButtonElement>>('noButton');
  protected readonly stage = signal<'ask' | 'type'>('ask');
  protected readonly typed = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  ngAfterViewInit(): void {
    this.dialog().nativeElement.showModal();
    // drošā izvēle pēc noklusējuma
    this.noButton()?.nativeElement.focus();
  }

  protected confirmStage(): void {
    this.stage.set('type');
    setTimeout(() => this.confirmInput()?.nativeElement.focus());
  }

  protected remove(): void {
    if (this.typed() !== 'DELETE' || this.busy()) return;
    this.busy.set(true);
    this.store.delete(this.garden().id).subscribe({
      next: () => {
        this.dialog().nativeElement.close();
        this.deleted.emit();
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(problemDetail(err, 'Could not delete the garden. Try again.'));
      },
    });
  }

  protected onCancel(event: Event): void {
    event.preventDefault();
    this.close();
  }

  protected close(): void {
    this.dialog().nativeElement.close();
    this.closed.emit();
  }
}
