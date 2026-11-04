import { Feature } from 'ol';
import type { FeatureLike } from 'ol/Feature';
import GeoJSON from 'ol/format/GeoJSON';
import { LineString, MultiPoint, Point, Polygon } from 'ol/geom';
import { Circle as CircleStyle, Fill, RegularShape, Stroke, Style, Text as TextStyle } from 'ol/style';
import type { GardenItem, ItemType } from '../../item/item-api';
import { formatNumber } from '../../shared/format';
import { itemIconUrl, olIcon } from '../../ui/icons';
import { labelFill, labelHalo, SELECTED_COLOR, selectedStroke, vertexImage } from '../style-kit';

/** No dobēm un kokiem elementu atšķir pēc kind lauka */
export const ITEM_KIND = 'ITEM';
const geoJson = new GeoJSON();

export function isItemFeature(feature: FeatureLike | null | undefined): boolean {
  return !!feature && feature.get('kind') === ITEM_KIND;
}

export function itemToFeature(item: GardenItem): Feature {
  const feature = new Feature({ geometry: geoJson.readGeometry(item.geometry) ?? undefined });
  feature.setProperties({ kind: ITEM_KIND, itemId: item.id, typeKey: item.typeKey, label: item.label, rotationDeg: item.rotationDeg });
  return feature;
}

export function itemGeometryJson(feature: Feature): string {
  return geoJson.writeGeometry(feature.getGeometry()!);
}

/** Siltumnīcas un citi segumi izskatās kā gaiši zils stikls */
function colors(type: ItemType | undefined): { fill: string; stroke: string } {
  switch (type?.category) {
    case 'PROTECTION':
      return { fill: 'rgba(173, 216, 240, 0.45)', stroke: '#5aa0c8' };
    case 'WATERING':
      return { fill: 'rgba(66, 135, 245, 0.25)', stroke: '#2f6fd1' };
    case 'SUPPORT':
      return { fill: 'rgba(139, 94, 52, 0.2)', stroke: '#8b5e34' };
    case 'STRUCTURE':
      return { fill: 'rgba(120, 120, 120, 0.25)', stroke: '#5d5d5d' };
    default:
      return { fill: 'rgba(160, 130, 90, 0.25)', stroke: '#7d5c36' };
  }
}

export function itemStyleFn(typeOf: (key: string) => ItemType | undefined, selected = false) {
  return (feature: FeatureLike, resolution: number): Style[] => {
    const type = typeOf(feature.get('typeKey') as string);
    const { fill, stroke } = colors(type);
    const geometry = feature.getGeometry();
    const icon = type?.icon ?? '◆';
    const url = itemIconUrl(type?.key ?? (feature.get('typeKey') as string));
    // Kamēr ikona nav ielādēta, rāda emocijzīmi
    const image = (px: number) => (url ? olIcon(url, px) : null);
    const name = (feature.get('label') as string | null) || type?.nameEn || 'Item';
    const showName = resolution < 0.08;
    const k = iconScale(resolution);
    const styles: Style[] = [];
    const highlight = selected ? selectedStroke : undefined;

    if (geometry instanceof LineString) {
      const length = geometry.getLength();
      const fence = isFenceType(type, feature.get('typeKey') as string);
      const drip = !fence && type?.category === 'WATERING';
      const plain = !fence && !drip;
      if (fence) styles.push(...fenceStyles(geometry, resolution, !!highlight));
      if (drip) styles.push(...dripStyles(geometry, resolution));
      if (plain) styles.push(new Style({ stroke: new Stroke({ color: '#ffffff', width: highlight ? 7 : 5 }) }));
      styles.push(
        new Style({
          stroke: plain ? new Stroke({ color: stroke, width: 3 }) : undefined,
          text: new TextStyle({
            text: image(16) ? `${formatNumber(length)} m` : `${icon} ${formatNumber(length)} m`,
            placement: 'line',
            font: '600 12px sans-serif',
            fill: labelFill,
            stroke: labelHalo,
            overflow: true,
          }),
        }),
      );
      const lineIcon = image(18);
      if (lineIcon) styles.push(new Style({ geometry: new Point(geometry.getCoordinateAt(0.5)), image: lineIcon }));
      if (highlight) {
        styles.push(new Style({ geometry: new MultiPoint(geometry.getCoordinates()), image: vertexImage }));
      }
      return styles;
    }

    if (geometry instanceof Polygon) {
      styles.push(
        new Style({ fill: new Fill({ color: fill }), stroke: highlight ?? new Stroke({ color: stroke, width: 1.5 }) }),
        // Tieva balta līnija iekšpusē izskatās kā stikla atspīdums
        ...(type?.category === 'PROTECTION' ? [new Style({ stroke: new Stroke({ color: 'rgba(255,255,255,0.8)', width: 1, lineDash: [2, 6] }) })] : []),
        areaIcon(geometry.getInteriorPoint(), image(20 * k), icon, k, showName),
      );
      if (showName) {
        // Nosaukums nedrīkst būt platāks par pašu elementu ekrānā
        const [x0, , x1] = geometry.getExtent();
        const widthPx = (x1 - x0) / resolution;
        const size = Math.max(9, Math.min(11 * Math.min(k, 1.6), (widthPx / Math.max(4, name.length)) * 1.6));
        styles.push(new Style({
          geometry: geometry.getInteriorPoint(),
          text: new TextStyle({ text: name, offsetY: 10 * k, font: `600 ${Math.round(size)}px sans-serif`, fill: labelFill,
            stroke: new Stroke({ color: 'rgba(255,255,255,0.8)', width: 3 }), overflow: true }),
        }));
      }
      if (highlight) {
        styles.push(new Style({ geometry: new MultiPoint(geometry.getCoordinates()[0]), image: vertexImage }));
      }
      return styles;
    }

    if (geometry instanceof Point) {
      const pointIcon = image(20 * k);
      styles.push(
        new Style({
          image: new CircleStyle({ radius: 13 * k, fill: new Fill({ color: 'rgba(255,255,255,0.85)' }), stroke: highlight ?? new Stroke({ color: stroke, width: 1.5 }) }),
          text: pointIcon ? undefined : new TextStyle({ text: icon, font: `${Math.round(16 * k)}px sans-serif` }),
        }),
        ...(pointIcon ? [new Style({ image: pointIcon })] : []),
      );
      if (showName) {
        styles.push(new Style({
          text: new TextStyle({ text: name, offsetY: 22 * k, font: `600 ${Math.round(11 * Math.min(k, 1.6))}px sans-serif`, fill: labelFill,
            stroke: labelHalo }),
        }));
      }
    }
    return styles;
  };
}

/** Pietuvinot ikonas kļūst lielākas, bet tikai līdz zināmai robežai */
const ICON_REF_RESOLUTION = 0.05;
function iconScale(resolution: number): number {
  return Math.max(0.6, Math.min(3, ICON_REF_RESOLUTION / resolution));
}

function areaIcon(point: Point, img: ReturnType<typeof olIcon>, emoji: string, k: number, showName: boolean): Style {
  if (img) {
    img.setDisplacement([0, showName ? 6 * k : 0]);
    return new Style({ geometry: point, image: img });
  }
  return new Style({
    geometry: point,
    text: new TextStyle({ text: emoji, font: `${Math.round(16 * k)}px sans-serif`, offsetY: showName ? -6 * k : 0, overflow: true }),
  });
}

/** Dzīvžogs nav žogs, to zīmē citādi */
export function isFenceType(type: ItemType | undefined, key: string | undefined): boolean {
  const text = `${type?.key ?? key ?? ''} ${type?.nameEn ?? ''}`.toLowerCase();
  return text.includes('fence') || text.includes('zogs');
}

/** Punkti vienādos attālumos gar līniju, katram līdzi tā gabala leņķis */
export function pointsAlong(line: LineString, step: number, offset = 0): { at: number[]; angle: number }[] {
  const coords = line.getCoordinates();
  const out: { at: number[]; angle: number }[] = [];
  let next = offset;
  let walked = 0;
  for (let i = 0; i + 1 < coords.length; i++) {
    const [x0, y0] = coords[i];
    const [x1, y1] = coords[i + 1];
    const len = Math.hypot(x1 - x0, y1 - y0);
    const angle = Math.atan2(y1 - y0, x1 - x0);
    while (len > 0 && next <= walked + len + 1e-9) {
      const t = (next - walked) / len;
      out.push({ at: [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t], angle });
      next += step;
      if (out.length > 5000) return out;
    }
    walked += len;
  }
  return out;
}

const FENCE_POST_STEP_M = 2;
const FENCE_PICKET_STEP_M = 0.2;

/** Žogs no augšas ar stabiem ik pa diviem metriem, tuvumā redz arī štaketes */
function fenceStyles(line: LineString, resolution: number, selected: boolean): Style[] {
  const railPx = Math.max(2, Math.min(8, 0.08 / resolution));
  const styles: Style[] = [
    ...(selected ? [new Style({ stroke: new Stroke({ color: SELECTED_COLOR, width: railPx + 6 }) })] : []),
    new Style({ stroke: new Stroke({ color: '#6b4423', width: railPx + 2 }) }),
    new Style({ stroke: new Stroke({ color: '#c49a6c', width: Math.max(1, railPx - 1.5) }) }),
  ];
  if (FENCE_PICKET_STEP_M / resolution >= 5) {
    const half = Math.max(3, 0.06 / resolution);
    for (const { at, angle } of pointsAlong(line, FENCE_PICKET_STEP_M, FENCE_PICKET_STEP_M / 2)) {
      styles.push(new Style({ geometry: new Point(at), image: new RegularShape({ points: 2, radius: half, rotation: -angle, rotateWithView: true, stroke: new Stroke({ color: '#8b5e34', width: 1.5 }) }) }));
    }
  }
  if (FENCE_POST_STEP_M / resolution >= 8) {
    const r = Math.max(3, Math.min(9, 0.07 / resolution));
    for (const { at, angle } of pointsAlong(line, FENCE_POST_STEP_M)) {
      styles.push(new Style({ geometry: new Point(at), image: new RegularShape({ points: 4, radius: r, angle: Math.PI / 4, rotation: -angle, rotateWithView: true, fill: new Fill({ color: '#4e3118' }), stroke: new Stroke({ color: '#2e1c0c', width: 1 }) }) }));
    }
    const ends = line.getCoordinates();
    for (const at of [ends[0], ends[ends.length - 1]]) {
      styles.push(new Style({ geometry: new Point(at), image: new RegularShape({ points: 4, radius: r, angle: Math.PI / 4, fill: new Fill({ color: '#4e3118' }) }) }));
    }
  }
  return styles;
}

/** Tuvumā pilienu caurulei redz arī pilinātāju punktus */
function dripStyles(line: LineString, resolution: number): Style[] {
  const styles = [new Style({ stroke: new Stroke({ color: '#1f4fa0', width: 2.5 }) })];
  if (0.3 / resolution >= 6) {
    const dot = new CircleStyle({ radius: 2, fill: new Fill({ color: '#7fb3ff' }), stroke: new Stroke({ color: '#1f4fa0', width: 1 }) });
    styles.push(new Style({ geometry: new MultiPoint(pointsAlong(line, 0.3, 0.15).map((p) => p.at)), image: dot }));
  }
  return styles;
}
