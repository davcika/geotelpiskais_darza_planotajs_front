import { Component, computed, effect, inject, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GardenStore } from '../garden/garden-store';
import { daysBetween, formatMonthDay as md } from '../shared/format';
import { GardenTask, TaskKind, TaskStatus, TaskStore } from './task-store';
import { doneLabel } from './task-undo';
import { RecommendedTasksDialog } from './recommended-tasks-dialog';

export type { GardenTask } from './task-store';

const STATUS_LABEL: Record<TaskStatus, string> = {
  OVERDUE: 'Overdue',
  DUE: 'Due now',
  UPCOMING: 'Soon',
  LATER: 'Later',
  DONE: 'Done',
};

/** Šodiena pēc Rīgas laika, jo UTC pēc pusnakts vēl rāda vakardienu */
export function todayRiga(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Riga' }).format(new Date());
}

/** Termiņa teksts, ko lieto arī Today skats */
export function dueText(task: GardenTask): string | null {
  if (!task.nextDue || task.status === 'DONE') return null;
  const days = daysBetween(todayRiga(), task.nextDue);
  if (task.kind === 'YEARLY' && task.status === 'DUE') return `until ${md(task.monthDayTo)}`;
  if (days < 0) return `${-days} days late`;
  if (days === 0) return 'today';
  return days === 1 ? 'tomorrow' : `in ${days} days`;
}

/** Darbu kartīte, kur nokavētie un aktuālie ir augšā un Done var atsaukt */
@Component({
  selector: 'app-garden-tasks',
  imports: [FormsModule, RecommendedTasksDialog],
  templateUrl: './garden-tasks.html',
  styleUrl: './garden-tasks.scss',
})
export class GardenTasks {
  protected readonly store = inject(TaskStore);
  private readonly gardens = inject(GardenStore);

  protected readonly tasks = this.store.tasks;
  protected readonly loaded = this.store.loaded;
  protected readonly busy = this.store.busy;
  protected readonly error = this.store.error;
  protected readonly loadFailed = this.store.loadFailed;

  protected retry(): void {
    this.store.load();
  }
  protected readonly showAll = signal(false);
  protected readonly formOpen = signal(false);
  protected readonly recommendedOpen = signal(false);
  protected readonly submitted = signal(false);

  /** Sākumā rāda tikai aktuālos, secību jau nodrošina backend */
  protected readonly visible = computed(() =>
    this.showAll() ? this.tasks() : this.tasks().filter((t) => t.enabled && t.status !== 'LATER' && t.status !== 'DONE'),
  );
  protected readonly hiddenCount = computed(() => this.tasks().length - this.visible().length);
  /** Vienas rindas kopsavilkums sakļautai sadaļai */
  readonly summaryChange = output<string>();
  /** Ja ir steidzami darbi, sadaļa atveras pati */
  readonly attentionChange = output<boolean>();
  private readonly summary = computed(() => {
    if (!this.loaded()) return 'Loading…';
    if (this.loadFailed()) return 'Could not load tasks';
    const active = this.tasks().filter((t) => t.enabled);
    const overdue = active.filter((t) => t.status === 'OVERDUE').length;
    const due = active.filter((t) => t.status === 'DUE').length;
    if (overdue) return `${overdue} overdue${due ? ` · ${due} due now` : ''}`;
    if (due) return `${due} due now`;
    return active.length ? 'Nothing due right now' : 'No tasks yet';
  });

  protected draft = this.emptyDraft();

  constructor() {
    effect(() => this.summaryChange.emit(this.summary()));
    effect(() => this.attentionChange.emit(this.store.actionable().length > 0));
    effect(() => {
      this.gardens.currentGardenId();
      untracked(() => this.store.load());
    });
  }

  protected statusLabel(task: GardenTask): string {
    return STATUS_LABEL[task.status];
  }

  protected doneLabel(task: GardenTask): string {
    return doneLabel(task.title);
  }

  protected schedule(task: GardenTask): string {
    if (task.kind === 'EVERY_N_DAYS') return `every ${task.intervalDays} days`;
    if (task.kind === 'YEARLY') return `yearly ${md(task.monthDayFrom)}–${md(task.monthDayTo)}`;
    return `on ${task.dueDate}`;
  }

  protected lastDone(task: GardenTask): string | null {
    if (!task.lastDoneOn) return task.kind === 'ONCE' ? null : 'never done';
    const days = daysBetween(task.lastDoneOn, todayRiga());
    const verb = `last ${doneLabel(task.title).toLowerCase()}`;
    return days <= 0 ? `${verb} today` : days === 1 ? `${verb} yesterday` : `${verb} ${days} days ago`;
  }

  protected dueText(task: GardenTask): string | null {
    return dueText(task);
  }

  protected done(task: GardenTask): void {
    this.store.done(task);
  }

  protected toggle(task: GardenTask): void {
    this.store.toggle(task);
  }

  /** Neprasa apstiprinājumu, jo dzēšanu 5 sekundes var atsaukt */
  protected remove(task: GardenTask): void {
    this.store.remove(task);
  }

  protected onRecommendedAdded(): void {
    this.showAll.set(true);
  }

  protected addDefaults(): void {
    this.recommendedOpen.set(true);
  }

  protected titleMissing(): boolean {
    return this.submitted() && !this.draft.title.trim();
  }

  protected save(): void {
    this.submitted.set(true);
    const d = this.draft;
    if (!d.title.trim()) return;
    const body = {
      title: d.title,
      note: d.note || null,
      kind: d.kind,
      dueDate: d.kind === 'ONCE' ? d.dueDate : null,
      intervalDays: d.kind === 'EVERY_N_DAYS' ? d.intervalDays : null,
      monthDayFrom: d.kind === 'YEARLY' ? d.from.slice(5) : null,
      monthDayTo: d.kind === 'YEARLY' ? d.to.slice(5) : null,
      lastDoneOn: d.kind === 'EVERY_N_DAYS' && d.lastDoneOn ? d.lastDoneOn : null,
      enabled: true,
    };
    this.store.create(body, () => {
      this.draft = this.emptyDraft();
      this.submitted.set(false);
      this.formOpen.set(false);
    });
  }

  /** Kļūdu teksti lauka aria describedby */
  protected describedBy(field: 'title' | 'other'): string | null {
    const ids: string[] = [];
    if (field === 'title' && this.titleMissing()) ids.push('task-title-error');
    if (this.formOpen() && this.error()) ids.push('task-form-error');
    return ids.length ? ids.join(' ') : null;
  }

  private emptyDraft() {
    const today = todayRiga();
    return { title: '', note: '', kind: 'ONCE' as TaskKind, dueDate: today, intervalDays: 7, from: today, to: today, lastDoneOn: '' };
  }
}
