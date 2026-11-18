import { Feature, Map as OlMap, Overlay } from 'ol';
import type { FeatureLike } from 'ol/Feature';
import { unByKey } from 'ol/Observable';
import { MultiLineString, MultiPoint, Point, Polygon } from 'ol/geom';
import { Circle as CircleStyle, Fill, Stroke, Style, Text as TextStyle } from 'ol/style';
import { blockFit, Block, plantCenters, Pt } from '../planting/bed-blocks';
import { BedFrame, bedFrameOf, rectToMap, toMap } from '../planting/bed-frame';
import { formatDate, Plant } from '../planting/plant';
import { Planting } from '../planting/planting-store';
import { DEFAULT_NAME, getProps } from './garden-map/garden-object';
import { olIcon, plantIconUrl } from '../ui/icons';
import { areaLabel } from './style-kit';

/** Tuvumā rādām dobes režģi un katru augu, bet no tālienes tikai krāsainu bloku, lai karte nebremzē */
export const DETAIL_RESOLUTION = 0.02;
/** Mazākas auga šūnas par šo (pikseļos) nav jēgas zīmēt ar ikonu */
const MIN_PLANT_PX = 7;
/** Ņem mazāko soli, pie kura līnijas ekrānā nesaplūst */
const GRID_STEPS_M = [0.1, 0.5, 1];
const MIN_GRID_PX = 10;

const gridStroke = new Stroke({ color: 'rgba(60, 45, 20, 0.28)', width: 0.75 });
const blockOutline = new Stroke({ color: 'rgba(255, 255, 255, 0.9)', width: 1 });

/** Horizontālās līnijas gabali, kas iekrīt dobes iekšpusē */
function clipRow(ring: Pt[], v: number): [number, number][] {
  const xs: number[] = [];
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x1, y1] = ring[j];
    const [x2, y2] = ring[i];
    if (y1 > v !== y2 > v) xs.push(x1 + ((v - y1) * (x2 - x1)) / (y2 - y1));
  }
  xs.sort((a, b) => a - b);
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < xs.length; i += 2) out.push([xs[i], xs[i + 1]]);
  return out;
}

/** Režģa līnijas abos virzienos, nogrieztas pa dobes malu */
export function bedGridLines(frame: BedFrame, step: number): number[][][] {
  const lines: number[][][] = [];
  const swapped = frame.ring.map(([x, y]) => [y, x] as Pt);
  for (let v = step; v < frame.height - 1e-6; v += step) {
    for (const [a, b] of clipRow(frame.ring, v)) lines.push([toMap(frame, [a, v]), toMap(frame, [b, v])]);
  }
  for (let u = step; u < frame.width - 1e-6; u += step) {
    for (const [a, b] of clipRow(swapped, u)) lines.push([toMap(frame, [u, a]), toMap(frame, [u, b])]);
  }
  return lines;
}

const gridCache = new WeakMap<object, { rev: number; step: number; geom: MultiLineString }>();

/** Režģis rādās tikai pietuvinot, no tālienes atgriež null */
export function bedGridStyle(feature: FeatureLike, resolution: number): Style | null {
  if (resolution >= DETAIL_RESOLUTION) return null;
  const polygon = feature.getGeometry() as Polygon | undefined;
  if (!polygon) return null;
  const step = GRID_STEPS_M.find((s) => s / resolution >= MIN_GRID_PX) ?? GRID_STEPS_M[GRID_STEPS_M.length - 1];
  const rev = polygon.getRevision();
  let cached = gridCache.get(feature);
  if (!cached || cached.rev !== rev || cached.step !== step) {
    const frame = bedFrameOf(polygon.getCoordinates()[0]);
    cached = { rev, step, geom: new MultiLineString(bedGridLines(frame, step)) };
    gridCache.set(feature, cached);
  }
  return new Style({ geometry: cached.geom, stroke: gridStroke });
}

/** Lietotāja ievadītais augu skaits, bet ne vairāk kā ietilpst */
function countIn(planting: Planting, plant: Plant | undefined, block: Block): { cols: number; rows: number; count: number } {
  const fit = blockFit(plant, block);
  return { cols: fit.cols, rows: fit.rows, count: Math.min(planting.plantCount ?? fit.total, fit.total) };
}

export function plantingTooltip(planting: Planting, plant: Plant | undefined, count?: number): string {
  const name = plant ? plant.nameEn : 'Planting';
  const lines = [planting.variety ? `${name} (${planting.variety})` : name];
  if (count) lines.push(`${count} plant${count === 1 ? '' : 's'}`);
  if (planting.sownOn) lines.push(`${plant?.sowMethod === 'DIRECT' ? 'Sown' : 'Planted'} ${formatDate(planting.sownOn)}`);
  return lines.join('\n');
}

/** No tālienes stādījums ir vienkāršs krāsains bloks, tuvumā redz šūnas un katru augu */
export function plantingBlockFeature(planting: Planting, plant: Plant | undefined, frame: BedFrame, block: Block, color: string, flatStyle: Style): Feature {
  const { cols, rows, count } = countIn(planting, plant, block);
  const feature = new Feature(new Polygon([rectToMap(frame, block.x, block.y, block.w, block.h)]));
  feature.set('tooltip', plantingTooltip(planting, plant, count));

  const lines: number[][][] = [];
  for (let c = 1; c < cols; c++) {
    const x = block.x + (c * block.w) / cols;
    lines.push([toMap(frame, [x, block.y]), toMap(frame, [x, block.y + block.h])]);
  }
  for (let r = 1; r < rows; r++) {
    const y = block.y + (r * block.h) / rows;
    lines.push([toMap(frame, [block.x, y]), toMap(frame, [block.x + block.w, y])]);
  }
  const centers = plantCenters(block, cols, rows).slice(0, count).map((p) => toMap(frame, p));
  const cellPx = Math.min(block.w / cols, block.h / rows);

  const base = new Style({ fill: new Fill({ color: `${color}55` }), stroke: blockOutline });
  const cellLines = new Style({ geometry: new MultiLineString(lines), stroke: new Stroke({ color: `${color}aa`, width: 0.75 }) });
  const points = new MultiPoint(centers);
  const dotFill = new Fill({ color });
  const dotStroke = new Stroke({ color: '#ffffff', width: 1 });
  const markers = new Map<number, Style>();
  const iconUrl = plantIconUrl(plant?.nameEn);

  feature.setStyle((_f, resolution) => {
    if (resolution >= DETAIL_RESOLUTION) return flatStyle;
    const px = cellPx / resolution;
    if (px < MIN_PLANT_PX) return [base, cellLines];
    const size = Math.max(8, Math.min(28, Math.round(px * 0.7)));
    let marker = markers.get(size);
    if (!marker) {
      // Kamēr ikona lādējas, rāda emocijzīmi un to nekešo, lai vēlāk nomainās uz ikonu
      const img = iconUrl ? olIcon(iconUrl, size) : null;
      marker = img
        ? new Style({ geometry: points, image: img })
        : plant?.icon
          ? new Style({ geometry: points, text: new TextStyle({ text: plant.icon, font: `${size}px sans-serif` }) })
          : new Style({ geometry: points, image: new CircleStyle({ radius: Math.max(2.5, size / 3), fill: dotFill, stroke: dotStroke }) });
      if (img || !iconUrl) markers.set(size, marker);
    }
    return lines.length ? [base, cellLines, marker] : [base, marker];
  });
  return feature;
}

/** Parastais padoms, dobei rāda arī laukumu */
export function defaultTooltip(feature: FeatureLike): string | undefined {
  const own = feature.get('tooltip') as string | undefined;
  if (own) return own;
  const geometry = feature.getGeometry();
  const type = feature.get('type') as string | undefined;
  if (type === 'BED' && geometry instanceof Polygon) {
    return `${getProps(feature).name ?? DEFAULT_NAME.BED}\n${areaLabel(geometry.getArea())}`;
  }
  if (type === 'TREE' && geometry instanceof Point) return getProps(feature).name ?? DEFAULT_NAME.TREE;
  const label = feature.get('label') as string | undefined;
  return label || undefined;
}

/** Padoms pie kursora, uz skārienekrāna to nerāda, jo tur nav kursora. Atgriež funkciju, kas to noņem. */
export function attachMapTooltip(map: OlMap, describe?: (feature: FeatureLike) => string | undefined): () => void {
  const el = document.createElement('div');
  el.className = 'map-tooltip';
  el.setAttribute('role', 'tooltip');
  Object.assign(el.style, {
    pointerEvents: 'none', whiteSpace: 'pre-line', background: 'rgba(255,255,255,0.96)', color: '#1b261c',
    font: '12px/1.35 sans-serif', padding: '4px 8px', borderRadius: '6px', boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
    display: 'none', maxWidth: '220px',
  } satisfies Partial<CSSStyleDeclaration>);
  const overlay = new Overlay({ element: el, offset: [14, 14], positioning: 'top-left', stopEvent: false });
  map.addOverlay(overlay);
  const hide = () => {
    el.style.display = 'none';
    overlay.setPosition(undefined);
  };

  const key = map.on('pointermove', (event) => {
    const pointerType = (event.originalEvent as PointerEvent).pointerType;
    if (event.dragging || pointerType === 'touch') return hide();
    let text: string | undefined;
    map.forEachFeatureAtPixel(event.pixel, (feature) => {
      text = describe?.(feature) ?? defaultTooltip(feature);
      return text ? true : undefined;
    }, { hitTolerance: 3 });
    if (!text) return hide();
    el.textContent = text;
    el.style.display = 'block';
    overlay.setPosition(event.coordinate);
  });
  const viewport = map.getViewport()!;
  viewport.addEventListener('pointerleave', hide);
  return () => {
    unByKey(key);
    viewport.removeEventListener('pointerleave', hide);
    map.removeOverlay(overlay);
  };
}

