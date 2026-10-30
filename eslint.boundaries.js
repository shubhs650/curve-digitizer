// Package boundaries from CLAUDE.md "Hard rules" and docs/ARCHITECTURE.md §3:
// apps/web → workers → {trace, fit, image, pdf} → {math, core}.
// The no-DOM rule for core packages is enforced by their tsconfig `lib`; this file covers imports.

const CORE = ['core', 'math', 'image', 'trace', 'fit', 'export'];
const PACKAGES = [...CORE, 'pdf', 'workers'];

const ui = {
  group: ['react', 'react/*', 'react-dom', 'react-dom/*', '@fluentui/*', 'zustand', 'zustand/*'],
  message: 'Packages are UI-free; React, Fluent UI and Zustand belong in apps/web.',
};
const app = {
  group: ['@cd/web', '@cd/web/*', '**/apps/web/**'],
  message: 'Packages must not import from apps/web.',
};
const embedPdf = {
  group: ['@embedpdf/*'],
  message: 'Only packages/pdf may import EmbedPDF.',
};
const upward = {
  group: ['@cd/pdf', '@cd/pdf/*', '@cd/workers', '@cd/workers/*'],
  message: 'Core packages sit below pdf and workers in the dependency graph.',
};
const leaf = {
  group: ['@cd/image', '@cd/trace', '@cd/fit', '@cd/export'].flatMap((name) => [name, `${name}/*`]),
  message: 'core and math are leaf packages and must not depend on image, trace, fit or export.',
};

function patternsFor(name) {
  const patterns = [ui, app];
  if (name !== 'pdf') patterns.push(embedPdf);
  if (CORE.includes(name)) patterns.push(upward);
  if (name === 'core' || name === 'math') patterns.push(leaf);
  return patterns;
}

export const boundaries = [
  ...PACKAGES.map((name) => ({
    files: [`packages/${name}/**/*.{ts,tsx,js}`],
    rules: { 'no-restricted-imports': ['error', { patterns: patternsFor(name) }] },
  })),
  {
    files: ['apps/web/**/*.{ts,tsx,js}'],
    rules: { 'no-restricted-imports': ['error', { patterns: [embedPdf] }] },
  },
];
