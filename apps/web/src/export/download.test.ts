import { describe, expect, it } from 'vitest';
import { safeFileName } from './download';

describe('safeFileName', () => {
  it('replaces reserved characters and trims', () => {
    expect(safeFileName('Pump A <250 mm>: "rev B"', 'csv')).toBe('Pump A -250 mm-- -rev B-.csv');
    expect(safeFileName('  a/b\\c  ', 'xlsx')).toBe('a-b-c.xlsx');
    expect(safeFileName('dots...', 'json')).toBe('dots.json');
    expect(safeFileName('', 'csv')).toBe('export.csv');
    expect(safeFileName('x'.repeat(300), 'csv')).toHaveLength(124);
  });
});
