import { strToU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { createAudit, serializeAudit } from './audit.ts';
import { sha256Hex } from './sha256.ts';
import { sampleProject } from './testing.ts';

const info = { exportedAt: '2026-12-01T09:00:00Z', appVersion: '0.3.0', userAgent: 'test-agent' };

const images = new Map([
  ['graphs/g1/original.png', strToU8('abc')],
  ['graphs/g2/original.png', new Uint8Array()],
]);

describe('sha256Hex', () => {
  it('matches the FIPS 180-2 test vectors', async () => {
    expect(await sha256Hex(strToU8('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(await sha256Hex(new Uint8Array())).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });
});

describe('createAudit', () => {
  it('replaces each image with path, sha256, width and height', async () => {
    const audit = await createAudit(sampleProject(), images, info);
    expect(audit.graphs.map((g) => g.image)).toEqual([
      {
        path: 'graphs/g1/original.png',
        sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
        width: 2267,
        height: 1830,
      },
      {
        path: 'graphs/g2/original.png',
        sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        width: 800,
        height: 600,
      },
    ]);
  });

  it('removes no information and adds the audit block', async () => {
    const project = sampleProject();
    const audit = await createAudit(project, images, info);
    expect(audit.audit).toEqual(info);
    // Putting the original image refs and dropping the audit block must give back the project.
    const restored: unknown = {
      ...audit,
      audit: undefined,
      graphs: audit.graphs.map((g, i) => ({ ...g, image: project.graphs[i]?.image })),
    };
    expect(JSON.parse(JSON.stringify(restored))).toEqual(project);
    expect(audit.graphs[0]?.datasets[0]?.points[0]).toEqual(project.graphs[0]?.datasets[0]?.points[0]);
  });

  it('fails when an image is missing', async () => {
    await expect(createAudit(sampleProject(), new Map(), info)).rejects.toThrow(/Missing image/);
  });

  it('serializes to plain JSON', async () => {
    const audit = await createAudit(sampleProject(), images, info);
    expect(JSON.parse(serializeAudit(audit))).toEqual(audit);
  });
});
