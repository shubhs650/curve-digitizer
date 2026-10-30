import { describe, expect, it } from 'vitest';
import html from '../index.html?raw';

describe('index.html', () => {
  it('declares the document language and title', () => {
    expect(html).toMatch(/<html lang="en">/);
    expect(html).toContain('<title>Curve Digitizer</title>');
  });

  it('provides the #root mount point and the module entry', () => {
    expect(html).toContain('<div id="root"></div>');
    expect(html).toContain('<script type="module" src="/src/main.ts"></script>');
  });

  it('loads nothing from another origin', () => {
    // Everything runs in the browser from 'self'; external scripts, styles or fonts are forbidden.
    expect(html).not.toMatch(/(src|href)="(https?:)?\/\//);
  });
});
