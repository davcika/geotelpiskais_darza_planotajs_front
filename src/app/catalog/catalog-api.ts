import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Plant } from '../planting/plant';

/** Lauki, ko lietotājs aizpilda savam augam, atbilst PlantRequest Java pusē */
export type PlantInput = Omit<Plant, 'id' | 'status' | 'mine' | 'reviewNote'> & { shareWithEveryone: boolean };

export interface SimilarPlant {
  id: number;
  nameEn: string;
  nameLv: string;
  /** pg_trgm līdzība no 0 līdz 1 */
  score: number;
}

export interface PendingPlant {
  plant: Plant;
  ownerEmail: string | null;
  submittedAt: string;
  similar: SimilarPlant[];
}

export interface AiReview {
  available: boolean;
  verdict: 'APPROVE' | 'FIX' | 'REJECT' | null;
  reasons: string[];
  error: string | null;
}

/** API lietotāju augiem un to pārbaudei */
@Injectable({ providedIn: 'root' })
export class CatalogApi {
  private readonly http = inject(HttpClient);

  plants(): Observable<Plant[]> {
    return this.http.get<Plant[]>('/api/plants');
  }

  create(input: PlantInput): Observable<Plant> {
    return this.http.post<Plant>('/api/plants', input);
  }

  update(id: number, input: PlantInput): Observable<Plant> {
    return this.http.put<Plant>(`/api/plants/${id}`, input);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`/api/plants/${id}`);
  }

  /** Šī gada stādījumi dārzā, lai saskaitītu augus un atzīmētu tos, kas jau aug */
  gardenPlantings<T extends { plantId: number }>(gardenId: number, year: number): Observable<T[]> {
    return this.http.get<T[]>(`/api/gardens/${gardenId}/plantings`, { params: { year } });
  }

  isAdmin():Observable<{ admin: boolean }> {
    return this.http.get<{ admin: boolean }>('/api/admin/me');
  }

  pending(): Observable<PendingPlant[]> {
    return this.http.get<PendingPlant[]>('/api/admin/plants/pending');
  }

  aiReview(id: number): Observable<AiReview> {
    return this.http.get<AiReview>(`/api/admin/plants/${id}/ai-review`);
  }

  approve(id: number): Observable<Plant> {
    return this.http.post<Plant>(`/api/admin/plants/${id}/approve`, {});
  }

  reject(id: number, note: string): Observable<Plant> {
    return this.http.post<Plant>(`/api/admin/plants/${id}/reject`, { note });
  }
}
