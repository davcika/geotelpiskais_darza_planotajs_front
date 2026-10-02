import { Component, inject } from '@angular/core';
import { PlantingStore } from './planting-store';
import { UndoSnackbar } from '../ui/undo-snackbar/undo-snackbar';

/** Paziņojums, ar ko 5 sekundes var atsaukt stādījuma dzēšanu */
@Component({
  selector: 'app-planting-undo-snackbar',
  imports: [UndoSnackbar],
  template: `
    <app-undo-snackbar
      [message]="store.pendingRemoval() ? store.pendingRemoval()!.label + ' removed' : null"
      (undo)="store.undoRemove()"
      (dismiss)="store.flushRemoval()"
    />
  `,
})
export class PlantingUndoSnackbar {
  protected readonly store = inject(PlantingStore);
}
