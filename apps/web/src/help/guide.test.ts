import { type Graph, type Project } from '@cd/core';
import { afterEach, describe, expect, it } from 'vitest';
import { currentStep, guidePreference, guideSteps } from './guide';

afterEach(() => {
  localStorage.clear();
});

const project = (sources = 0) =>
  ({ id: 'p', sources: Array.from({ length: sources }, () => ({})) }) as unknown as Project;
const graph = (calibrated: boolean, points: number) =>
  ({
    calibration: calibrated ? {} : null,
    datasets: [{ points: Array.from({ length: points }, () => ({})) }],
  }) as unknown as Graph;

const done = (steps: ReturnType<typeof guideSteps>) => steps.map((s) => s.done);

describe('guideSteps', () => {
  it('starts at Crop with nothing done', () => {
    const steps = guideSteps(null, null, false);
    expect(done(steps)).toEqual([false, false, false, false]);
    expect(currentStep(steps)?.id).toBe('crop');
    expect(currentStep(steps)?.hint).toMatch(/Open a PDF/);
  });

  it('points at the PDF pages once a PDF is open', () => {
    expect(currentStep(guideSteps(project(1), null, false))?.hint).toMatch(/Click a page under PDFs/);
  });

  it('follows the graph through calibration and digitizing to export', () => {
    expect(currentStep(guideSteps(project(), graph(false, 0), false))?.id).toBe('calibrate');
    expect(currentStep(guideSteps(project(), graph(true, 1), false))?.id).toBe('digitize');
    expect(currentStep(guideSteps(project(), graph(true, 2), false))?.id).toBe('export');
    const steps = guideSteps(project(), graph(true, 2), true);
    expect(done(steps)).toEqual([true, true, true, true]);
    expect(currentStep(steps)).toBeNull();
  });
});

describe('guidePreference', () => {
  it('remembers that the guide was dismissed', () => {
    expect(guidePreference.dismissed()).toBe(false);
    guidePreference.setDismissed(true);
    expect(guidePreference.dismissed()).toBe(true);
    guidePreference.setDismissed(false);
    expect(guidePreference.dismissed()).toBe(false);
  });
});
