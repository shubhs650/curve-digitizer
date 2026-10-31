// `node scripts/fit-recommend-mc.ts`: how often the fit recommendation (packages/fit, ADR 39) names the family a
// dataset was drawn from, over seeded random draws of the A7 families with Gaussian noise of 0.3 % and 1 % of the
// y range (in fit space). The A7 unit test checks one fixed draw per case; this measures the rule itself.
// Not part of CI (about a minute). Prints the hit rate of the recommendation and of the bare AICc minimum.
import { type FitResult, recommendFits } from '@cd/fit';

const DRAWS = Number(process.argv[2] ?? 40);

/** Mulberry32 uniforms → Box–Muller normals. */
function normals(seed: number): () => number {
  let a = seed >>> 0;
  const uniform = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (((t ^ (t >>> 14)) >>> 0) + 0.5) / 4294967296;
  };
  return () => Math.sqrt(-2 * Math.log(uniform())) * Math.cos(2 * Math.PI * uniform());
}

const linspace = (a: number, b: number, n: number): number[] =>
  Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));

type Space = 'lin' | 'log';
const FAMILIES: readonly [string, string, Space, Space, (n: number) => number[], (x: number) => number][] = [
  ['power', 'power', 'lin', 'lin', (n) => linspace(1, 60, n), (x) => 85 * x ** -0.55],
  ['exp', 'exp', 'lin', 'lin', (n) => linspace(0, 5, n), (x) => 1.8 * Math.exp(0.72 * x)],
  ['exp-decay', 'exp', 'lin', 'lin', (n) => linspace(0, 400, n), (x) => 950 * Math.exp(-0.009 * x)],
  ['poly3', 'poly', 'lin', 'lin', (n) => linspace(-3, 4, n), (x) => 0.5 * x ** 3 - 2 * x ** 2 - 1.5 * x + 4],
  [
    'piecewise',
    'piecewise',
    'lin',
    'lin',
    (n) => linspace(0, 10, n),
    (x) => (x < 4 ? 2 + 1.5 * x : 8 - 0.4 * (x - 4)),
  ],
  [
    'power-loglog',
    'power',
    'log',
    'log',
    (n) => linspace(1, 6, n).map((e) => 10 ** e),
    (x) => 4000 * x ** -0.25,
  ],
  ['exp-semilog', 'exp', 'lin', 'log', (n) => linspace(0, 600, n), (x) => 2e5 * Math.exp(-0.011 * x)],
];

const hit = (fit: FitResult | undefined, family: string): boolean =>
  fit?.model === family && (family !== 'poly' || (fit.params.c as readonly number[]).length === 4);

let total = 0;
let recommended = 0;
let minimum = 0;
for (const [name, family, sx, sy, xs, f] of FAMILIES) {
  for (const n of [30, 60]) {
    for (const rel of [0.003, 0.01]) {
      let rec = 0;
      let min = 0;
      for (let draw = 0; draw < DRAWS; draw++) {
        const noise = normals(1234567 + draw * 7919 + n * 13 + Math.round(rel * 1e5) + name.length * 100003);
        const x = xs(n);
        let y = x.map(f);
        if (sy === 'log') {
          const v = y.map(Math.log10);
          const range = Math.max(...v) - Math.min(...v);
          y = v.map((vi) => 10 ** (vi + noise() * rel * range));
        } else {
          const range = Math.max(...y) - Math.min(...y);
          y = y.map((yi) => yi + noise() * rel * range);
        }
        const { fits, recommended: index } = recommendFits(x, y, { x: sx, y: sy });
        if (hit(fits[index], family)) rec++;
        if (hit(fits[0], family)) min++;
      }
      total += DRAWS;
      recommended += rec;
      minimum += min;
      console.log(
        `${name} n=${String(n)} noise=${String(rel * 100)}%: recommended ${String(rec)}/${String(DRAWS)}, minimum ${String(min)}/${String(DRAWS)}`,
      );
    }
  }
}
const pct = (k: number): string => ((100 * k) / total).toFixed(1);
console.log(`all ${String(total)} draws: recommended ${pct(recommended)} %, AICc minimum ${pct(minimum)} %`);
