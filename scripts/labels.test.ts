import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface Label {
  readonly name: string;
  readonly color: string;
  readonly description: string;
}

const labels = JSON.parse(
  readFileSync(new URL('../.github/labels.json', import.meta.url), 'utf8'),
) as Label[];

describe('.github/labels.json', () => {
  it('defines the labels the workflow relies on', () => {
    expect(labels.map((l) => l.name)).toEqual(['M0', 'M1', 'M2', 'M3', 'decision', 'bug', 'enhancement']);
  });

  it('uses valid GitHub label colours and non-empty descriptions', () => {
    for (const label of labels) {
      expect(label.color).toMatch(/^[0-9a-f]{6}$/);
      expect(label.description.length).toBeGreaterThan(0);
      expect(label.description.length).toBeLessThanOrEqual(100);
    }
  });
});
