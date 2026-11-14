import { Component, input, signal, effect } from '@angular/core';
import { readStored, writeStored } from '../../shared/storage';

const KEY_PREFIX = 'darza-planotajs.section.';
/** Šajā sesijā lietotājs pats atvēra vai aizvēra sadaļu */
const SESSION_PREFIX = 'darza-planotajs.section-manual.';

/** Sadaļa atceras, vai bija vaļā, un autoOpen to atver, ja vien lietotājs to pats nav aizvēris */
@Component({
  selector: 'app-collapsible-section',
  templateUrl: './collapsible-section.html',
  styleUrl: './collapsible-section.scss',
})
export class CollapsibleSection {
  readonly title = input.required<string>();
  readonly summary = input('');
  readonly id = input.required<string>();
  readonly tourId = input<string>();
  readonly autoOpen = input(false);

  protected readonly open = signal(false);
  private restored = false;
  private manual = false;

  constructor() {
    // id ir zināms tikai pēc ievades piesaistes, tāpēc lasām efektā vienu reizi
    effect(() => {
      const id = this.id();
      if (this.restored) return;
      this.restored = true;
      const session = readStored(SESSION_PREFIX + id, 'session');
      this.manual = session !== null;
      this.open.set(session !== null ? session === '1' : readStored(KEY_PREFIX + id) === '1');
    });
    effect(() => {
      if (this.autoOpen() && !this.manual) this.open.set(true);
    });
  }

  protected toggle(): void {
    this.open.update((v) => !v);
    this.manual = true;
    writeStored(KEY_PREFIX + this.id(), this.open() ? '1' : '0');
    writeStored(SESSION_PREFIX + this.id(), this.open() ? '1' : '0', 'session');
  }
}
