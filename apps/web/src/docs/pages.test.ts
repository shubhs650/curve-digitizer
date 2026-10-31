import { describe, expect, it } from 'vitest';
import { SHORTCUT_GROUPS } from '../help/shortcuts';
import { DOC_PAGES, docPage, renderDoc } from './pages';
import { docsSlug } from './route';

describe('docsSlug', () => {
  it('reads the docs index and pages from the path', () => {
    expect(docsSlug('/docs')).toBe('');
    expect(docsSlug('/docs/')).toBe('');
    expect(docsSlug('/docs/calibration')).toBe('calibration');
    expect(docsSlug('/docs/calibration/')).toBe('calibration');
  });

  it('is null outside /docs', () => {
    expect(docsSlug('/')).toBeNull();
    expect(docsSlug('/docsearch')).toBeNull();
  });
});

describe('docs pages', () => {
  it('has every page, in reading order, titled by its first heading', () => {
    expect(DOC_PAGES.map((p) => [p.slug, p.title])).toEqual([
      ['getting-started', 'Getting started'],
      ['pdf-and-images', 'PDFs and images'],
      ['calibration', 'Calibration'],
      ['digitizing', 'Digitizing points'],
      ['preprocessing', 'Pre-processing'],
      ['data-table', 'The data table'],
      ['fitting', 'Fitting curves'],
      ['export', 'Exporting'],
      ['projects', 'Projects, autosave and .cdz files'],
      ['keyboard-shortcuts', 'Keyboard shortcuts'],
    ]);
  });

  it('opens the first page at the docs index and nothing for an unknown slug', () => {
    expect(docPage('')?.slug).toBe('getting-started');
    expect(docPage('README')).toBeNull();
    expect(docPage('nope')).toBeNull();
  });

  it('turns links between pages into /docs routes, and every one resolves', () => {
    for (const page of DOC_PAGES) {
      const html = renderDoc(page.markdown);
      expect(html, page.slug).not.toMatch(/href="[^"]*\.md/);
      for (const [, slug] of html.matchAll(/href="\/docs\/([^"#]+)/g)) {
        expect(docPage(slug ?? ''), `${page.slug} links to ${String(slug)}`).not.toBeNull();
      }
    }
    expect(renderDoc('[x](calibration.md#axes)')).toContain('href="/docs/calibration#axes"');
    expect(renderDoc('[x](https://example.com/a.md)')).toContain('href="https://example.com/a.md"');
  });

  it('lists every shortcut of the cheat sheet on the keyboard page (U2)', () => {
    const html = renderDoc(docPage('keyboard-shortcuts')?.markdown ?? '');
    const rows = [...html.matchAll(/<tr>\s*<td>(.*?)<\/td>\s*<td>(.*?)<\/td>/gs)].map(([, keys, action]) => ({
      keys: [...(keys ?? '').matchAll(/<kbd>(.*?)<\/kbd>/g)].map((k) => k[1]),
      action,
    }));
    const expected = SHORTCUT_GROUPS.flatMap((g) =>
      g.shortcuts.map((s) => ({ keys: [...s.keys], action: s.action })),
    );
    expect(rows).toEqual(expected);
    for (const group of SHORTCUT_GROUPS) expect(html).toContain(`<h2>${group.title}</h2>`);
  });
});
