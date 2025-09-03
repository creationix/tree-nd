import { describe, it, expect } from 'bun:test';

import { BloomFilter } from '../src/bloom-filter.ts';

describe('BloomFilter', () => {
  it('should create a bloom filter with the correct shape', () => {
    const filter = new BloomFilter({
      n: 10000,
      p: 1e-7,
    });
    expect(filter).toHaveProperty('add');
    expect(filter).toHaveProperty('has');
    expect(filter.config).toEqual({
      n: 10000,
      p: 1e-7,
      m: 335496,
      k: 23,
    });
    expect(filter.filter).toBeInstanceOf(Uint8Array);
  });

  it('should never have false negatives', () => {
    const n = 10000;
    const p = 1e-7;
    const filter = new BloomFilter({ n, p });
    for (let i = 0; i < n; i++) {
      filter.add(`test-value-${i}`);
    }
    for (let i = 0; i < n; i++) {
      expect(filter.has(`test-value-${i}`)).toBe(true);
    }
  });

  it('should have acceptable false positive rate', () => {
    for (const n of [1e3, 1e4, 1e5]) {
      for (const p of [1e-2, 1e-4]) {
        let falsePositives = 0;
        const filter = new BloomFilter({ n, p });
        for (let i = 0; i < n; i++) {
          filter.add(`test-value-${i}`);
        }
        // verify no false negatives
        for (let i = 0; i < n; i++) {
          expect(filter.has(`test-value-${i}`)).toBe(true);
        }
        for (let i = n, l = 2 * n; i < l; i++) {
          if (filter.has(`test-value-${i}`)) {
            falsePositives++;
          }
        }
        const actualFalsePositiveRate = falsePositives / n;
        expect(actualFalsePositiveRate).toBeLessThanOrEqual(p * 5);
      }
    }
  });
});
