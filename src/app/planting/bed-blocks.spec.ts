import type { Plant } from './plant';
import {
  Block,
  bedShapeOf,
  blockDescription,
  blockFit,
  blockForPlant,
  blockInside,
  blocksOverlap,
  canPlace,
  capacity,
  clampToBounds,
  firstFreeBlock,
  plantCenters,
  plantingAreaM2,
  Pt,
  tryPlace,
} from './bed-blocks';

const spinach = { spacingCm: 15, rowSpacingCm: 30 } as Plant;
const square: Pt[] = [[0, 0], [2, 0], [2, 1], [0, 1], [0, 0]];
/** L forma, tas ir 2 × 2 bez augšējā labā stūra */
const lShape: Pt[] = [[0, 0], [2, 0], [2, 1], [1, 1], [1, 2], [0, 2], [0, 0]];

describe('bed-blocks', () => {
  it('counts plants in a block from spacing', () => {
    expect(blockFit(spinach, { x: 0, y: 0, w: 0.75, h: 0.9 })).toEqual({ cols: 5, rows: 3, total: 15 });
    expect(blockFit(spinach, { x: 0, y: 0, w: 0.1, h: 0.1 }).total).toBe(1);
    // bez atstatuma pieņem 30 cm
    expect(blockFit({} as Plant, { x: 0, y: 0, w: 0.6, h: 0.6 }).total).toBe(4);
  });

  it('creates a one-plant block centred on the drop point', () => {
    const b = blockForPlant(spinach, [1, 0.5]);
    expect(b.w).toBeCloseTo(0.15);
    expect(b.h).toBeCloseTo(0.3);
    expect(b.y).toBeCloseTo(0.35);
    expect(b.x).toBeCloseTo(0.95);
  });

  it('detects overlap but allows touching', () => {
    const a: Block = { x: 0, y: 0, w: 1, h: 1 };
    expect(blocksOverlap(a, { x: 1, y: 0, w: 1, h: 1 })).toBe(false);
    expect(blocksOverlap(a, { x: 0.9, y: 0.9, w: 1, h: 1 })).toBe(true);
  });

  it('checks the block is inside a concave bed', () => {
    expect(blockInside({ x: 0, y: 0, w: 2, h: 1 }, lShape)).toBe(true);
    expect(blockInside({ x: 1.2, y: 1.2, w: 0.5, h: 0.5 }, lShape)).toBe(false);
    // visi stūri iekšā, bet ieliektais dobes stūris iegriežas blokā
    expect(blockInside({ x: 0.5, y: 0.5, w: 1, h: 1 }, lShape)).toBe(false);
  });

  it('clamps and rejects invalid moves', () => {
    expect(clampToBounds({ x: -1, y: 0.9, w: 0.5, h: 0.5 }, 2, 1)).toEqual({ x: 0, y: 0.5, w: 0.5, h: 0.5 });
    const current: Block = { x: 0, y: 0, w: 0.5, h: 0.5 };
    const other: Block = { x: 1, y: 0, w: 0.5, h: 0.5 };
    expect(tryPlace(current, { x: 0.8, y: 0, w: 0.5, h: 0.5 }, square, [other], 2, 1)).toBe(current);
    expect(tryPlace(current, { x: 0.32, y: 0.01, w: 0.5, h: 0.5 }, square, [other], 2, 1).x).toBeCloseTo(0.3);
    expect(canPlace({ x: 0, y: 0, w: 0.01, h: 0.5 }, square, [])).toBe(false);
  });

  it('spreads plant centres evenly', () => {
    expect(plantCenters({ x: 0, y: 0, w: 1, h: 0.5 }, 2, 1)).toEqual([[0.25, 0.25], [0.75, 0.25]]);
  });

  it('computes used area and capacity levels', () => {
    expect(plantingAreaM2({ plantCount: 10 }, spinach)).toBeCloseTo(0.45);
    expect(plantingAreaM2({ blockW: 1, blockH: 0.5 }, spinach)).toBe(0.5);
    expect(plantingAreaM2({ cells: [1, 2] }, spinach, 0.09)).toBeCloseTo(0.18);
    expect(capacity(0.72, 1)).toEqual({ percent: 72, level: 'ok', label: 'Space used 72 %' });
    expect(capacity(0.9, 1)).toEqual({ percent: 90, level: 'tight', label: 'Tight · space used 90 %' });
    expect(capacity(1.2, 1)).toEqual({ percent: 120, level: 'over', label: 'Overcrowded · 120 %' });
  });

  it('finds the first free spot and describes blocks', () => {
    const shape = bedShapeOf([[10, 20], [12, 20], [12, 21], [10, 21], [10, 20]]);
    expect(shape.width).toBe(2);
    expect(shape.ring[2]).toEqual([2, 1]);
    expect(firstFreeBlock(spinach, shape, [])).toEqual({ x: 0, y: 0, w: 0.15, h: 0.3 });
    const next = firstFreeBlock(spinach, shape, [{ x: 0, y: 0, w: 0.5, h: 1 }])!;
    expect(next.x).toBeCloseTo(0.5);
    expect(firstFreeBlock(spinach, shape, [{ x: 0, y: 0, w: 2, h: 1 }])).toBeNull();
    expect(blockDescription('Spinach', 5, 3, 15, { x: 0.2, y: 0.4, w: 0.75, h: 0.9 })).toBe('Spinach, 5 × 3 plants, 15 total, at 20 cm, 40 cm');
  });
});
