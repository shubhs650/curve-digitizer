import { Marked, type Tokens } from 'marked';
import { docsHref } from './route';

// The user docs are the Markdown files in docs/content, bundled at build time (PRD §4.11: a static /docs route
// rendered from Markdown in the repo). They link to each other as `page.md` so they also read well on GitHub.

const sources = import.meta.glob<string>('../../../../docs/content/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
});

export interface DocPage {
  readonly slug: string;
  readonly title: string;
  readonly markdown: string;
}

/** Reading order of the navigation; pages not listed follow alphabetically. README is for contributors. */
const ORDER = [
  'getting-started',
  'pdf-and-images',
  'calibration',
  'digitizing',
  'data-table',
  'export',
  'projects',
  'keyboard-shortcuts',
];
const HIDDEN = new Set(['README']);

function rank(slug: string): number {
  const i = ORDER.indexOf(slug);
  return i === -1 ? ORDER.length : i;
}

export const DOC_PAGES: readonly DocPage[] = Object.entries(sources)
  .map(([path, markdown]) => {
    const slug = path.slice(path.lastIndexOf('/') + 1, -'.md'.length);
    const title = /^# (.+)$/m.exec(markdown)?.[1]?.trim() ?? slug;
    return { slug, title, markdown };
  })
  .filter((page) => !HIDDEN.has(page.slug))
  .sort((a, b) => rank(a.slug) - rank(b.slug) || a.slug.localeCompare(b.slug));

/** The page for a slug; the docs index ('') is the first page. */
export function docPage(slug: string): DocPage | null {
  if (slug === '') return DOC_PAGES[0] ?? null;
  return DOC_PAGES.find((page) => page.slug === slug) ?? null;
}

const PAGE_LINK = /^([a-z0-9-]+)\.md(#.*)?$/;

const marked = new Marked({
  gfm: true,
  walkTokens(token) {
    if (token.type !== 'link') return;
    // Token's generic member (any fields) defeats narrowing on `type`.
    const link = token as Tokens.Link;
    const page = PAGE_LINK.exec(link.href);
    if (page?.[1] !== undefined) link.href = docsHref(page[1]) + (page[2] ?? '');
  },
});

/** HTML for a page. Only the bundled pages are rendered, so their inline HTML (`<kbd>`) is trusted. */
export function renderDoc(markdown: string): string {
  return marked.parse(markdown, { async: false });
}
