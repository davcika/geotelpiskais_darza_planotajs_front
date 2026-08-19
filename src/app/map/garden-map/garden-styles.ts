import type { FeatureLike } from 'ol/Feature';
import { Circle, MultiPoint, Point, Polygon } from 'ol/geom';
import { Circle as CircleStyle, Fill, Stroke, Style, Text as TextStyle } from 'ol/style';
import { crownRadius, DEFAULT_NAME, getProps } from './garden-object';
import { bedGridStyle } from '../bed-overlay';
import { olIcon } from '../../ui/icons';
import { areaLabel, labelFill, labelHalo, selectedStroke, vertexImage } from '../style-kit';

const TREE_COLOR = '#3d8a4b';
const CONFLICT_COLOR = '#c0392b';
const bedStroke = new Stroke({ color: '#7d5c36', width: 2 });
const treeStroke = new Stroke({ color: TREE_COLOR, width: 1.5 });
const trunkImage = new CircleStyle({ radius: 3, fill: new Fill({ color: TREE_COLOR }) });
const conflictFill = new Fill({ color: 'rgba(192, 57, 43, 0.12)' });
const selectedOutline = new Style({ stroke: selectedStroke });

function label(text: string, offsetY = 0): TextStyle {
  return new TextStyle({ text, offsetY, font: '600 12px sans-serif', fill: labelFill, stroke: labelHalo, overflow: true });
}

export function bedStyle(feature: FeatureLike, resolution: number): Style[] {
  const grid = bedGridStyle(feature, resolution);
  return grid ? [bedBaseStyle(feature, resolution), grid] : [bedBaseStyle(feature, resolution)];
}

function bedBaseStyle(feature: FeatureLike, resolution: number): Style {
  const { name } = getProps(feature);
  const area = (feature.getGeometry() as Polygon).getArea();
  // Šos uzliek GardenMap pēc izvēlētās sezonas stādījumiem
  const tint = feature.get('tint') as string | undefined;
  const plantLabel = feature.get('plantLabel') as string | undefined;

  return new Style({
    // Ja ir iekrāsotas šūnas, dobe gandrīz caurspīdīga, lai tās redz, bet uz dobes joprojām var uzklikšķināt
    fill: new Fill({ color: feature.get('hasCells') ? 'rgba(201, 167, 122, 0.15)' : tint ? `${tint}99` : 'rgba(201, 167, 122, 0.6)' }),
    stroke: bedStroke,
    text: resolution < 0.1 ? label([name ?? DEFAULT_NAME.BED, plantLabel, areaLabel(area)].filter(Boolean).join('\n')) : undefined,
  });
}

/** Te jau ir klāt izaugsme, ja lietotājs skatās dažus gadus uz priekšu */
export function shownCrownRadius(feature: FeatureLike): number {
  return (feature.get('shownRadiusM') as number | undefined) ?? crownRadius(feature);
}

/** Ja koks jau ir pilnā izmērā, pārklāšanos izceļ uz parastā apļa */
function matureCrown(center: number[], radius: number, mature: number | undefined, conflict: boolean): Style[] {
  if (mature && mature > radius) {
    return [
      new Style({
        geometry: new Circle(center, mature),
        fill: conflict ? conflictFill : undefined,
        stroke: new Stroke({ color: conflict ? CONFLICT_COLOR : TREE_COLOR, width: conflict ? 2 : 1.25, lineDash: [6, 5] }),
      }),
    ];
  }
  return conflict ? [new Style({ geometry: new Circle(center, radius), stroke: new Stroke({ color: CONFLICT_COLOR, width: 2.5 }) })] : [];
}

export function treeStyle(feature: FeatureLike, resolution: number): Style[] {
  const center = (feature.getGeometry() as Point).getCoordinates();
  const radius = shownCrownRadius(feature);
  const { name } = getProps(feature);
  // Šos uzliek GardenMap
  const mature = feature.get('matureRadiusM') as number | undefined;
  const conflict = feature.get('crownConflict') === true;
  const seasonColor = feature.get('seasonColor') as string | undefined;

  return [
    new Style({
      geometry: new Circle(center, radius),
      fill: new Fill({ color: seasonColor ? `${seasonColor}99` : 'rgba(61, 138, 75, 0.25)' }),
      stroke: treeStroke,
    }),
    ...matureCrown(center, radius, mature, conflict),
    ...treeIcon(feature, resolution),
    new Style({
      image: trunkImage,
      text: resolution < 0.1 ? label(name ?? DEFAULT_NAME.TREE, Math.max(radius, mature ?? 0) / resolution + 10) : undefined,
    }),
  ];
}

/** Ikona aug līdzi vainagam, bet nepaliek ne pārāk sīka, ne pārāk liela */
function treeIcon(feature: FeatureLike, resolution: number): Style[] {
  const url = feature.get('iconUrl') as string | undefined;
  if (!url || resolution >= 0.5) return [];
  const px = Math.max(16, Math.min(48, (shownCrownRadius(feature) / resolution) * 0.8));
  const img = olIcon(url, px);
  return img ? [new Style({ image: img, zIndex: 1 })] : [];
}

export function selectedStyle(feature: FeatureLike, resolution: number): Style[] {
  const geometry = feature.getGeometry();
  if (geometry instanceof Point) {
    return [
      ...treeStyle(feature, resolution),
      new Style({ geometry: new Circle(geometry.getCoordinates(), shownCrownRadius(feature)), stroke: selectedStroke }),
    ];
  }
  return [
    ...bedStyle(feature, resolution),
    selectedOutline,
    new Style({ geometry: new MultiPoint((geometry as Polygon).getCoordinates()[0]), image: vertexImage }),
  ];
}
