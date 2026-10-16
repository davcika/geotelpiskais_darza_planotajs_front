import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Observable, switchMap } from 'rxjs';
import { GardenStore } from '../garden/garden-store';
import { problemDetail } from '../shared/format';
import { DelayedAction, doneLabel, UNDO_MS, withoutIds } from './task-undo';

export type TaskKind = 'ONCE' | 'EVERY_N_DAYS' | 'YEARLY';
export type TaskStatus = 'OVERDUE' | 'DUE' | 'UPCOMING' | 'LATER' | 'DONE';

export interface GardenTask {
  id: number;
  objectId: number | null;
  title: string;
  note: string | null;
  kind: TaskKind;
  dueDate: string | null;
  intervalDays: number | null;
  monthDayFrom: string | null;
  monthDayTo: string | null;
  lastDoneOn: string | null;
  enabled: boolean;
  isDefault: boolean;
  nextDue: string | null;
  status: TaskStatus;
}

export interface DefaultTaskTemplate {
  title: string;
  note: string | null;
  kind: TaskKind;
  intervalDays: number | null;
  monthDayFrom: string | null;
  monthDayTo: string | null;
  added: boolean;
}

/** Dati atsaukšanas joslai app undo snackbar */
export interface UndoSnack {
  message: string;
  undo: () => void;
}

/**
 * Dārza darbi, kopīgi To do sadaļai un Today skatam.
 * Done un dzēšanu 5 sekundes var atsaukt, Done ar POST uz undo, bet dzēšanu vienkārši atliek.
 */
@Injectable({ providedIn: 'root' })
export class TaskStore {
  private readonly http = inject(HttpClient);
  private readonly gardens = inject(GardenStore);

  private readonly all = signal<GardenTask[]>([]);
  private readonly deleting = signal<ReadonlySet<number>>(new Set());
  private readonly pendingDeletes = new Map<number, DelayedAction>();
  private snackTimer: ReturnType<typeof setTimeout> | null = null;
  private gardenId: number | null = null;
  /** Pieprasījuma numurs, lai vecas atbildes neko nepārrakstītu */
  private listSeq = 0;

  readonly tasks = computed(() => withoutIds(this.all(), this.deleting()));
  readonly loaded = signal(false);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  /** Ja ielāde neizdevās, nerāda, ka darbu nav */
  readonly loadFailed = signal(false);
  readonly snack = signal<UndoSnack | null>(null);

  /** Ieslēgtie darbi, kas nokavēti vai jādara tagad */
  readonly actionable = computed(() => this.tasks().filter((t) => t.enabled && (t.status === 'OVERDUE' || t.status === 'DUE')));

  load(): void {
    this.gardenId = null;
    this.all.set([]);
    this.loaded.set(false);
    this.reload();
  }

  reload(): void {
    const seq = ++this.listSeq;
    this.run(
      (id) => this.http.get<GardenTask[]>(`/api/gardens/${id}/tasks`),
      (list) => {
        if (seq === this.listSeq) this.setList(list);
      },
      () => {
        if (seq === this.listSeq) this.loadFailed.set(true);
      },
      'Could not load tasks',
    );
  }

  /** Izejot nekas no iepriekšējā lietotāja nepaliek */
  reset(): void {
    this.listSeq++;
    for (const action of this.pendingDeletes.values()) action.cancel();
    this.pendingDeletes.clear();
    this.hideSnack();
    this.gardenId = null;
    this.all.set([]);
    this.deleting.set(new Set());
    this.loaded.set(false);
    this.loadFailed.set(false);
    this.busy.set(false);
    this.error.set(null);
  }

  done(task: GardenTask): void {
    this.run(
      () => this.http.post<GardenTask>(`/api/tasks/${task.id}/done`, {}),
      () => {
        this.reload();
        this.show(`${doneLabel(task.title)}: “${task.title}”`, () =>
          this.run(() => this.http.post<GardenTask>(`/api/tasks/${task.id}/undo`, {}), () => this.reload()),
        );
      },
    );
  }

  /** Paslēpj uzreiz, bet no servera dzēš tikai pēc 5 sekundēm, ja neatsauc */
  remove(task: GardenTask): void {
    this.setDeleting(task.id, true);
    const action = new DelayedAction(() => {
      this.pendingDeletes.delete(task.id);
      this.run(
        () => this.http.delete(`/api/tasks/${task.id}`),
        () => {
          this.setDeleting(task.id, false);
          this.reload();
        },
        () => this.setDeleting(task.id, false),
      );
    }, UNDO_MS);
    this.pendingDeletes.set(task.id, action);
    this.show(`Deleted “${task.title}”`, () => {
      if (this.pendingDeletes.get(task.id)?.cancel()) {
        this.pendingDeletes.delete(task.id);
        this.setDeleting(task.id, false);
      }
    });
  }

  toggle(task: GardenTask): void {
    this.run(() => this.http.put<GardenTask>(`/api/tasks/${task.id}`, { ...task, enabled: !task.enabled, lastDoneOn: null }), () =>
      this.reload(),
    );
  }

  /** Ieteiktie darbi ar atzīmi, vai jau pievienoti */
  listDefaults(): Observable<DefaultTaskTemplate[]> {
    return this.gardens.fetch().pipe(
      switchMap((garden) => this.http.get<DefaultTaskTemplate[]>(`/api/gardens/${garden.id}/tasks/defaults`)),
    );
  }

  /** Ieteiktos darbus atrod pēc nosaukuma */
  addDefaults(titles: string[], next?: () => void): void {
    this.run((id) => this.http.post<GardenTask[]>(`/api/gardens/${id}/tasks/defaults`, { titles }), (list) => {
      this.listSeq++;
      this.setList(list);
      next?.();
    });
  }

  create(body: object, next: () => void): void {
    this.run((id) => this.http.post<GardenTask>(`/api/gardens/${id}/tasks`, body), () => {
      next();
      this.reload();
    });
  }

  undoSnack(): void {
    const snack = this.snack();
    this.hideSnack();
    snack?.undo();
  }

  hideSnack(): void {
    if (this.snackTimer) clearTimeout(this.snackTimer);
    this.snackTimer = null;
    this.snack.set(null);
  }

  private show(message: string, undo: () => void): void {
    this.hideSnack();
    this.snack.set({ message, undo });
    this.snackTimer = setTimeout(() => this.hideSnack(), UNDO_MS);
  }

  private setList(list: GardenTask[]): void {
    this.loadFailed.set(false);
    this.all.set(list);
  }

  private setDeleting(id: number, on: boolean): void {
    this.deleting.update((set) => {
      const next = new Set(set);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  /** Visi pieprasījumi iet caur šejieni, lai dārza id, ielāde un kļūdas būtu vienā vietā */
  private run<T>(request: (gardenId: number) => Observable<T>, next: (value: T) => void, fail?: () => void, failMessage = 'Could not update tasks'): void {
    this.busy.set(true);
    this.error.set(null);
    const current = this.gardens.currentGardenId();
    const source =
      this.gardenId !== null && this.gardenId === current
        ? request(this.gardenId)
        : this.gardens.fetch().pipe(
            switchMap((garden) => {
              this.gardenId = garden.id;
              return request(garden.id);
            }),
          );
    source.subscribe({
      next: (value) => {
        this.busy.set(false);
        this.loaded.set(true);
        next(value);
      },
      error: (err) => {
        this.busy.set(false);
        this.loaded.set(true);
        this.error.set(problemDetail(err, failMessage));
        fail?.();
      },
    });
  }
}
