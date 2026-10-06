import { Plant, spacingM } from './plant';
import { BedFrame, bedFrameOf, Pt, toLocal, toMap } from './bed-frame';

export type { Pt } from './bed-frame';

/** Stādījuma bloks ir taisnstūris metros dobes rāmī, un backend BlockRules.java tur tos pašus noteikumus */
export interface Block {
  x: number;
  y: number;
  w: number;
  h: number;
}


export const SNAP_M = 0.05;
/** Ja atstatums nav zināms, pieņem 30 cm kā kvadrātu metodē */
export const DEFAULT_SPACING_M = 0.3;
/** Lielus augus kā ķirbjus rāda ar apli ap aizņemto vietu */
export const LARGE_PLANT_M = 0.6;
const EPS = 1e-6;
const round2 = (v: number) => Math.round(v * 100) / 100;
/** Pozīcijas solis, lai bloki pieguļ viens otram, un zīmētā režģa solis */
export const BASE_M = SNAP_M;
export const GRID_MINOR_M = 0.1;

export const snap = (v: number) => Math.round(v / SNAP_M) * SNAP_M;

/** Atstatumi metros rindā un starp rindām, ar noklusējumu */
export function spacingOf(plant: Plant | undefined): Pt {
  return (plant && spacingM(plant)) || [DEFAULT_SPACING_M, DEFAULT_SPACING_M];
}

/** Viena auga šūnas izmērs metros, noapaļots līdz centimetram */
export function cellOf(plant: Plant | undefined): Pt {
  const [sx, sy] = spacingOf(plant);
  return [Math.max(0.01, round2(sx)), Math.max(0.01, round2(sy))];
}

/** Garums, noapaļots līdz veselām šūnām, vismaz vienai */
export function snapToCells(v: number, cell: number): number {
  return round2(Math.max(1, Math.round(v / cell + EPS)) * cell);
}

/** Cik kolonnu un rindu augu ietilpst blokā */
export function blockFit(plant: Plant | undefined, block: Block): { cols: number; rows: number; total: number } {
  const [sx, sy] = cellOf(plant);
  const cols = Math.max(1, Math.floor(block.w / sx + 1e-4));
  const rows = Math.max(1, Math.floor(block.h / sy + 1e-4));
  return { cols, rows, total: cols * rows };
}

/** Jauns bloks ap punktu, pievilkts pamata režģim */
export function blockForPlant(plant: Plant | undefined, center: Pt, cols = 1, rows = 1): Block {
  const [sx, sy] = cellOf(plant);
  const w = round2(sx * cols);
  const h = round2(sy * rows);
  return { x: round2(snap(center[0] - w / 2)), y: round2(snap(center[1] - h / 2)), w, h };
}

export function blocksOverlap(a: Block, b: Block): boolean {
  return a.x + EPS < b.x + b.w && b.x + EPS < a.x + a.w && a.y + EPS < b.y + b.h && b.y + EPS < a.y + a.h;
}

/** Punkts uz malas arī skaitās iekšā */
export function pointInPolygon([px, py]: Pt, ring: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (onSegment([px, py], ring[i], ring[j])) return true;
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function onSegment([px, py]: Pt, [ax, ay]: Pt, [bx, by]: Pt): boolean {
  const cross = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
  if (Math.abs(cross) > 1e-9) return false;
  return px >= Math.min(ax, bx) - EPS && px <= Math.max(ax, bx) + EPS && py >= Math.min(ay, by) - EPS && py <= Math.max(ay, by) + EPS;
}

/** Pārbauda arī dobes virsotnes, lai noķertu ieliektus robus, kas iegriežas blokā */
export function blockInside(block: Block, ring: Pt[]): boolean {
  const { x, y, w, h } = block;
  const corners: Pt[] = [
    [x + EPS, y + EPS],
    [x + w - EPS, y + EPS],
    [x + w - EPS, y + h - EPS],
    [x + EPS, y + h - EPS],
  ];
  if (!corners.every((c) => pointInPolygon(c, ring))) return false;
  return !ring.some(([vx, vy]) => vx > x + EPS && vx < x + w - EPS && vy > y + EPS && vy < y + h - EPS);
}

/** Bloks der, ja ir dobē, nepārklājas un nav mazāks par 5 cm */
export function canPlace(block: Block, ring: Pt[], others: Block[]): boolean {
  return block.w >= SNAP_M - EPS && block.h >= SNAP_M - EPS && blockInside(block, ring) && !others.some((o) => blocksOverlap(block, o));
}

/** Iebīda bloku dobes rāmī, ja var, nemainot izmēru */
export function clampToBounds(block: Block, width: number, height: number): Block {
  const w = Math.min(block.w, width);
  const h = Math.min(block.h, height);
  return { x: Math.min(Math.max(0, block.x), width - w), y: Math.min(Math.max(0, block.y), height - h), w, h };
}

/** Ja jaunais bloks neder, paliek vecais, lai bloks nelēkā */
export function tryPlace(current: Block, wanted: Block, ring: Pt[], others: Block[], width: number, height: number, cell?: Pt): Block {
  const fit = (v: number, max: number, c?: number) =>
    c ? Math.min(snapToCells(v, c), round2(Math.max(1, Math.floor(max / c + 1e-4)) * c)) : snap(v);
  const sized = { x: snap(wanted.x), y: snap(wanted.y), w: fit(wanted.w, width, cell?.[0]), h: fit(wanted.h, height, cell?.[1]) };
  const c = clampToBounds(sized, width, height);
  const snapped = { x: round2(c.x), y: round2(c.y), w: c.w, h: c.h };
  return canPlace(snapped, ring, others) ? snapped : current;
}

/** Augu centri vienmērīgi pa bloku */
export function plantCenters(block: Block, cols: number, rows: number): Pt[] {
  const points: Pt[] = [];
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      points.push([block.x + ((c + 0.5) * block.w) / cols, block.y + ((r + 0.5) * block.h) / rows]);
    }
  }
  return points;
}

/** Aizņemtā vieta m² pēc augiem, bloka vai šūnām, ko nu var zināt */
export function plantingAreaM2(
  planting: { plantCount?: number | null; blockW?: number | null; blockH?: number | null; cells?: unknown[] },
  plant: Plant | undefined,
  cellAreaM2 = 0,
): number {
  const [sx, sy] = spacingOf(plant);
  if (planting.plantCount) return planting.plantCount * sx * sy;
  if (planting.blockW && planting.blockH) return planting.blockW * planting.blockH;
  return (planting.cells?.length ?? 0) * cellAreaM2;
}

export type CapacityLevel = 'ok' | 'tight' | 'over';

/** Līdz 85 % zaļš, līdz 100 % dzeltens, virs tā sarkans */
export function capacity(usedM2: number, bedM2: number): { percent: number; level: CapacityLevel; label: string } {
  const percent = bedM2 > 0 ? Math.round((usedM2 / bedM2) * 100) : 0;
  const level: CapacityLevel = percent > 100 ? 'over' : percent >= 85 ? 'tight' : 'ok';
  const label = level === 'over' ? `Overcrowded · ${percent} %` : level === 'tight' ? `Tight · space used ${percent} %` : `Space used ${percent} %`;
  return { percent, level, label };
}

/** Dobes forma tās rāmī bloku pārbaudēm */
export type BedShape = BedFrame;

/** Dobes forma no kartes kontūras ar tādu pašu leņķi kā dobes lapā */
export function bedShapeOf(ring: number[][]): BedShape {
  return bedFrameOf(ring);
}

/** Ja bloks saglabāts citā leņķī, to pārliek jaunajā rāmī ar to pašu centru un izmēru */
export function blockInFrame(block: Block, storedAngleDeg: number | null | undefined, frame: BedFrame): Block {
  const angle = storedAngleDeg ?? 0;
  if (Math.abs(angle - frame.angleDeg) < 1e-9) return block;
  const old = bedFrameOf(frame.mapRing, angle);
  const [cx, cy] = toLocal(frame, toMap(old, [block.x + block.w / 2, block.y + block.h / 2]));
  return { ...block, x: snap(cx - block.w / 2), y: snap(cy - block.h / 2) };
}


/** Meklē pirmo brīvo vietu no dienvidrietumu stūra, null nozīmē vietas nav */
export function firstFreeBlock(plant: Plant | undefined, shape: BedShape, others: Block[]): Block | null {
  const proto = blockForPlant(plant, [0, 0]);
  for (let y = 0; y + proto.h <= shape.height + 1e-9; y += SNAP_M) {
    for (let x = 0; x + proto.w <= shape.width + 1e-9; x += SNAP_M) {
      const block = { x: round2(x), y: round2(y), w: round2(proto.w), h: round2(proto.h) };
      if (canPlace(block, shape.ring, others)) return block;
    }
  }
  return null;
}

/** Bloka apraksts ekrāna lasītājam */
export function blockDescription(name: string, cols: number, rows: number, count: number, block: Block): string {
  const cm = (m: number) => Math.round(m * 100);
  return `${name}, ${cols} × ${rows} plants, ${count} total, at ${cm(block.x)} cm, ${cm(block.y)} cm`;
}
