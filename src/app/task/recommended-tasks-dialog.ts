import { AfterViewInit, Component, ElementRef, inject, output, signal, viewChild } from '@angular/core';
import { DefaultTaskTemplate, TaskStore } from './task-store';
import { formatMonthDay as md } from '../shared/format';

/** Ieteiktie darbi, no kuriem pievieno tikai atzīmētos */
@Component({
  selector: 'app-recommended-tasks-dialog',
  styleUrls: ['../garden/dialog.scss', './recommended-tasks-dialog.scss'],
  template: `
    <dialog #dialog aria-labelledby="rec-title" (close)="closed.emit()">
      <h2 id="rec-title">Recommended tasks</h2>
      <p class="muted">Pick the seasonal jobs you want reminders for.</p>
      @if (error(); as message) {
        <p class="error" role="alert">{{ message }}</p>
      }
      @if (templates(); as list) {
        <ul class="list">
          @for (t of list; track t.title) {
            <li>
              <label [class.added]="t.added">
                <input type="checkbox" [checked]="t.added || selected().has(t.title)" [disabled]="t.added" (change)="toggle(t.title)" />
                <span class="text">
                  <span class="title">{{ t.title }}</span>
                  <span class="muted">{{ schedule(t) }}{{ t.added ? ' · already added' : '' }}</span>
                  @if (t.note) { <span class="muted">{{ t.note }}</span> }
                </span>
              </label>
            </li>
          }
        </ul>
      } @else if (!error()) {
        <p class="muted">Loading…</p>
      }
      <div class="actions">
        <button type="button" class="btn" (click)="close()">Cancel</button>
        <button type="button" class="btn primary" [disabled]="!selected().size || store.busy()" (click)="add()">
          Add{{ selected().size ? ' ' + selected().size : '' }}
        </button>
      </div>
    </dialog>
  `,
})
export class RecommendedTasksDialog implements AfterViewInit {
  protected readonly store = inject(TaskStore);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  readonly closed = output<void>();
  readonly added = output<void>();

  protected readonly templates = signal<DefaultTaskTemplate[] | null>(null);
  protected readonly selected = signal<ReadonlySet<string>>(new Set());
  protected readonly error = signal<string | null>(null);

  ngAfterViewInit(): void {
    this.dialog().nativeElement.showModal();
    this.store.listDefaults().subscribe({
      next: (list) => this.templates.set(list),
      error: () => this.error.set('Could not load recommended tasks'),
    });
  }

  protected schedule(t: DefaultTaskTemplate): string {
    if (t.kind === 'EVERY_N_DAYS') return `Every ${t.intervalDays} days`;
    if (t.kind === 'YEARLY') return `Yearly, ${md(t.monthDayFrom)} – ${md(t.monthDayTo)}`;
    return 'One-off';
  }

  protected toggle(title: string): void {
    this.selected.update((s) => {
      const next = new Set(s);
      if (!next.delete(title)) next.add(title);
      return next;
    });
  }

  protected add(): void {
    this.store.addDefaults([...this.selected()], () => {
      this.added.emit();
      this.close();
    });
  }

  protected close(): void {
    this.dialog().nativeElement.close();
  }
}
