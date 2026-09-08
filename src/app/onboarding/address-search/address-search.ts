import { HttpClient } from '@angular/common/http';
import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  inject,
  model,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, debounceTime, distinctUntilChanged, map, Observable, of, startWith, switchMap } from 'rxjs';

/** east un north ir metros LKS92 sistēmā */
export interface Address {
  code: number;
  label: string;
  east: number;
  north: number;
}

type SearchState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'done'; results: Address[] };

const MIN_CHARS = 3;
const DEBOUNCE_MS = 250;
const MAX_RESULTS = 8;
const IDLE: SearchState = { kind: 'idle' };

let nextId = 0;

/** Adreses meklēšana ar ieteikumiem, kur pirmais Esc aizver sarakstu un otrais notīra lauku */
@Component({
  selector: 'app-address-search',
  templateUrl: './address-search.html',
  styleUrl: './address-search.scss',
})
export class AddressSearch {
  private readonly http = inject(HttpClient);
  private readonly input = viewChild.required<ElementRef<HTMLInputElement>>('input');

  /** Divvirzienu, lai teksts saglabājas, kad lietotājs atgriežas pie meklēšanas */
  readonly query = model('');
  readonly picked = output<Address>();

  protected readonly listId = `address-options-${nextId++}`;
  protected readonly active = signal(-1);
  protected readonly dismissed = signal(false);

  protected readonly state = toSignal(
    toObservable(this.query).pipe(
      map((query) => query.trim()),
      debounceTime(DEBOUNCE_MS),
      distinctUntilChanged(),
      switchMap((query) => (query.length < MIN_CHARS ? of(IDLE) : this.search(query))),
    ),
    { initialValue: IDLE },
  );

  protected readonly results = computed(() => {
    const state = this.state();
    return state.kind === 'done' ? state.results : [];
  });
  protected readonly open = computed(() => this.state().kind !== 'idle' && !this.dismissed());
  protected readonly announcement = computed(() => {
    const state = this.state();
    if (state.kind !== 'done') return '';
    return state.results.length === 0 ? 'No addresses found' : `${state.results.length} results`;
  });

  constructor() {
    afterNextRender(() => this.input().nativeElement.focus());
  }

  private search(query: string): Observable<SearchState> {
    return this.http.get<Address[]>('/api/addresses', { params: { q: query, limit: MAX_RESULTS } }).pipe(
      map((results): SearchState => ({ kind: 'done', results })),
      catchError(() => of<SearchState>({ kind: 'error' })),
      startWith<SearchState>({ kind: 'loading' }),
    );
  }

  protected onInput(value: string): void {
    this.query.set(value);
    this.active.set(-1);
    this.dismissed.set(false);
  }

  protected onKeydown(event: KeyboardEvent): void {
    const count = this.results().length;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.dismissed.set(false);
        this.active.update((i) => Math.min(i + 1, count - 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.active.update((i) => Math.max(i - 1, 0));
        break;
      case 'Enter':
        if (this.open() && this.active() >= 0) {
          event.preventDefault();
          this.pick(this.results()[this.active()]);
        }
        break;
      case 'Escape':
        if (this.open()) this.dismissed.set(true);
        else this.clear();
        break;
    }
  }

  protected pick(address: Address): void {
    this.dismissed.set(true);
    this.picked.emit(address);
  }

  protected clear(): void {
    this.onInput('');
    this.input().nativeElement.focus();
  }

  protected optionId(index: number): string {
    return `${this.listId}-${index}`;
  }

  /** Iezīmē meklētos vārdus adresē, garumzīmes neskaitās tāpat kā backend */
  protected highlight(label: string): { text: string; match: boolean }[] {
    const plain = toPlain(label);
    const matched = new Array<boolean>(label.length).fill(false);
    for (const word of toPlain(this.query()).split(/\s+/).filter(Boolean)) {
      for (let at = plain.indexOf(word); at >= 0; at = plain.indexOf(word, at + 1)) {
        matched.fill(true, at, at + word.length);
      }
    }
    const parts: { text: string; match: boolean }[] = [];
    for (let i = 0; i < label.length; i++) {
      const last = parts.at(-1);
      if (last && last.match === matched[i]) last.text += label[i];
      else parts.push({ text: label[i], match: matched[i] });
    }
    return parts;
  }
}

/** Noņem garumzīmes, bet garums paliek tas pats, lai indeksi sakrīt ar oriģinālu */
function toPlain(text: string): string {
  return Array.from(text, (char) => char.normalize('NFD')[0].toLowerCase()).join('');
}
