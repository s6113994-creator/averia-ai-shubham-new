import { describe, expect, it } from 'vitest';
import { getPublicAtsScore, isAtsProRewardReady } from '@/lib/atsRewards';

describe('public-post ATS reward rules', () => {
  it('adds 10 ATS for each public post', () => {
    expect(getPublicAtsScore(1)).toBe(10);
    expect(getPublicAtsScore(49)).toBe(490);
  });

  it('makes the one-month Pro reward ready at 500 ATS', () => {
    expect(getPublicAtsScore(50)).toBe(500);
    expect(isAtsProRewardReady(499)).toBe(false);
    expect(isAtsProRewardReady(500)).toBe(true);
  });
});