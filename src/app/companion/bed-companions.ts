import { Component, computed, inject, input, OnInit } from '@angular/core';
import { bedPairs, CompanionStore } from './companions';

/** Brīdina par sliktiem kaimiņiem dobē un parāda labos */
@Component({
  selector: 'app-bed-companions',
  template: `
    @if (bad().length || good().length) {
      <section class="companions" aria-label="Plant neighbours">
        @for (p of bad(); track p.a + '-' + p.b) {
          <p class="pair bad" role="status">⚠ <strong>{{ name(p.a) }}</strong> and <strong>{{ name(p.b) }}</strong> are bad neighbours</p>
        }
        @if (good().length > 3) {
          <details class="pair good">
            <summary>✓ {{ good().length }} good pairs</summary>
            <ul>
              @for (p of good(); track p.a + '-' + p.b) {
                <li>{{ name(p.a) }} + {{ name(p.b) }}</li>
              }
            </ul>
          </details>
        } @else if (good().length) {
          <p class="pair good">✓ Good neighbours:
            @for (p of good(); track p.a + '-' + p.b; let last = $last) {
              {{ name(p.a) }} + {{ name(p.b) }}{{ last ? '' : ', ' }}
            }
          </p>
        }
      </section>
    }
  `,
  styles: `
    :host { display: block; }
    .companions { display: grid; gap: 4px; }
    .pair { margin: 0; padding: 4px 10px; border-radius: 8px; font-size: 12px; line-height: 1.35; }
    summary { cursor: pointer; }
    details ul { margin: 4px 0 0; padding-left: 18px; }
    .bad { background: var(--color-warning-bg); color: var(--color-warning-text); }
    .good { background: var(--color-success-bg); color: var(--color-success-text); }
  `,
})
export class BedCompanions implements OnInit {
  private readonly store = inject(CompanionStore);
  readonly plantIds = input.required<readonly number[]>();
  readonly names = input.required<ReadonlyMap<number, { nameEn: string }>>();

  private readonly pairs = computed(() => bedPairs(this.plantIds(), this.store.pairs()));
  protected readonly bad = computed(() => this.pairs().filter((p) => p.relation === 'BAD'));
  protected readonly good = computed(() => this.pairs().filter((p) => p.relation === 'GOOD'));

  ngOnInit(): void {
    this.store.ensureLoaded();
  }

  protected name(id: number): string {
    return this.names().get(id)?.nameEn ?? 'Plant';
  }
}
