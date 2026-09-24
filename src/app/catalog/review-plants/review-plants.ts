import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { sowingHint } from '../../planting/plant';
import { AiReview, CatalogApi, PendingPlant } from '../catalog-api';
import { errorText } from '../../shared/format';

/** Admins pārskata iesūtītos augus, AI tikai iesaka, bet lemj admins */
@Component({
  selector: 'app-review-plants',
  imports: [FormsModule, RouterLink],
  templateUrl: './review-plants.html',
  styleUrl: '../catalog.scss',
})
export class ReviewPlants {
  private readonly api = inject(CatalogApi);

  protected readonly sowingHint = sowingHint;
  protected readonly pending = signal<PendingPlant[]>([]);
  protected readonly loaded = signal(false);
  /** AI vērtējumi pēc auga id, kamēr gaida, ir loading */
  protected readonly reviews = signal<Record<number, AiReview | 'loading'>>({});
  protected readonly error = signal<string | null>(null);
  protected readonly notes: Record<number, string> = {};

  constructor() {
    this.reload();
  }

  private reload(): void {
    this.api.pending().subscribe({
      next: (list) => {
        this.pending.set(list);
        this.loaded.set(true);
        // Katram atsevišķi, lai lēns AI neaizkavē sarakstu
        for (const item of list) if (!this.reviews()[item.plant.id]) this.askAi(item.plant.id);
      },
      error: (e) => this.error.set(errorText(e)),
    });
  }

  protected askAi(id: number): void {
    this.reviews.update((r) => ({ ...r, [id]: 'loading' }));
    this.api.aiReview(id).subscribe({
      next: (review) => this.reviews.update((r) => ({ ...r, [id]: review })),
      error: (e) =>
        this.reviews.update((r) => ({ ...r, [id]: { available: false, verdict: null, reasons: [], error: errorText(e) } })),
    });
  }

  protected review(id: number): AiReview | 'loading' | undefined {
    return this.reviews()[id];
  }

  protected approve(id: number): void {
    this.api.approve(id).subscribe({ next: () => this.reload(), error: (e) => this.error.set(errorText(e)) });
  }

  protected reject(id: number): void {
    this.api.reject(id, this.notes[id] ?? '').subscribe({ next: () => this.reload(), error: (e) => this.error.set(errorText(e)) });
  }
}
