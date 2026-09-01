import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Feature } from 'ol';
import GeoJSON from 'ol/format/GeoJSON';
import { catchError, EMPTY, map, Observable, of, switchMap } from 'rxjs';
import { GardenDto, GardenStore } from '../../garden/garden-store';
import { problemDetail } from '../../shared/format';
import type { Planting } from '../../planting/planting-store';
import { GardenObjectProps, getProps } from './garden-object';

/** Tāds objekts, kādu sūta backends, ģeometrija nāk kā GeoJSON teksts */
interface GardenObjectDto extends GardenObjectProps {
  id: number;
  geometry: string;
}

export interface LoadedGarden {
  garden: GardenDto;
  features: Feature[];
}

const objectsUrl = (gardenId: number) => `/api/gardens/${gardenId}/objects`;
const objectUrl = (id: string | number) => `/api/objects/${id}`;
const geoJson = new GeoJSON();

/** Izmaiņas sūta fonā, un katrai kartei ir sava instance, lai stāvoklis nepaliek no cita lietotāja */
@Injectable()
export class GardenApi {
  private readonly http = inject(HttpClient);
  private readonly gardens = inject(GardenStore);
  readonly error = signal<string | null>(null);
  /** Tad kļūdas joslā rāda pogu Retry */
  readonly loadFailed = signal(false);
  /** Nomainot dārzu, karti uzbūvē no jauna */
  private gardenId: number | null = null;

  load(): Observable<LoadedGarden> {
    this.error.set(null);
    this.loadFailed.set(false);
    return this.gardens.fetch().pipe(
      switchMap((garden) => {
        this.gardenId = garden.id;
        return this.http
          .get<GardenObjectDto[]>(objectsUrl(garden.id))
          .pipe(map((dtos) => ({ garden, features: dtos.map(toFeature) })));
      }),
      catchError((error) => {
        this.fail('load your garden', error);
        this.loadFailed.set(true);
        return EMPTY;
      }),
    );
  }

  create(feature: Feature): void {
    if (this.gardenId === null) {
      this.fail('save the object', 'garden not loaded yet');
      return;
    }
    this.http.post<GardenObjectDto>(objectsUrl(this.gardenId), toRequest(feature)).subscribe({
      next: (dto) => {
        feature.setId(dto.id);
        // Ja objektu paspēja izdzēst vai mainīt, kamēr gaidījām id, tagad to nosūtām
        if (feature.get('pendingDelete')) this.delete(feature);
        else if (feature.get('pendingUpdate')) this.update(feature);
      },
      error: (error) => this.fail('save the object', error),
    });
  }

  update(feature: Feature): void {
    const id = feature.getId();
    if (id === undefined) {
      feature.set('pendingUpdate', true, true); // klusi, lai karte nepārzīmējas
      return;
    }
    feature.unset('pendingUpdate', true);
    this.http.put(objectUrl(id), toRequest(feature)).subscribe({
      error: (error) => this.fail('save your changes', error),
    });
  }

  delete(feature: Feature): void {
    const id = feature.getId();
    if (id === undefined) {
      feature.set('pendingDelete', true, true);
      return;
    }
    this.http.delete(objectUrl(id)).subscribe({
      error: (error) => this.fail('delete the object', error),
    });
  }

  /** Vajag gadalaiku skatam, jo ķiploks rudenī iestādīts aug arī nākamgad, un kļūdas gadījumā vienkārši tukšs */
  plantingsOf(gardenId: number, year: number): Observable<Planting[]> {
    return this.http
      .get<Planting[]>(`/api/gardens/${gardenId}/plantings`, { params: { year } })
      .pipe(catchError(() => of([] as Planting[])));
  }

  private fail(action: string, error: unknown): void {
    console.error(error);
    this.error.set(problemDetail(error, `Could not ${action}. Check that the server is running and reload the page.`));
  }
}

function toRequest(feature: Feature): Omit<GardenObjectDto, 'id'> {
  const { type, name, crownRadiusM, gridCols, gridRows, plantId, plantedYear } = getProps(feature);
  return { type, name, crownRadiusM, gridCols, gridRows, plantId, plantedYear, geometry: geoJson.writeGeometry(feature.getGeometry()!) };
}

function toFeature({ id, geometry, ...props }: GardenObjectDto): Feature {
  const feature = new Feature({ ...props, geometry: geoJson.readGeometry(geometry) ?? undefined });
  feature.setId(id);
  return feature;
}
