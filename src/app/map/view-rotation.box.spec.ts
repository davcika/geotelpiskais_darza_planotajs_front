import { screenAlignedBox } from './view-rotation';

describe('screenAlignedBox', () => {
  it('is axis-aligned without rotation', () => {
    expect(screenAlignedBox([0, 0], [2, 1], 0)).toEqual([[0, 0], [2, 0], [2, 1], [0, 1], [0, 0]]);
  });

  it('keeps the dragged corners and right angles when rotated', () => {
    const ring = screenAlignedBox([0, 0], [3, 1], 0.4);
    expect(ring[0][0]).toBeCloseTo(0);
    expect(ring[2][0]).toBeCloseTo(3);
    expect(ring[2][1]).toBeCloseTo(1);
    const a = [ring[1][0] - ring[0][0], ring[1][1] - ring[0][1]];
    const b = [ring[3][0] - ring[0][0], ring[3][1] - ring[0][1]];
    expect(a[0] * b[0] + a[1] * b[1]).toBeCloseTo(0);
  });
});
