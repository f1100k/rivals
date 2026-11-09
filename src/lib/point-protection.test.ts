import { describe, expect, it } from 'vitest';
import { DAILY_REFRESH_MS, TROLLING_EXTRA, dailyRefresh, rankActivators } from './point-protection';
describe('competitive protection rules', () => {
  it('daily refill happens exactly at 24 hours', () => {
    expect(dailyRefresh(false, DAILY_REFRESH_MS, DAILY_REFRESH_MS - 1).available).toBe(false);
    expect(dailyRefresh(false, DAILY_REFRESH_MS, DAILY_REFRESH_MS)).toEqual({ available: true, nextAt: 2 * DAILY_REFRESH_MS, granted: 1 });
  });
  it('unused daily activators never accumulate', () => expect(dailyRefresh(true, DAILY_REFRESH_MS, 10 * DAILY_REFRESH_MS).granted).toBe(0));
  it('several missed days still grant only one activator', () => expect(dailyRefresh(false, DAILY_REFRESH_MS, 10 * DAILY_REFRESH_MS).granted).toBe(1));
  it('a named rank promotion grants one independent activator', () => expect(rankActivators(0, 300)).toBe(1));
  it('a division promotion does not grant a named-rank activator', () => expect(rankActivators(0, 100)).toBe(0));
  it('repeat promotions cannot farm rewards', () => expect(rankActivators(2, 600)).toBe(0));
  it('crossing several new named ranks grants all rewards', () => expect(rankActivators(0, 900)).toBe(3));
  it('confirmed trolling adds 9 to the normal 19 loss', () => expect(-19 + TROLLING_EXTRA).toBe(-28));
});