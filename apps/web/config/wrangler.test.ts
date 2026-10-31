import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// wrangler.toml at the repository root is what Cloudflare Workers Builds deploys from (docs/DEPLOY.md, ADR 46).
const toml = readFileSync(join(import.meta.dirname, '..', '..', '..', 'wrangler.toml'), 'utf8');
const lines = toml.split('\n').filter((l) => l.trim() !== '' && !l.trimStart().startsWith('#'));

/** The `key = value` lines of one TOML table (`''` for the top level), as written. */
function table(name: string): readonly string[] {
  const out: string[] = [];
  let current = '';
  for (const line of lines) {
    const header = /^\[(.+)\]$/.exec(line.trim());
    if (header) current = header[1] ?? '';
    else if (current === name) out.push(line.trim());
  }
  return out;
}

describe('wrangler.toml', () => {
  it('serves the built app as static assets, with SPA fallback for /docs deep links', () => {
    expect(table('assets')).toEqual([
      'directory = "./apps/web/dist"',
      'not_found_handling = "single-page-application"',
    ]);
  });

  it('builds the app itself, so a deploy never depends on the dashboard build command', () => {
    expect(table('build')).toEqual(['command = "pnpm build"']);
  });

  it('keeps Wrangler usage reporting off and has no Worker script', () => {
    expect(table('')).toContain('send_metrics = false');
    expect(table('').some((l) => l.startsWith('main'))).toBe(false);
  });
});
