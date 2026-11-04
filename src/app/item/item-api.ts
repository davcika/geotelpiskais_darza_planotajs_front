/** Dārza elementu API un tipi, piemēram siltumnīcām, lecektīm un žogiem */
import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export type ItemShape = 'AREA' | 'POINT' | 'LINE';
export type ItemCategory = 'STRUCTURE' | 'PROTECTION' | 'WATERING' | 'SUPPORT' | 'WILDLIFE' | 'OTHER';

/** Vilkšanas datu tips, vērtība ir elementa tipa atslēga */
export const ITEM_DND_MIME = 'application/x-garden-item';

export interface ItemType {
  key: string;
  nameEn: string;
  nameLv: string;
  icon: string;
  shape: ItemShape;
  category: ItemCategory;
  defaultWM: number | null;
  defaultHM: number | null;
  startShiftDays: number;
  endShiftDays: number;
  harvestShiftDays: number;
  frostProtectionC: number;
  climbingSupport: boolean;
}

export interface GardenItem {
  id: number;
  gardenId: number;
  typeKey: string;
  /** GeoJSON koordinātās EPSG 3059 */
  geometry: string;
  rotationDeg: number;
  label: string | null;
  createdAt: string;
  lengthM: number | null;
  areaM2: number | null;
}

export interface GardenItemInput {
  typeKey: string;
  geometry: string;
  rotationDeg?: number;
  label?: string | null;
}

export interface AffectingItem {
  itemId: number;
  name: string;
  icon: string;
  /** Elementa tipa atslēga ikonai, ja backend to atdod */
  typeKey?: string;
}

export interface ItemEffect {
  affectedBy: AffectingItem[];
  /** Mēnesis un diena bez gada */
  outdoorFrom: string;
  outdoorTo: string;
  harvestExtraDays: number;
  frostProtectionC: number;
}

/** Atslēga ir stādījuma id kā teksts, jo JSON atslēgas ir teksts */
export type ItemEffects = Record<string, ItemEffect>;

export const CATEGORY_LABEL: Record<ItemCategory, string> = {
  STRUCTURE: 'Structures',
  PROTECTION: 'Protection',
  WATERING: 'Watering',
  SUPPORT: 'Supports',
  WILDLIFE: 'Wildlife',
  OTHER: 'Other',
};

/** Elementa nosaukums kvadrātiekavās pārskata rindai, tukšs ja ietekmes nav */
export function affectedLabel(effect: ItemEffect | undefined): string {
  return effect && effect.affectedBy.length ? `[${effect.affectedBy.map((a) => a.name).join(', ')}]` : '';
}

/** Saglabāšanas pieprasījums no esoša elementa ar izmaiņām */
export function itemInput(item: GardenItem, patch: Partial<GardenItemInput> = {}): GardenItemInput {
  return { typeKey: item.typeKey, geometry: item.geometry, rotationDeg: item.rotationDeg, label: item.label, ...patch };
}

/** Noklusējuma ģeometrija vietā, kur elementu nomet, koordinātas metros EPSG 3059 */
export function defaultGeometry(type: ItemType, x: number, y: number, rotation = 0): string {
  if (type.shape === 'POINT') {
    return JSON.stringify({ type: 'Point', coordinates: [x, y] });
  }
  if (type.shape === 'LINE') {
    return JSON.stringify({ type: 'LineString', coordinates: [[x, y], [x + 2, y]] });
  }
  const w = (type.defaultWM ?? 1) / 2;
  const h = (type.defaultHM ?? 1) / 2;
  // Pagriež ap centru tā, lai uz ekrāna (skata rotācija) taisnstūris būtu paralēls asīm
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const ring = [[-w, -h], [w, -h], [w, h], [-w, h], [-w, -h]].map(([u, v]) => [x + u * cos - v * sin, y + u * sin + v * cos]);
  return JSON.stringify({ type: 'Polygon', coordinates: [ring] });
}

@Injectable({ providedIn: 'root' })
export class ItemApi {
  private readonly http = inject(HttpClient);

  types(): Observable<ItemType[]> {
    return this.http.get<ItemType[]>('/api/items/types');
  }

  list(gardenId: number): Observable<GardenItem[]> {
    return this.http.get<GardenItem[]>(`/api/gardens/${gardenId}/items`);
  }

  create(gardenId: number, input: GardenItemInput): Observable<GardenItem> {
    return this.http.post<GardenItem>(`/api/gardens/${gardenId}/items`, input);
  }

  update(id: number, input: GardenItemInput): Observable<GardenItem> {
    return this.http.put<GardenItem>(`/api/items/${id}`, input);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`/api/items/${id}`);
  }

  effects(gardenId: number, year: number): Observable<ItemEffects> {
    return this.http.get<ItemEffects>(`/api/gardens/${gardenId}/items/effects`, { params: { year } });
  }
}
