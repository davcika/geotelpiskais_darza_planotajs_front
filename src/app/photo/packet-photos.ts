import { HttpClient } from '@angular/common/http';
import { Component, DestroyRef, effect, ElementRef, inject, input, signal, untracked, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription } from 'rxjs';
import { problemDetail } from '../shared/format';

interface PhotoMeta {
  id: number;
  plantingId: number;
  contentType: string;
  sizeBytes: number;
  originalName: string | null;
  createdAt: string;
}

interface Thumb {
  id: number;
  name: string | null;
  url: string | null;
  /** Bildi neizdevās ielādēt */
  failed?: boolean;
}

const MAX_PHOTOS = 5;
const MAX_BYTES = 5 * 1024 * 1024;

/** Sēklu paciņu bildes stādījumam, ielādē caur HttpClient, jo img nevar nosūtīt JWT galveni */
@Component({
  selector: 'app-packet-photos',
  templateUrl: './packet-photos.html',
  styleUrl: './packet-photos.scss',
  host: { '(document:keydown.escape)': 'onEscape()' },
})
export class PacketPhotos {
  private readonly http = inject(HttpClient);
  readonly plantingId = input.required<number>();

  protected readonly photos = signal<Thumb[]>([]);
  protected readonly viewing = signal<Thumb | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly max = MAX_PHOTOS;
  private readonly destroyRef = inject(DestroyRef);
  private readonly closeButton = viewChild<ElementRef<HTMLButtonElement>>('closeButton');
  /** Elements, kuram atgriezt fokusu pēc skatītāja aizvēršanas */
  private returnFocus: HTMLElement | null = null;
  private listing?: Subscription;
  private bytes = new Subscription();

  constructor() {
    effect(() => {
      const id = this.plantingId();
      untracked(() => this.load(id));
    });
    // Atverot skatītāju, fokuss uz aizvēršanas pogu
    effect(() => {
      if (this.viewing()) queueMicrotask(() => this.closeButton()?.nativeElement.focus());
    });
    this.destroyRef.onDestroy(() => this.revokeAll());
  }

  protected open(photo: Thumb, trigger: HTMLElement): void {
    this.returnFocus = trigger;
    this.viewing.set(photo);
  }

  protected close(): void {
    if (!this.viewing()) return;
    this.viewing.set(null);
    const target = this.returnFocus;
    this.returnFocus = null;
    if (target?.isConnected) target.focus();
  }

  protected onEscape(): void {
    this.close();
  }

  private load(plantingId: number): void {
    this.revokeAll();
    this.photos.set([]);
    this.error.set(null);
    this.listing?.unsubscribe();
    this.bytes.unsubscribe();
    this.bytes = new Subscription();
    this.listing = this.http.get<PhotoMeta[]>(`/api/plantings/${plantingId}/photos`).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (list) => {
        this.photos.set(list.map((p) => ({ id: p.id, name: p.originalName, url: null })));
        list.forEach((p) => this.fetchBytes(p.id));
      },
      error: (e) => this.error.set(problemDetail(e, 'Could not load photos. Try again.')),
    });
  }

  private fetchBytes(id: number): void {
    const sub = this.http.get(`/api/photos/${id}`, { responseType: 'blob' }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        let used = false;
        this.photos.update((list) =>
          list.map((t) => {
            if (t.id !== id) return t;
            used = true;
            return { ...t, url, failed: false };
          }),
        );
        if (!used) URL.revokeObjectURL(url);
      },
      error: () => this.photos.update((list) => list.map((t) => (t.id === id ? { ...t, failed: true } : t))),
    });
    this.bytes.add(sub);
  }

  protected onFile(input: HTMLInputElement): void {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > MAX_BYTES) {
      this.error.set('The photo is too large. Choose one up to 5 MB.');
      return;
    }
    const form = new FormData();
    form.append('file', file);
    this.busy.set(true);
    this.error.set(null);
    this.http.post<PhotoMeta>(`/api/plantings/${this.plantingId()}/photos`, form).subscribe({
      next: (p) => {
        this.busy.set(false);
        this.photos.update((list) => [...list, { id: p.id, name: p.originalName, url: URL.createObjectURL(file) }]);
      },
      error: (e) => {
        this.busy.set(false);
        this.error.set(e?.status === 415 ? 'Only JPEG, PNG or WebP images can be uploaded.' : problemDetail(e, 'Could not upload photo. Try again.'));
      },
    });
  }

  protected remove(photo: Thumb): void {
    if (!confirm('Delete this packet photo?')) return;
    this.error.set(null);
    this.http.delete(`/api/photos/${photo.id}`).subscribe({
      next: () => {
        if (photo.url) URL.revokeObjectURL(photo.url);
        this.photos.update((list) => list.filter((t) => t.id !== photo.id));
        if (this.viewing()?.id === photo.id) this.close();
      },
      error: (e) => this.error.set(problemDetail(e, 'Could not delete photo. Try again.')),
    });
  }

  private revokeAll(): void {
    this.photos().forEach((t) => t.url && URL.revokeObjectURL(t.url));
  }
}
