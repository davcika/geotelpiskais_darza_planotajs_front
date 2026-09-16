import { Component, DestroyRef, inject, input, OnInit, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { dateToMonthDay, frostProblem, monthDayToDate } from './frost-logic';
import { FrostDto, GardenStore } from './garden-store';
import { formatMonthDay, problemDetail } from '../shared/format';

/** Salnu datumu kartīte, kur aprēķinu var pieņemt, ievadīt pašam vai izlaist */
@Component({
  selector: 'app-frost-card',
  styleUrl: './dialog.scss',
  styles: `
    .spinner { display: inline-block; width: 16px; height: 16px; margin-right: 8px; border: 2px solid var(--color-border); border-top-color: var(--color-primary); border-radius: 50%; vertical-align: -3px; animation: spin 0.8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) { .spinner { animation: none; } }
    .dates { display: grid; gap: 4px; margin: 0 0 8px; }
    .attribution { margin: 10px 0 0; font-size: 11px; line-height: 1.3; color: var(--color-muted); opacity: 0.7; }
    .saved { margin: 0 0 8px; padding: 8px 12px; border-radius: var(--radius-btn); background: var(--color-success-bg); color: var(--color-success-text); }
    .eyebrow { margin: 0 0 6px; color: var(--color-muted); font-size: 0.85rem; }
  `,
  template: `
    <div aria-live="polite">
      <p class="eyebrow" id="frost-title">Frost dates for your location</p>
      @if (mode() === 'loading') {
        <p><span class="spinner" aria-hidden="true"></span>Checking 10 years of weather data…</p>
      } @else if (mode() === 'manual') {
        <label class="block">
          Last spring frost
          <input #lastInput class="field" type="date" [value]="toDate(last())" (input)="last.set(fromDate(lastInput.value))" />
        </label>
        <label class="block">
          First autumn frost
          <input #firstInput class="field" type="date" [value]="toDate(first())" (input)="first.set(fromDate(firstInput.value))" />
        </label>
        <p class="muted">Only the day and month are used.</p>
        @if (problem(); as message) {
          <p class="error" role="alert">{{ message }}</p>
        }
      } @else {
        @let f = frost();
        <div class="dates">
          <span>Last spring frost ≈ <b>{{ format(f?.lastFrost) }}</b>
            @if (f?.lastFrostEarliest) { <span class="muted">({{ format(f?.lastFrostEarliest) }} – {{ format(f?.lastFrostLatest) }})</span> }
          </span>
          <span>First autumn frost ≈ <b>{{ format(f?.firstFrost) }}</b>
            @if (f?.firstFrostEarliest) { <span class="muted">({{ format(f?.firstFrostEarliest) }} – {{ format(f?.firstFrostLatest) }})</span> }
          </span>
        </div>
        <p class="muted">
          @if (f?.source === 'OPEN_METEO') {
            Based on {{ f?.years ?? 10 }} years of weather data.
          } @else if (f?.source === 'MANUAL') {
            Set by you.
          } @else {
            Estimated — typical dates for Latvia (weather data was not available).
          }
        </p>
      }
      @if (error(); as message) {
        <p class="error" role="alert">{{ message }}</p>
      }
      <p class="saved" role="status" [hidden]="!savedMessage()">{{ savedMessage() }}</p>
      <div class="actions">
        @if (mode() === 'manual') {
          <button type="button" class="btn" (click)="mode.set('result')" [disabled]="!frost()">Back</button>
          <button type="button" class="btn primary" [disabled]="!!problem() || busy()" (click)="saveManual()">{{ busy() ? 'Saving…' : 'Save dates' }}</button>
        } @else {
          <button type="button" class="btn" (click)="done.emit()">{{ skipLabel() }}</button>
          <button type="button" class="btn" [disabled]="mode() === 'loading'" (click)="openManual()">Set dates manually</button>
          <button type="button" class="btn primary" [disabled]="mode() === 'loading' || isSaved()" (click)="useDates()">{{ isSaved() ? 'Saved ✓' : 'Use these dates' }}</button>
        }
      </div>
      @if (mode() === 'result' && frost()?.attribution) {
        <p class="attribution">{{ frost()?.attribution }}</p>
      }
    </div>
  `,
})
export class FrostCard implements OnInit {
  readonly gardenId = input.required<number>();
  /** Platums un garums WGS84, ja null, tad nerēķina un rāda saglabātos datumus */
  readonly point = input<[number, number] | null>(null);
  readonly initial = input<FrostDto | null>(null);
  readonly skipLabel = input('Skip');
  /** Ja true, pēc saglabāšanas paliek atvērts un parāda apstiprinājumu */
  readonly stayOpen = input(false);
  readonly done = output<void>();

  private readonly store = inject(GardenStore);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly mode = signal<'loading' | 'result' | 'manual'>('loading');
  protected readonly frost = signal<FrostDto | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly last = signal('');
  protected readonly first = signal('');
  protected readonly format = (mmdd: string | null | undefined) => formatMonthDay(mmdd, '—');
  protected readonly toDate = monthDayToDate;
  protected readonly fromDate = dateToMonthDay;
  /** Pēdējie apstiprinātie datumi kopā vienā virknē */
  private readonly savedKey = signal<string | null>(null);
  protected readonly isSaved = () => !!this.savedKey() && this.savedKey() === this.key();
  protected readonly savedMessage = () =>
    this.isSaved() ? `Frost dates saved — sowing times now use ${this.format(this.frost()?.lastFrost)} and ${this.format(this.frost()?.firstFrost)}.` : '';
  private key(): string {
    const f = this.frost();
    return f?.lastFrost && f.firstFrost ? `${f.lastFrost}|${f.firstFrost}` : '';
  }
  protected readonly problem = () => frostProblem(this.last(), this.first());

  ngOnInit(): void {
    const point = this.point();
    const initial = this.initial();
    if (!point) {
      this.frost.set(initial);
      this.mode.set(initial?.lastFrost ? 'result' : 'manual');
      return;
    }
    this.mode.set('loading');
    this.store.computeFrost(this.gardenId(), point[0], point[1]).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (frost) => {
        this.frost.set(frost);
        this.mode.set('result');
      },
      error: (err) => {
        this.error.set(problemDetail(err, 'Could not look up frost dates.'));
        this.openManual();
      },
    });
  }

  /** Aprēķinātie datumi serverī jau saglabāti, te tos tikai apstiprina */
  protected useDates(): void {
    if (!this.stayOpen()) {
      this.done.emit();
      return;
    }
    if (!this.key()) {
      this.error.set('There are no dates to save yet.');
      return;
    }
    this.error.set(null);
    this.savedKey.set(this.key());
  }

  protected openManual(): void {
    this.last.set(this.frost()?.lastFrost ?? '05-20');
    this.first.set(this.frost()?.firstFrost ?? '09-25');
    this.mode.set('manual');
  }

  protected saveManual(): void {
    if (this.problem() || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    this.savedKey.set(null);
    this.store.saveFrost(this.gardenId(), this.last(), this.first()).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (frost) => {
        this.busy.set(false);
        if (!this.stayOpen()) {
          this.done.emit();
          return;
        }
        this.frost.set(frost);
        this.savedKey.set(this.key());
        this.mode.set('result');
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(problemDetail(err, 'Could not save the dates.'));
      },
    });
  }
}
