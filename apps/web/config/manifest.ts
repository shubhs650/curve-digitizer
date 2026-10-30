import type { ManifestOptions } from 'vite-plugin-pwa';

// Fluent 2 brand colour (webLightTheme colorBrandBackground), matching the icon artwork.
export const THEME_COLOR = '#0f6cbd';

// PRD §4.1: handle .cdz projects and the image types the app opens. PDFs are deliberately absent so the
// installed app never competes with PDF Tools for the system's PDF handler.
export const FILE_HANDLER_ACCEPT: Record<string, string[]> = {
  'application/x-curve-digitizer': ['.cdz'],
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/webp': ['.webp'],
};

export const manifest = {
  id: '/',
  name: 'Curve Digitizer',
  short_name: 'Digitizer',
  description: 'Digitize graphs from PDFs and images, in your browser, with numbers you can defend.',
  lang: 'en',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  background_color: '#ffffff',
  theme_color: THEME_COLOR,
  categories: ['productivity', 'utilities'],
  icons: [
    { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: 'pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
  ],
  file_handlers: [{ action: '/', accept: FILE_HANDLER_ACCEPT }],
  launch_handler: { client_mode: 'focus-existing' },
} satisfies Partial<ManifestOptions>;
