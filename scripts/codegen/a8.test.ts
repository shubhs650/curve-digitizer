// A8 (docs/ACCEPTANCE_TARGETS.md): the generated Python, JavaScript, C and Excel code computes the in-app fit
// within 1e-9 relative at 50 X values. Python, JavaScript and C are run (on CI they must run: the runner has
// python3 and a C compiler, and NumPy is installed into a throwaway venv when the system Python lacks it;
// elsewhere a missing tool skips its language); Excel goes through the formula evaluator. VBA and
// MATLAB are compared as text with golden files in packages/fit (codegen.test.ts) and spot-checked by hand.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { type CodeFit, evaluateFit, generateCode, identifier, recommendFits } from '@cd/fit';
import { formulaNumber } from './excelFormula.ts';

const RELATIVE = 1e-9;
const COUNT = 50;

interface Case {
  readonly label: string;
  readonly fit: CodeFit;
  /** Names the generated function, unique per case. */
  readonly datasetName: string;
  readonly xs: readonly number[];
  readonly expected: readonly number[];
}

/** 50 x values across the fit's domain, evenly spaced in fit space (as the curve is drawn). */
function xsOf(fit: CodeFit): number[] {
  const [lo, hi] = fit.domain;
  const log = fit.space.x === 'log';
  const a = log ? Math.log10(lo) : lo;
  const b = log ? Math.log10(hi) : hi;
  return Array.from({ length: COUNT }, (_, i) => {
    const s = a + ((b - a) * i) / (COUNT - 1);
    return log ? 10 ** s : s;
  });
}

function caseOf(label: string, fit: CodeFit, index: number): Case {
  const xs = xsOf(fit);
  return {
    label,
    fit,
    datasetName: `case ${String(index)}`,
    xs,
    expected: xs.map((x) => evaluateFit(fit, x).y),
  };
}

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`../../packages/fit/fixtures/${name}`, import.meta.url), 'utf8'));
}

interface RecommendCase {
  readonly name: string;
  readonly axes: { readonly x: string; readonly y: string };
  readonly x: readonly number[];
  readonly y: readonly number[];
}

const handWritten = (
  fixture('codegen-fits.json') as { fits: readonly { name: string; fit: CodeFit }[] }
).fits.map((e) => ({
  label: e.name,
  fit: e.fit,
}));

/** Every candidate the recommender fits on the A7 fixtures: real parameters, up to 16 knots and degree 9. */
const recommended = (fixture('recommend.json') as { cases: readonly RecommendCase[] }).cases.flatMap((c) => {
  const space = { x: c.axes.x === 'log10' ? 'log' : 'lin', y: c.axes.y === 'log10' ? 'log' : 'lin' } as const;
  return recommendFits(c.x, c.y, space).fits.map((fit) => ({
    label: `${c.name}: ${fit.model} (${String(fit.k)} params)`,
    fit,
  }));
});

const CASES: readonly Case[] = [...handWritten, ...recommended].map((c, i) => caseOf(c.label, c.fit, i));

/** Worst relative difference over a case's x values; points where the app gives NaN must give NaN too. */
function worst(expected: readonly number[], actual: readonly number[]): number {
  return expected.reduce((max, e, i) => {
    const a = actual[i] ?? Number.NaN;
    if (Number.isNaN(e)) return Number.isNaN(a) ? max : Infinity;
    return Math.max(max, Math.abs(a - e) / Math.max(Math.abs(e), Number.MIN_VALUE));
  }, 0);
}

function expectAgreement(language: string, results: readonly (readonly number[])[]): void {
  const failures = CASES.flatMap((c, i) => {
    const error = worst(c.expected, results[i] ?? []);
    return error <= RELATIVE ? [] : [`${c.label}: ${error.toExponential(2)}`];
  });
  const overall = Math.max(...CASES.map((c, i) => worst(c.expected, results[i] ?? [])));
  console.log(
    `A8 ${language}: ${String(CASES.length)} fits × ${String(COUNT)} x, worst relative ${overall.toExponential(2)}`,
  );
  expect(failures, `${language} disagrees with the app`).toEqual([]);
}

function has(command: string, args: readonly string[]): boolean {
  try {
    execFileSync(command, args, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** On CI the tool must be there; elsewhere its language is skipped. */
function available(command: string, args: readonly string[]): boolean {
  const ok = has(command, args);
  if (!ok && process.env.CI) throw new Error(`${command} is needed for A8 on CI`);
  return ok;
}

const dir = mkdtempSync(join(tmpdir(), 'cd-a8-'));
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

/**
 * A Python that can import NumPy: python3 itself, or on CI (whose system Python has no NumPy and refuses pip
 * installs, PEP 668) a venv in the temporary directory with NumPy from PyPI. Null elsewhere without NumPy.
 */
function pythonWithNumpy(): string | null {
  if (has('python3', ['-c', 'import numpy'])) return 'python3';
  if (!process.env.CI) return null;
  const venv = join(dir, 'venv');
  execFileSync('python3', ['-m', 'venv', venv]);
  const python = join(venv, 'bin', 'python');
  execFileSync(python, ['-m', 'pip', 'install', '--quiet', '--only-binary=:all:', 'numpy>=2,<3'], {
    stdio: 'inherit',
  });
  available(python, ['-c', 'import numpy']);
  return python;
}

const python = pythonWithNumpy();

describe('A8: generated code agrees with the app', () => {
  it(`has the hand-written examples and ${String(recommended.length)} fitted candidates`, () => {
    expect(CASES.length).toBeGreaterThan(300);
    const models = new Set(CASES.map((c) => c.fit.model));
    expect([...models].sort()).toEqual([
      'exp',
      'log',
      'pchip',
      'piecewise',
      'poly',
      'power',
      'rational',
      'spline',
    ]);
  });

  it('JavaScript', () => {
    const results = CASES.map((c) => {
      const code = generateCode(c.fit, 'javascript', { datasetName: c.datasetName });
      // eslint-disable-next-line @typescript-eslint/no-implied-eval -- running the generated code is the test
      const make = new Function(`${code}\nreturn ${identifier(c.datasetName)};`) as () => (
        x: number,
      ) => number;
      const f = make();
      return c.xs.map(f);
    });
    expectAgreement('JavaScript', results);
  });

  it.runIf(python !== null)('Python (NumPy), arrays in and out', () => {
    const script = [
      'import math',
      ...CASES.map((c) => generateCode(c.fit, 'python', { datasetName: c.datasetName })),
      'CASES = [',
      ...CASES.map((c) => `    (${identifier(c.datasetName)}, [${c.xs.map((x) => String(x)).join(', ')}]),`),
      ']',
      'for f, xs in CASES:',
      '    print(" ".join("nan" if math.isnan(y) else repr(float(y)) for y in f(np.array(xs))))',
    ].join('\n');
    const file = join(dir, 'a8.py');
    writeFileSync(file, script);
    const out = execFileSync(python ?? 'python3', ['-I', file], { encoding: 'utf8', maxBuffer: 64 << 20 });
    expectAgreement(
      'Python',
      out
        .trimEnd()
        .split('\n')
        .map((line) => line.split(' ').map(Number)),
    );
  });

  it.runIf(available('cc', ['--version']))('C, compiled with -std=c99 -Wall -Werror (and as C++)', () => {
    const functions = CASES.map((c) => generateCode(c.fit, 'c', { datasetName: c.datasetName }));
    const main = [
      '#include <stdio.h>',
      ...functions,
      'int main(void)',
      '{',
      ...CASES.flatMap((c) => [
        `    { static const double xs[] = {${c.xs.map((x) => (Number.isInteger(x) ? `${String(x)}.0` : String(x))).join(', ')}};`,
        `      for (int i = 0; i < ${String(c.xs.length)}; i++) printf("%.17g ", ${identifier(c.datasetName)}(xs[i]));`,
        '      printf("\\n"); }',
      ]),
      '    return 0;',
      '}',
      '',
    ].join('\n');
    const source = join(dir, 'a8.c');
    const binary = join(dir, 'a8');
    writeFileSync(source, main);
    execFileSync('cc', [
      '-std=c99',
      '-pedantic',
      '-Wall',
      '-Wextra',
      '-Werror',
      '-O1',
      source,
      '-o',
      binary,
      '-lm',
    ]);
    if (has('c++', ['--version']))
      execFileSync('c++', ['-x', 'c++', '-fsyntax-only', '-Wall', '-Werror', source]);
    const out = execFileSync(binary, { encoding: 'utf8', maxBuffer: 64 << 20 });
    expectAgreement(
      'C',
      out
        .trimEnd()
        .split('\n')
        .map((line) =>
          line
            .trim()
            .split(' ')
            .map((t) => (/nan/i.test(t) ? Number.NaN : Number(t))),
        ),
    );
  });

  it('Excel formula, through the evaluator (15-digit numbers, Excel precedence)', () => {
    const results = CASES.map((c) => {
      const formula = generateCode(c.fit, 'excel', { datasetName: c.datasetName, xRef: 'B2' });
      return c.xs.map((x) => formulaNumber(formula, { B2: Number(x.toPrecision(15)) }));
    });
    expectAgreement('Excel', results);
  });
});
