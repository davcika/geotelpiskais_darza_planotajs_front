import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal, Signal } from '@angular/core';
import { map, Observable, tap, throwError } from 'rxjs';
import { readStored, writeStored } from '../shared/storage';

/** Salnu datumi kā mēnesis un diena, tāpat kā Java pusē */
export interface FrostDto {
  lastFrost: string | null;
  firstFrost: string | null;
  lastFrostEarliest: string | null;
  lastFrostLatest: string | null;
  firstFrostEarliest: string | null;
  firstFrostLatest: string | null;
  source: 'OPEN_METEO' | 'MANUAL' | 'DEFAULT' | null;
  /** Cik gadu dati izmantoti, ir tikai tikko aprēķinot */
  years: number | null;
  /** Ja true, ņemts Latvijas noklusējums, jo laikapstākļu datu nebija */
  estimated: boolean;
  attribution: string | null;
}

/** Dārzs tādā formā, kā to atdod backend */
export interface GardenDto {
  id: number;
  name: string;
  icon: GardenIcon;
  color: string;
  addressCode: number | null;
  addressLabel: string | null;
  /** Zonas poligons EPSG 3059, null kamēr lietotājs nav izgājis onboarding */
  hubGeometry: string | null;
  frost?: FrostDto | null;
  /** Lietotāja loma šajā dārzā, īpašnieks vai uzaicināts rediģētājs */
  role: GardenRole;
  ownerEmail: string;
}

export type GardenRole = 'OWNER' | 'EDITOR';

/** Uzaicinājuma saite, derīga 7 dienas un lietojama vairākkārt */
export interface InviteDto {
  token: string;
  expiresAt: string;
}

/** Dārza dalībnieks, you nozīmē pašreizējo lietotāju */
export interface MemberDto {
  userId: number;
  email: string;
  role: GardenRole;
  you: boolean;
}

/** Uzaicinājuma priekšskatījums pirms pievienošanās */
export interface InvitePreviewDto {
  gardenId: number;
  gardenName: string;
  ownerEmail: string;
  alreadyMember: boolean;
}

export interface GardenInput {
  name: string;
  icon: GardenIcon;
  color: string;
}

/** Ikonu atslēgām jāsakrīt ar backend pārbaudi */
export const GARDEN_ICONS = {
  leaf: '🌿',
  carrot: '🥕',
  flower: '🌸',
  tree: '🌳',
  apple: '🍎',
  sun: '☀️',
  house: '🏡',
  drop: '💧',
} as const;
export type GardenIcon = keyof typeof GARDEN_ICONS;
export const GARDEN_ICON_KEYS = Object.keys(GARDEN_ICONS) as GardenIcon[];
export const GARDEN_COLORS = ['#2d6a3d', '#4f8a3c', '#c0841a', '#c2452d', '#b5487a', '#6a4fb3', '#2f6fb0', '#5b6770'];

const CURRENT_KEY = 'garden.current';

/** Ja pēdējā izvēle vairs nav sarakstā, ņem pirmo */
export function pickCurrent(gardens: GardenDto[], wanted: number | null): number | null {
  if (wanted !== null && gardens.some((g) => g.id === wanted)) return wanted;
  return gardens[0]?.id ?? null;
}

function readStoredId(): number | null {
  const value = Number(readStored(CURRENT_KEY));
  return Number.isInteger(value) && value > 0 ? value : null;
}

/** Lietotāja dārzi un pašreizējais dārzs, fetch vienmēr jautā serverim un izvēli glabā localStorage */
@Injectable({ providedIn: 'root' })
export class GardenStore {
  private readonly http = inject(HttpClient);

  private readonly list = signal<GardenDto[]>([]);
  private readonly currentId = signal<number | null>(readStoredId());
  readonly gardens: Signal<GardenDto[]> = this.list.asReadonly();
  /** Pašreizējā dārza id, citas daļas uz to paļaujas, tāpēc nosaukumu nemainīt */
  readonly currentGardenId: Signal<number | null> = this.currentId.asReadonly();
  readonly current = computed(() => this.list().find((g) => g.id === this.currentId()) ?? null);

  /** Ielādē visus dārzus un vajadzības gadījumā atjauno izvēli */
  fetchAll(): Observable<GardenDto[]> {
    return this.http.get<GardenDto[]>('/api/gardens').pipe(
      tap((gardens) => {
        this.list.set(gardens);
        this.select(pickCurrent(gardens, this.currentId()));
      }),
    );
  }

  /** Pašreizējais dārzs, met kļūdu ja dārzu nav, bet to novērš maršrutu sargi */
  fetch(): Observable<GardenDto> {
    return this.fetchAll().pipe(
      map(() => {
        const garden = this.current();
        if (!garden) throw new Error('No garden yet');
        return garden;
      }),
    );
  }

  select(id: number | null): void {
    this.currentId.set(id);
    // Privātajā režīmā izvēle vienkārši netiek atcerēta
    writeStored(CURRENT_KEY, id === null ? null : String(id));
  }

  /** Pēc iziešanas aizmirst iepriekšējā lietotāja dārzus */
  reset(): void {
    this.list.set([]);
    this.select(null);
  }

  create(input: GardenInput): Observable<GardenDto> {
    return this.http.post<GardenDto>('/api/gardens', input).pipe(
      tap((garden) => {
        this.upsert(garden);
        this.select(garden.id);
      }),
    );
  }

  update(id: number, input: GardenInput): Observable<GardenDto> {
    return this.http.put<GardenDto>(`/api/gardens/${id}`, input).pipe(tap((garden) => this.replace(garden)));
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`/api/gardens/${id}`).pipe(
      tap(() => this.dropLocal(id)),
    );
  }

  createInvite(gardenId: number): Observable<InviteDto> {
    return this.http.post<InviteDto>(`/api/gardens/${gardenId}/invite`, {});
  }

  /** Pašreizējā aktīvā saite tikai īpašniekam, null ja tādas nav */
  currentInvite(gardenId: number): Observable<InviteDto | null> {
    return this.http.get<InviteDto | null>(`/api/gardens/${gardenId}/invite`);
  }

  revokeInvite(gardenId: number): Observable<void> {
    return this.http.delete<void>(`/api/gardens/${gardenId}/invite`);
  }

  members(gardenId: number): Observable<MemberDto[]> {
    return this.http.get<MemberDto[]>(`/api/gardens/${gardenId}/members`);
  }

  removeMember(gardenId: number, userId: number): Observable<void> {
    return this.http.delete<void>(`/api/gardens/${gardenId}/members/${userId}`);
  }

  /** Rediģētājs pamet dārzu, un tas pazūd no saraksta */
  leave(gardenId: number, myUserId: number): Observable<void> {
    return this.removeMember(gardenId, myUserId).pipe(tap(() => this.dropLocal(gardenId)));
  }

  previewInvite(token: string): Observable<InvitePreviewDto> {
    return this.http.get<InvitePreviewDto>(`/api/invites/${encodeURIComponent(token)}`);
  }

  /** Pieņem uzaicinājumu, un dārzs kļūst par pašreizējo */
  acceptInvite(token: string): Observable<GardenDto> {
    return this.http.post<GardenDto>(`/api/invites/${encodeURIComponent(token)}/accept`, {}).pipe(
      tap((garden) => {
        this.upsert(garden);
        this.select(garden.id);
      }),
    );
  }

  private dropLocal(id: number): void {
    const rest = this.list().filter((g) => g.id !== id);
    this.list.set(rest);
    this.select(pickCurrent(rest, this.currentId()));
  }

  saveHub(gardenId: number, addressCode: number | null, geometry: string): Observable<GardenDto> {
    return this.http
      .put<GardenDto>(`/api/gardens/${gardenId}/hub`, { addressCode, geometry })
      .pipe(tap((garden) => this.replace(garden)));
  }

  computeFrost(gardenId: number, lat: number, lon: number): Observable<FrostDto> {
    return this.http
      .post<FrostDto>(`/api/gardens/${gardenId}/frost/compute`, { lat, lon })
      .pipe(tap((frost) => this.patchFrost(gardenId, frost)));
  }

  saveFrost(gardenId: number, lastFrost: string, firstFrost: string): Observable<FrostDto> {
    if (lastFrost >= firstFrost) return throwError(() => new Error('Last frost must be before first frost'));
    return this.http
      .put<FrostDto>(`/api/gardens/${gardenId}/frost`, { lastFrost, firstFrost })
      .pipe(tap((frost) => this.patchFrost(gardenId, frost)));
  }

  private patchFrost(gardenId: number, frost: FrostDto): void {
    this.list.update((list) => list.map((g) => (g.id === gardenId ? { ...g, frost } : g)));
  }

  /** Pievieno dārzu sarakstam vai aizstāj esošo ar to pašu id */
  private upsert(garden: GardenDto): void {
    this.list.update((list) =>
      list.some((g) => g.id === garden.id) ? list.map((g) => (g.id === garden.id ? garden : g)) : [...list, garden],
    );
  }

  private replace(garden: GardenDto): void {
    this.list.update((list) => list.map((g) => (g.id === garden.id ? garden : g)));
  }
}
