import { Component, input, model } from '@angular/core';
import { TipComponent } from '../../tour/tip.component';
import { BARE_COLOR, FOLIAGE_COLOR, MONTHS } from '../season';

@Component({
  selector: 'app-view-options',
  imports: [TipComponent],
  styleUrl: './view-options.scss',
  template: `
    <label class="check">
      <input type="checkbox" [checked]="seasonMonth() !== null" (change)="toggleSeason()" />
      Season view
    </label>
    @if (seasonMonth() !== null) {
      <app-tip id="season" text="Season view shows your garden month by month — use the slider to see what grows when." />
      <label class="slider">
        <span>Month <b>{{ months[seasonMonth()!] }}</b></span>
        <input #monthInput type="range" min="0" max="11" aria-label="Month" [value]="seasonMonth()" (input)="seasonMonth.set(monthInput.valueAsNumber)" />
      </label>
      <span class="legend">
        <i [style.background]="foliageColor"></i>leaves <i class="bloom"></i>flowers <i [style.background]="bareColor"></i>bare
      </span>
    }
    <label class="slider" [class.disabled]="growableTrees() === 0">
      <span>Tree size in <b>{{ yearsAhead() ? '+' + yearsAhead() + (yearsAhead() === 1 ? ' year' : ' years') + ' (' + (thisYear + yearsAhead()) + ')' : 'now (' + thisYear + ')' }}</b></span>
      <input #aheadInput type="range" min="0" max="30" step="1" aria-label="Tree size in years from now"
        [attr.aria-valuetext]="yearsAhead() ? yearsAhead() + ' years from now' : 'now'"
        [disabled]="growableTrees() === 0" [value]="yearsAhead()" (input)="yearsAhead.set(aheadInput.valueAsNumber)" />
      <small class="hint">{{ growableTrees() === 0 ? 'Add a tree and pick its species to preview how big it will grow.' : 'Preview how big your trees will grow.' }}</small>
    </label>
    <label class="check">
      <input type="checkbox" [checked]="listView()" (change)="listView.set(!listView())" />
      List view (objects as a list)
    </label>
  `,
})
export class ViewOptions {
  /** Ar null rāda parasto skatu bez gadalaikiem */
  readonly seasonMonth = model<number | null>(null);
  readonly yearsAhead = model(0);
  readonly listView = model(false);
  /** Ja nav neviena koka ar zināmu izmēru, slīdnim nav jēgas un to atspējo */
  readonly growableTrees = input(0);
  protected readonly thisYear = new Date().getFullYear();
  protected readonly months = MONTHS;
  protected readonly foliageColor = FOLIAGE_COLOR;
  protected readonly bareColor = BARE_COLOR;

  protected toggleSeason(): void {
    this.seasonMonth.update((month) => (month === null ? new Date().getMonth() : null));
  }
}
