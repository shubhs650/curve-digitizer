import { describe, expect, it } from 'vitest';
import html from '../index.html?raw';

describe('index.html', () => {
  it('declares the document language and title', () => {
    expect(html).toMatch(/<html lang="en">/);
    expect(html).toContain('<title>Curve Digitizer</title>');
  });

  it('provides the #root mount point and the module entry', () => {
    expect(html).toContain('<div id="root"></div>');
    expect(html).toContain('<script type="module" src="/src/main.tsx"></script>');
  });

  it('links the favicon, iOS home-screen icon and theme colour for the installed app', () => {
    expect(html).toContain('<link rel="icon" href="/icon.svg" type="image/svg+xml" />');
    expect(html).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon-180x180.png" />');
    expect(html).toMatch(/<meta name="theme-color" content="#[0-9a-f]{6}" \/>/);
  });

  it('loads nothing from another origin', () => {
    // Everything runs in the browser from 'self'; external scripts, styles or fonts are forbidden.
    expect(html).not.toMatch(/(src|href)="(https?:)?\/\//);
  });
});
