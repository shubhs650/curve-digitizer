import { describe, expect, it } from 'vitest';
import { evaluateFormula } from './excelFormula.ts';

describe('Excel formula evaluator', () => {
  it('follows Excel precedence: negation before ^, then * /, then + -', () => {
    expect(evaluateFormula('=-2^2')).toBe(4);
    expect(evaluateFormula('=0-2^2')).toBe(-4);
    expect(evaluateFormula('=2^-1')).toBe(0.5);
    expect(evaluateFormula('=2^3^2')).toBe(64);
    expect(evaluateFormula('=1+2*3-4/2')).toBe(5);
    expect(evaluateFormula('=(1+2)*3')).toBe(9);
  });

  it('keeps 15 significant digits of typed numbers', () => {
    expect(evaluateFormula('=0.12345678901234567')).toBe(0.123456789012346);
    expect(evaluateFormula('={1.5E-7,-2}')).toEqual([1.5e-7, -2]);
  });

  it('reads cells, binds LET names and rejects names Excel would reject', () => {
    expect(evaluateFormula('=LET(x,$A$2,u,x*2,u+1)', { A2: 3 })).toBe(7);
    expect(() => evaluateFormula('=LET(r,1,r)')).toThrow(SyntaxError);
    expect(() => evaluateFormula('=LET(s2,1,s2)')).toThrow(SyntaxError);
    expect(() => evaluateFormula('=y+1')).toThrow(ReferenceError);
    expect(() => evaluateFormula('=SINH(1)')).toThrow(SyntaxError);
  });

  it('looks up tables with MATCH(…, 1), INDEX and IFERROR', () => {
    const t = '{0,1.5,4}';
    expect(evaluateFormula(`=MATCH(1.5,${t},1)`)).toBe(2);
    expect(evaluateFormula(`=MATCH(9,${t},1)`)).toBe(3);
    expect(evaluateFormula(`=MATCH(-1,${t},1)`)).toEqual({ error: '#N/A' });
    expect(evaluateFormula(`=IFERROR(MATCH(-1,${t},1),1)`)).toBe(1);
    expect(evaluateFormula(`=INDEX(${t},3)`)).toBe(4);
    expect(evaluateFormula(`=INDEX(${t},4)`)).toEqual({ error: '#REF!' });
    expect(evaluateFormula('=MIN(3,2,7)+MAX(1,5)')).toBe(7);
  });

  it('turns undefined maths into errors that propagate, and N(text) into 0', () => {
    expect(evaluateFormula('=LOG10(0)+1')).toEqual({ error: '#NUM!' });
    expect(evaluateFormula('=LN(-1)')).toEqual({ error: '#NUM!' });
    expect(evaluateFormula('=1/0')).toEqual({ error: '#DIV/0!' });
    expect(evaluateFormula('=10^400')).toEqual({ error: '#NUM!' });
    expect(evaluateFormula('=EXP(1)+N("a ""note""")')).toBe(Math.E);
  });
});
