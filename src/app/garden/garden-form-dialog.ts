import { AfterViewInit, Component, ElementRef, inject, input, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GardenBadge } from './garden-badge';
import { GARDEN_COLORS, GARDEN_ICON_KEYS, GARDEN_ICONS, GardenDto, GardenIcon, GardenStore } from './garden-store';
import { problemDetail } from '../shared/format';

/** Jauna dārza izveide vai esošā pārdēvēšana */
@Component({
  selector: 'app-garden-form-dialog',
  imports: [FormsModule, GardenBadge],
  styleUrl: './dialog.scss',
  template: `
    <dialog #dialog aria-labelledby="garden-form-title" (cancel)="onCancel($event)">
      <form (ngSubmit)="save()">
        <h2 id="garden-form-title">{{ garden() ? 'Rename garden' : 'New garden' }}</h2>
        <label class="block">
          Name
          <input class="field" name="name" maxlength="100" required [(ngModel)]="name" autocomplete="off" />
        </label>
        <fieldset>
          <legend>Icon</legend>
          <div class="chips" role="radiogroup">
            @for (key of iconKeys; track key) {
              <label class="chip" [title]="key">
                <input type="radio" name="icon" [value]="key" [(ngModel)]="icon" [attr.aria-label]="key" />
                <span [style.background]="color + '33'">{{ icons[key] }}</span>
              </label>
            }
          </div>
        </fieldset>
        <fieldset>
          <legend>Color</legend>
          <div class="chips" role="radiogroup">
            @for (c of colors; track c) {
              <label class="chip">
                <input type="radio" name="color" [value]="c" [(ngModel)]="color" [attr.aria-label]="'Color ' + c" />
                <span [style.background]="c"></span>
              </label>
            }
          </div>
        </fieldset>
        <p class="muted"><app-garden-badge [icon]="icon" [color]="color" /> {{ name.trim() || 'Garden' }}</p>
        @if (error(); as message) {
          <p class="error" role="alert">{{ message }}</p>
        }
        <div class="actions">
          <button type="button" class="btn" (click)="close()">Cancel</button>
          <button type="submit" class="btn primary" [disabled]="!name.trim() || busy()">
            {{ garden() ? 'Save' : 'Create garden' }}
          </button>
        </div>
      </form>
    </dialog>
  `,
})
export class GardenFormDialog implements AfterViewInit {
  /** Ja null, tad veido jaunu dārzu */
  readonly garden = input<GardenDto | null>(null);
  readonly saved = output<GardenDto>();
  readonly closed = output<void>();

  private readonly store = inject(GardenStore);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  protected readonly icons = GARDEN_ICONS;
  protected readonly iconKeys = GARDEN_ICON_KEYS;
  protected readonly colors = GARDEN_COLORS;
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected name = 'My garden';
  protected icon: GardenIcon = 'leaf';
  protected color = GARDEN_COLORS[0];

  ngAfterViewInit(): void {
    const g = this.garden();
    if (g) {
      this.name = g.name;
      this.icon = g.icon;
      this.color = g.color;
    }
    this.dialog().nativeElement.showModal();
  }

  protected save(): void {
    const name = this.name.trim();
    if (!name || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    const input = { name, icon: this.icon, color: this.color };
    const g = this.garden();
    (g ? this.store.update(g.id, input) : this.store.create(input)).subscribe({
      next: (garden) => {
        this.busy.set(false);
        this.dialog().nativeElement.close();
        this.saved.emit(garden);
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(problemDetail(err, 'Could not save the garden. Try again.'));
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
