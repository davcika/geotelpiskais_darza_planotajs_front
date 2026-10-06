import type { ItemType } from '../item/item-api';
import { Block, snap, snapToCells } from './bed-blocks';
import { BedFrame, Pt, toLocal, toMap } from './bed-frame';

/** Bloka pārvietošana vai izmēra maiņa ar stūra vai malas rokturi */
export type Handle = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const round = (v: number) => Math.round(v * 100) / 100;

/** Elementa forma dobes rāmī, punkts kļūst par kvadrātu */
export function localFootprint(geoJson: string, type: ItemType, bf: BedFrame): Pt[] {
  const g = JSON.parse(geoJson) as { type: string; coordinates: unknown };
  if (g.type === 'Point') {
    const [u, v] = toLocal(bf, g.coordinates as number[]);
    const r = (type.defaultWM ?? 1) / 2;
    return [[u - r, v - r], [u + r, v - r], [u + r, v + r], [u - r, v + r]];
  }
  const pts = g.type === 'LineString' ? (g.coordinates as number[][])
    : g.type === 'Polygon' ? (g.coordinates as number[][][])[0]
    : g.type === 'MultiPolygon' ? (g.coordinates as number[][][][])[0][0] : [];
  return pts.map((p) => toLocal(bf, p));
}

export function boxOfPts(pts: Pt[]) {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

export function translateGeoJson(geoJson: string, dx: number, dy: number): string {
  const shift = (c: unknown): unknown =>
    Array.isArray(c) && typeof c[0] === 'number' ? [c[0] + dx, c[1] + dy, ...c.slice(2)] : Array.isArray(c) ? c.map(shift) : c;
  const g = JSON.parse(geoJson);
  return JSON.stringify({ ...g, coordinates: shift(g.coordinates) });
}

/** Pārbīde dobes rāmī, kartē tā pati pārbīde ir pagriezta */
export function translateInFrame(geoJson: string, bf: BedFrame, du: number, dv: number): string {
  const origin = toMap(bf, [0, 0]);
  const m = toMap(bf, [du, dv]);
  return translateGeoJson(geoJson, m[0] - origin[0], m[1] - origin[1]);
}

/** Noapaļo līdz centimetram, lai datubāzē nenonāk garas daļskaitļu astes */
export function blockFields(b: Block, angleDeg: number) {
  return { blockX: round(b.x), blockY: round(b.y), blockW: round(b.w), blockH: round(b.h), blockAngle: angleDeg };
}

export function sameBlock(a: Block, b: Block): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

/** Bloks pēc roktura pavilkšanas, izmērs mainās pa veselām šūnām un pretējā mala paliek uz vietas */
export function resized(b: Block, handle: Handle, dx: number, dy: number, [cx, cy]: Pt): Block {
  if (handle === 'move') return { ...b, x: round(snap(b.x + dx)), y: round(snap(b.y + dy)) };
  let { x, y, w, h } = b;
  if (handle.includes('e')) w = snapToCells(b.w + dx, cx);
  if (handle.includes('w')) {
    w = snapToCells(b.w - dx, cx);
    x = b.x + b.w - w;
  }
  if (handle.includes('n')) h = snapToCells(b.h + dy, cy);
  if (handle.includes('s')) {
    h = snapToCells(b.h - dy, cy);
    y = b.y + b.h - h;
  }
  return { x: round(x), y: round(y), w: round(w), h: round(h) };
}

/** Šūnu iekšējās līnijas blokā */
export function cellLines(x: number, y: number, w: number, h: number, cols: number, rows: number): string {
  const parts: string[] = [];
  for (let c = 1; c < cols; c++) parts.push(`M${(x + (c * w) / cols).toFixed(3)} ${y.toFixed(3)}v${h.toFixed(3)}`);
  for (let r = 1; r < rows; r++) parts.push(`M${x.toFixed(3)} ${(y + (r * h) / rows).toFixed(3)}h${w.toFixed(3)}`);
  return parts.join('');
}
