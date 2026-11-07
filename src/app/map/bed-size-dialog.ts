import { AfterViewInit, Component, ElementRef, output, signal, viewChild } from '@angular/core';

/** Dobi var izveidot, ierakstot izmērus, ja nav ērti zīmēt ar peli */
@Component({
  selector: 'app-bed-size-dialog',
  styleUrl: '../garden/dialog.scss',
  template: `
    <dialog #dialog aria-labelledby="bed-size-title" (cancel)="onCancel($event)">
      <form (submit)="$event.preventDefault(); save()">
        <h2 id="bed-size-title">Add bed by size</h2>
        <p class="muted">The bed is placed in the middle of the map. Drag it to move it afterwards.</p>
        <label class="block">
          Width, m
          <input #w class="field" type="number" min="0.2" max="100" step="0.1" required [value]="width()" (input)="width.set(w.valueAsNumber)" />
        </label>
        <label class="block">
          Length, m
          <input #l class="field" type="number" min="0.2" max="100" step="0.1" required [value]="length()" (input)="length.set(l.valueAsNumber)" />
        </label>
        <div class="actions">
          <button type="button" class="btn" (click)="close()">Cancel</button>
          <button type="submit" class="btn primary" [disabled]="!valid()">Add bed</button>
        </div>
      </form>
    </dialog>
  `,
})
export class BedSizeDialog implements AfterViewInit {
  readonly created = output<{ width: number; length: number }>();
  readonly closed = output<void>();
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  protected readonly width = signal(1.2);
  protected readonly length = signal(3);

  protected valid(): boolean {
    const ok = (v: number) => v >= 0.2 && v <= 100;
    return ok(this.width()) && ok(this.length());
  }

  ngAfterViewInit(): void {
    this.dialog().nativeElement.showModal();
  }

  protected save(): void {
    if (!this.valid()) return;
    this.dialog().nativeElement.close();
    this.created.emit({ width: this.width(), length: this.length() });
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
