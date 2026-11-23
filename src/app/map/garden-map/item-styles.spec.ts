import { LineString } from 'ol/geom';
import { isFenceType, pointsAlong } from './item-styles';

describe('fence styling helpers', () => {
  it('places posts every step along a polyline', () => {
    const pts = pointsAlong(new LineString([[0, 0], [3, 0], [3, 3]]), 2);
    expect(pts.map((p) => p.at)).toEqual([[0, 0], [2, 0], [3, 1], [3, 3]]);
    expect(pts[2].angle).toBeCloseTo(Math.PI / 2);
  });

  it('recognises fences by key', () => {
    expect(isFenceType(undefined, 'WOODEN_FENCE')).toBe(true);
    expect(isFenceType(undefined, 'DRIP_LINE')).toBe(false);
  });
});
