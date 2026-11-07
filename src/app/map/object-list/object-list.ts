import { Component, input, output } from '@angular/core';

export interface MapEntry {
  /** OL objekta uid */
  key: string;
  kind: string;
  name: string;
}

/** Karte kā saraksts tiem, kas lieto tastatūru vai ekrāna lasītāju, paslēpts līdz fokusam vai saraksta skatam */
@Component({
  selector: 'app-object-list',
  styleUrl: './object-list.scss',
  host: { '[class.shown]': 'shown()' },
  template: `
    <nav aria-label="Objects on the map">
      <header>
        <strong>On the map</strong>
        @if (shown()) {
          <button type="button" class="close" aria-label="Close list" (click)="closed.emit()">×</button>
        }
      </header>
      @if (entries().length) {
        <ul role="list">
          @for (entry of entries(); track entry.key) {
            <li>
              <button type="button" [attr.aria-current]="entry.key === selectedKey() ? 'true' : null" (click)="picked.emit(entry.key)">
                <span class="kind">{{ entry.kind }}</span> {{ entry.name }}
              </button>
            </li>
          }
        </ul>
      } @else {
        <p>Nothing on the map yet.</p>
      }
      <button type="button" class="add" (click)="addBySize.emit()">+ Add bed by size…</button>
    </nav>
  `,
})
export class ObjectList {
  readonly entries = input.required<MapEntry[]>();
  readonly selectedKey = input<string | null>(null);
  readonly shown = input(false);
  readonly picked = output<string>();
  readonly addBySize = output<void>();
  readonly closed = output<void>();
}
