// Bundle size budget (docs/ARCHITECTURE.md §9 gate 5, acceptance targets P1 and P2).
// Usage: node scripts/size-check.ts <dist-dir>
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

export type Bucket = 'core' | 'pdfium';

export interface Budget {
  readonly label: string;
  readonly maxBytes: number;
  readonly measure: 'gzip' | 'raw';
}

// Decimal megabytes, so the budget is never looser than the documented number.
export const BUDGETS: Readonly<Record<Bucket, Budget>> = {
  core: { label: 'core app shell', maxBytes: 1_500_000, measure: 'gzip' },
  pdfium: { label: 'PDFium chunk', maxBytes: 15_000_000, measure: 'raw' },
};

const CORE_EXTENSIONS = ['.html', '.js', '.mjs', '.css', '.wasm', '.woff', '.woff2', '.webmanifest'];

export function classify(path: string): Bucket | 'ignored' {
  const lower = path.toLowerCase();
  if (lower.endsWith('.map')) return 'ignored';
  if (/pdfium/.test(lower)) return 'pdfium';
  return CORE_EXTENSIONS.some((ext) => lower.endsWith(ext)) ? 'core' : 'ignored';
}

export interface Total {
  readonly files: number;
  readonly bytes: number;
}

export type Totals = Readonly<Record<Bucket, Total>>;

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? listFiles(full) : [full];
  });
}

export function measure(distDir: string): Totals {
  if (!existsSync(distDir) || !statSync(distDir).isDirectory()) {
    throw new Error(`size-check: ${distDir} does not exist; run the build first`);
  }
  const totals: Record<Bucket, { files: number; bytes: number }> = {
    core: { files: 0, bytes: 0 },
    pdfium: { files: 0, bytes: 0 },
  };
  for (const file of listFiles(distDir)) {
    const bucket = classify(relative(distDir, file).split(sep).join('/'));
    if (bucket === 'ignored') continue;
    const content = readFileSync(file);
    const size = BUDGETS[bucket].measure === 'gzip' ? gzipSync(content, { level: 9 }).length : content.length;
    totals[bucket].files += 1;
    totals[bucket].bytes += size;
  }
  return totals;
}

export interface Result {
  readonly bucket: Bucket;
  readonly budget: Budget;
  readonly total: Total;
  readonly ok: boolean;
}

export function checkBudgets(totals: Totals): Result[] {
  return (Object.keys(BUDGETS) as Bucket[]).map((bucket) => {
    const budget = BUDGETS[bucket];
    const total = totals[bucket];
    return { bucket, budget, total, ok: total.bytes <= budget.maxBytes };
  });
}

function kb(bytes: number): string {
  return `${(bytes / 1000).toFixed(1)} kB`;
}

export function formatReport(results: readonly Result[]): string {
  return results
    .map(
      ({ bucket, budget, total, ok }) =>
        `${bucket.padEnd(7)} ${budget.label.padEnd(15)} ${kb(total.bytes).padStart(11)} ${budget.measure.padEnd(4)}` +
        ` / ${kb(budget.maxBytes)} (${String(total.files)} files) ${ok ? 'ok' : 'OVER BUDGET'}`,
    )
    .join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const distDir = process.argv[2] ?? 'apps/web/dist';
  const results = checkBudgets(measure(distDir));
  console.log(`size-check ${distDir}\n${formatReport(results)}`);
  if (!results.every((r) => r.ok)) process.exit(1);
}
