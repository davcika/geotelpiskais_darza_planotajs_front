import { Component, inject } from '@angular/core';
import { TaskStore } from './task-store';
import { UndoSnackbar } from '../ui/undo-snackbar/undo-snackbar';

/** Josla apakšā, kur 5 sekundes var atsaukt darbību */
@Component({
  selector: 'app-task-undo-snackbar',
  imports: [UndoSnackbar],
  template: `
    <app-undo-snackbar [message]="store.snack()?.message" (undo)="store.undoSnack()" (dismiss)="store.hideSnack()" />
  `,
})
export class TaskUndoSnackbar {
  protected readonly store = inject(TaskStore);
}
