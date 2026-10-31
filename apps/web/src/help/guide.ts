import type { Graph, Project } from '@cd/core';

// The first-run guided checklist (PRD §4.11: "1 Crop · 2 Calibrate · 3 Digitize · 4 Export", not a wizard).
// Each step's state follows from the project, so the checklist never disagrees with what is on screen.

export type GuideStepId = 'crop' | 'calibrate' | 'digitize' | 'export';

export interface GuideStep {
  readonly id: GuideStepId;
  readonly title: string;
  readonly done: boolean;
  /** What to do next, shown for the current step only. */
  readonly hint: string;
}

/** Points a graph needs before "Digitize" counts as done: one point is not yet a curve. */
export const MIN_POINTS = 2;

export function guideSteps(
  project: Project | null,
  graph: Graph | null,
  exported: boolean,
): readonly GuideStep[] {
  const hasPdf = (project?.sources.length ?? 0) > 0;
  const points = graph?.datasets.reduce((n, d) => n + d.points.length, 0) ?? 0;
  return [
    {
      id: 'crop',
      title: 'Crop',
      done: graph !== null,
      hint: hasPdf
        ? 'Click a page under PDFs, drag a rectangle around the graph, then choose Crop to new graph.'
        : 'Open a PDF of the graph (or an image of it) with Add PDF or image at the top, or drop the file on the window.',
    },
    {
      id: 'calibrate',
      title: 'Calibrate',
      done: graph?.calibration != null,
      hint: 'Click two labelled ticks on each axis and type their values in the Calibration panel.',
    },
    {
      id: 'digitize',
      title: 'Digitize',
      done: points >= MIN_POINTS,
      hint: 'Click along the curve; each point snaps onto the line. Add a dataset for each further curve.',
    },
    {
      id: 'export',
      title: 'Export',
      done: exported,
      hint: 'Use Export at the top of this panel: CSV for this graph, or the Excel workbook for every graph.',
    },
  ];
}

/** The first step not yet done, or null when the checklist is complete. */
export function currentStep(steps: readonly GuideStep[]): GuideStep | null {
  return steps.find((s) => !s.done) ?? null;
}

const DISMISSED_KEY = 'curve-digitizer:guide-dismissed';

/** Whether the user closed the checklist; kept in this origin's localStorage, never sent anywhere. */
export const guidePreference = {
  dismissed(): boolean {
    try {
      return localStorage.getItem(DISMISSED_KEY) === '1';
    } catch {
      return false;
    }
  },
  setDismissed(dismissed: boolean): void {
    try {
      if (dismissed) localStorage.setItem(DISMISSED_KEY, '1');
      else localStorage.removeItem(DISMISSED_KEY);
    } catch {
      // Without storage the checklist simply shows again next time.
    }
  },
};
