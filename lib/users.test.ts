import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ getSql: vi.fn() }));

import { generateTempPassword } from './users';

// The alphabet is deliberately free of look-alikes (0/O, 1/l/I).
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

describe('generateTempPassword', () => {
  it('returns 12 characters drawn only from the alphabet', () => {
    for (let i = 0; i < 200; i++) {
      const pw = generateTempPassword();
      expect(pw).toHaveLength(12);
      for (const ch of pw) expect(ALPHABET).toContain(ch);
    }
  });

  it('does not repeat itself', () => {
    const seen = new Set(Array.from({ length: 500 }, () => generateTempPassword()));
    expect(seen.size).toBe(500);
  });

  // Regression test for CodeQL js/biased-cryptographic-random (lib/users.ts).
  // `randomByte % 55` over-represents the first 256 % 55 = 36 characters by ~25%
  // (5/256 vs 4/256 each). Pearson chi-square over the 55 characters, df = 54:
  //   unbiased  -> about 54 (5-sigma bound is well under 130)
  //   old code  -> about 1000 at this sample size
  // so a threshold of 130 catches the bias and false-fails with p < 1e-6.
  it('picks every character with equal probability (no modulo bias)', () => {
    const passwords = 10_000;
    const counts = new Map<string, number>(Array.from(ALPHABET, (c) => [c, 0]));
    for (let i = 0; i < passwords; i++) {
      for (const ch of generateTempPassword()) counts.set(ch, counts.get(ch)! + 1);
    }
    const total = passwords * 12;
    const expected = total / ALPHABET.length;
    let chiSquare = 0;
    for (const observed of counts.values()) chiSquare += (observed - expected) ** 2 / expected;

    expect(chiSquare).toBeLessThan(130);
  });
});
