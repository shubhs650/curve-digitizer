declare const __APP_VERSION__: string | undefined;

// Injected by vite.config.ts from package.json; absent under Vitest, which does not load that config.
export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0-dev';
