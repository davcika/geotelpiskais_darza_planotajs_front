import type { FeatureLike } from 'ol/Feature';

/** Jāsakrīt ar Java ObjectType enum backendā */
export type ObjectType = 'BED' | 'TREE';

/** Atbilst garden_object tabulai */
export interface GardenObjectProps {
  type: ObjectType;
  name: string;
  crownRadiusM?: number;
  /** Ja nav norādīts, lieto parasto režģi */
  gridCols?: number;
  gridRows?: number;
  /** Pēc tiem crown.ts rēķina, cik liels izaugs vainags */
  plantId?: number;
  plantedYear?: number;
}

export const DEFAULT_CROWN_RADIUS_M = 2;

export const DEFAULT_NAME: Record<ObjectType, string> = { BED: 'Bed', TREE: 'Tree' };

/** Vienīgā vieta, kur vajag tipa pārveidi */
export function getProps(feature: FeatureLike): GardenObjectProps {
  return feature.getProperties() as GardenObjectProps;
}

export function crownRadius(feature: FeatureLike): number {
  return getProps(feature).crownRadiusM ?? DEFAULT_CROWN_RADIUS_M;
}
