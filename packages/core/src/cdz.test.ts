import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { type CdzContents, CdzFormatError, readCdz, writeCdz } from './cdz.ts';
import { migrate } from './migrations/index.ts';
import { sampleProject } from './testing.ts';
import { ProjectFormatError } from './validate.ts';

/** Deterministic pseudo-random bytes; incompressible, like real PNG/JPEG data. */
function bytes(length: number, seed: number): Uint8Array {
  const out = new Uint8Array(length);
  let s = seed;
  for (let i = 0; i < length; i++) {
    s = (s * 1103515245 + 12345) >>> 0;
    out[i] = s >>> 24;
  }
  return out;
}

function contents(): CdzContents {
  return {
    project: sampleProject(),
    images: new Map([
      ['graphs/g1/original.png', bytes(4096, 1)],
      ['graphs/g1/thumb.jpg', bytes(512, 2)],
      ['graphs/g2/original.png', bytes(2048, 3)],
    ]),
    sources: new Map([['src1', bytes(1024, 4)]]),
  };
}

describe('.cdz', () => {
  it('round-trips losslessly (R2): project deep-equal, images and sources byte-equal', () => {
    const original = contents();
    const reopened = readCdz(writeCdz(original));
    expect(reopened.project).toEqual(original.project);
    expect(reopened.images).toEqual(original.images);
    expect(reopened.sources).toEqual(original.sources);
  });

  it('opens fully without sources/', () => {
    const reopened = readCdz(writeCdz({ ...contents(), sources: new Map() }));
    expect(reopened.sources.size).toBe(0);
    expect(reopened.project).toEqual(sampleProject());
  });

  it('writes the documented layout readable by any zip tool', () => {
    const entries = unzipSync(writeCdz(contents()));
    expect(Object.keys(entries).sort()).toEqual([
      'README.txt',
      'graphs/g1/original.png',
      'graphs/g1/thumb.jpg',
      'graphs/g2/original.png',
      'project.json',
      'sources/src1.pdf',
    ]);
    expect(migrate(JSON.parse(strFromU8(entries['project.json'] ?? new Uint8Array())))).toEqual(
      sampleProject(),
    );
    expect(strFromU8(entries['README.txt'] ?? new Uint8Array())).toMatch(/Curve Digitizer project/);
  });

  it('is reproducible: the same project gives the same bytes', () => {
    expect(writeCdz(contents())).toEqual(writeCdz(contents()));
  });

  it('refuses to write a graph whose image is missing', () => {
    const c = contents();
    const images = new Map(c.images);
    images.delete('graphs/g2/original.png');
    expect(() => writeCdz({ ...c, images })).toThrow(CdzFormatError);
  });

  it('refuses image paths outside graphs/', () => {
    const c = contents();
    expect(() => writeCdz({ ...c, images: new Map([...c.images, ['project.json', bytes(1, 1)]]) })).toThrow(
      CdzFormatError,
    );
  });

  it('rejects bytes that are not a zip', () => {
    expect(() => readCdz(strToU8('hello'))).toThrow(CdzFormatError);
  });

  it('rejects an archive without project.json', () => {
    expect(() => readCdz(zipSync({ 'README.txt': strToU8('x') }))).toThrow(/no project.json/);
  });

  it('rejects project.json that is not JSON', () => {
    expect(() => readCdz(zipSync({ 'project.json': strToU8('{') }))).toThrow(/not JSON/);
  });

  it('rejects project.json that fails the schema', () => {
    expect(() => readCdz(zipSync({ 'project.json': strToU8('{"schemaVersion":1}') }))).toThrow(
      ProjectFormatError,
    );
  });

  it('rejects an archive missing a referenced image', () => {
    const entries = unzipSync(writeCdz(contents()));
    delete entries['graphs/g2/original.png'];
    expect(() => readCdz(zipSync(entries))).toThrow(/missing "graphs\/g2\/original.png"/);
  });
});
