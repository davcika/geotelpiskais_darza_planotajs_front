import { bedPairs, CompanionPair, neighboursOf } from './companions';

const PAIRS: CompanionPair[] = [
  { plantAId: 1, plantBId: 2, relation: 'GOOD' },
  { plantAId: 1, plantBId: 3, relation: 'BAD' },
  { plantAId: 4, plantBId: 5, relation: 'BAD' },
];

describe('bedPairs', () => {
  it('returns only pairs where both plants are in the bed, bad first', () => {
    expect(bedPairs([1, 2, 3], PAIRS)).toEqual([
      { a: 1, b: 3, relation: 'BAD' },
      { a: 1, b: 2, relation: 'GOOD' },
    ]);
  });

  it('ignores a single plant and duplicates', () => {
    expect(bedPairs([1, 1, 4], PAIRS)).toEqual([]);
  });
});

describe('neighboursOf', () => {
  it('finds bad neighbours in either pair direction', () => {
    expect(neighboursOf(3, [1, 2, 3], PAIRS)).toEqual([1]);
    expect(neighboursOf(1, [1, 2, 3], PAIRS)).toEqual([3]);
  });

  it('ignores plants not in the bed and good pairs', () => {
    expect(neighboursOf(1, [1, 2], PAIRS)).toEqual([]);
    expect(neighboursOf(4, [4], PAIRS)).toEqual([]);
    expect(neighboursOf(1, [1, 2, 3], PAIRS, 'GOOD')).toEqual([2]);
  });
});
