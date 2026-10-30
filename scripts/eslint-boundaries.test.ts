import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import { boundaries } from '../eslint.boundaries.js';

const eslint = new ESLint({
  cwd: new URL('..', import.meta.url).pathname,
  overrideConfigFile: true,
  overrideConfig: [{ files: ['**/*.ts'], languageOptions: { parser: tseslint.parser } }, ...boundaries],
});

async function restrictedImports(file: string, source: string): Promise<number> {
  const [result] = await eslint.lintText(source, { filePath: file });
  return result?.messages.filter((m) => m.ruleId === 'no-restricted-imports').length ?? 0;
}

describe('package boundaries', () => {
  it.each(['core', 'math', 'image', 'trace', 'fit', 'export', 'pdf', 'workers'])(
    'forbids React and apps/web in packages/%s',
    async (name) => {
      const file = `packages/${name}/src/x.ts`;
      expect(await restrictedImports(file, "import 'react';")).toBe(1);
      expect(await restrictedImports(file, "import '@fluentui/react-components';")).toBe(1);
      expect(await restrictedImports(file, "import '@cd/web';")).toBe(1);
    },
  );

  it('allows EmbedPDF only in packages/pdf', async () => {
    const source = "import '@embedpdf/engines';";
    expect(await restrictedImports('packages/pdf/src/x.ts', source)).toBe(0);
    expect(await restrictedImports('packages/workers/src/x.ts', source)).toBe(1);
    expect(await restrictedImports('packages/core/src/x.ts', source)).toBe(1);
    expect(await restrictedImports('apps/web/src/x.ts', source)).toBe(1);
  });

  it('keeps core packages below pdf and workers', async () => {
    expect(await restrictedImports('packages/trace/src/x.ts', "import '@cd/workers';")).toBe(1);
    expect(await restrictedImports('packages/fit/src/x.ts', "import '@cd/pdf';")).toBe(1);
    expect(await restrictedImports('packages/workers/src/x.ts', "import '@cd/trace';")).toBe(0);
  });

  it('keeps core and math as leaves', async () => {
    expect(await restrictedImports('packages/math/src/x.ts', "import '@cd/fit';")).toBe(1);
    expect(await restrictedImports('packages/core/src/x.ts', "import '@cd/image';")).toBe(1);
    expect(await restrictedImports('packages/trace/src/x.ts', "import '@cd/math';")).toBe(0);
  });
});
