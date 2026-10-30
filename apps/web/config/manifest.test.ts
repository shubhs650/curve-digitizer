import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FILE_HANDLER_ACCEPT, manifest } from './manifest';

const publicDir = join(import.meta.dirname, '..', 'public');

describe('web app manifest', () => {
  it('names the app and launches it standalone at the root scope', () => {
    expect(manifest.name).toBe('Curve Digitizer');
    expect(manifest.short_name).toBeTruthy();
    expect(manifest.id).toBe('/');
    expect(manifest.start_url).toBe('/');
    expect(manifest.scope).toBe('/');
    expect(manifest.display).toBe('standalone');
  });

  it('uses the light theme by default', () => {
    expect(manifest.background_color).toBe('#ffffff');
  });

  it('has installable 192 and 512 px icons, a maskable icon, and every icon file exists', () => {
    const icons = manifest.icons;
    expect(icons.some((icon) => icon.sizes === '192x192' && icon.type === 'image/png')).toBe(true);
    expect(icons.some((icon) => icon.sizes === '512x512' && icon.type === 'image/png')).toBe(true);
    expect(icons.some((icon) => icon.purpose === 'maskable')).toBe(true);
    for (const icon of icons) {
      expect(existsSync(join(publicDir, icon.src)), icon.src).toBe(true);
    }
  });

  it('registers one file handler for .cdz projects and PNG/JPEG/WebP images', () => {
    expect(manifest.file_handlers).toEqual([{ action: '/', accept: FILE_HANDLER_ACCEPT }]);
    const extensions = Object.values(FILE_HANDLER_ACCEPT).flat();
    expect(extensions.sort()).toEqual(['.cdz', '.jpeg', '.jpg', '.png', '.webp']);
  });

  it('does not claim PDFs, so it never competes with PDF Tools for the default handler (PRD §4.1)', () => {
    expect(Object.keys(FILE_HANDLER_ACCEPT)).not.toContain('application/pdf');
    expect(Object.values(FILE_HANDLER_ACCEPT).flat()).not.toContain('.pdf');
  });

  it('reuses an open window for launched files instead of spawning one per file', () => {
    expect(manifest.launch_handler).toEqual({ client_mode: 'focus-existing' });
  });

  it('references nothing on another origin', () => {
    expect(JSON.stringify(manifest)).not.toMatch(/https?:\/\//);
  });
});
