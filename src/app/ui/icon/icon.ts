import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { itemIconUrl, plantIconUrl } from '../icons';

/** Rāda PNG ikonu, ja tāda ir, citādi emocijzīmi, un tukšs alt nozīmē, ka ikona ir tikai rotājums */
@Component({
  selector: 'app-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (url(); as s) {
      <img [src]="s" [attr.alt]="alt()" [width]="size()" [height]="size()" loading="lazy" decoding="async" />
    } @else if (emoji()) {
      @if (alt()) {
        <span class="emoji" role="img" [attr.aria-label]="alt()" [style.font-size.px]="size() * 0.9">{{ emoji() }}</span>
      } @else {
        <span class="emoji" aria-hidden="true" [style.font-size.px]="size() * 0.9">{{ emoji() }}</span>
      }
    }
  `,
  styles: `
    :host { display: inline-flex; align-items: center; justify-content: center; vertical-align: middle; line-height: 1; flex: none; }
    img { display: block; object-fit: contain; }
    .emoji { line-height: 1; }
  `,
})
export class AppIcon {
  readonly src = input<string | null | undefined>(null);
  readonly plant = input<string | null | undefined>(null);
  readonly item = input<string | null | undefined>(null);
  readonly emoji = input<string | null | undefined>(null);
  readonly size = input(20);
  readonly alt = input('');
  protected readonly url = computed(() => this.src() || plantIconUrl(this.plant()) || itemIconUrl(this.item()));
}
