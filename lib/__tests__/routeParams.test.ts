import { routeId } from '@/lib/routeParams';
import { describe, expect, it } from 'vitest';

describe('routeId', () => {
  it('normalizes string, array, encoded, and empty params', () => {
    expect(routeId('liv')).toBe('liv');
    expect(routeId(['p-liv-11', 'other'])).toBe('p-liv-11');
    expect(routeId('  fx-liv-ars  ')).toBe('fx-liv-ars');
    expect(routeId(encodeURIComponent('fx-liv-ars'))).toBe('fx-liv-ars');
    expect(routeId('')).toBeUndefined();
    expect(routeId('   ')).toBeUndefined();
    expect(routeId(undefined)).toBeUndefined();
    expect(routeId([])).toBeUndefined();
  });
});
