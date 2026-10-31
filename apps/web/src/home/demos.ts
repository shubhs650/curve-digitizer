import {
  addDataset,
  type Axis,
  type Dataset,
  type DatasetParam,
  nextDatasetColor,
  setCalibration,
} from '@cd/core';
import darkBg from '../../../../samples/dark-bg/source.png?url';
import scanTilted from '../../../../samples/scan-tilted/source.png?url';
import snFamily from '../../../../samples/sn-family/source.png?url';
import vectorClean from '../../../../samples/vector-clean/source.png?url';
import { type CalibrationDraft, evaluateDraft, numberText } from '../calibration/draft';
import type { Workspace } from '../session/workspace';

// The bundled samples as one-click demo projects (PRD §4.12, ADR 44). Each opens calibrated from its recorded
// calibration clicks (samples/<name>/ops.json), with one empty dataset per curve, so the guide picks up at
// adding points. Only the PNG is bundled; demos.test.ts keeps these specs in step with the sample files.

/** One recorded calibration click: the pixel and the data value at it (X, Y). */
export interface DemoPick {
  readonly px: readonly [number, number];
  readonly value: readonly [number, number];
}

export interface DemoDataset {
  readonly name: string;
  readonly xUnit: string;
  readonly yUnit: string;
  readonly param?: DatasetParam;
}

export interface Demo {
  /** The sample's directory in samples/. */
  readonly sample: string;
  readonly title: string;
  readonly summary: string;
  readonly imageUrl: string;
  readonly xAxis: Axis;
  readonly yAxis: Axis;
  /** X1, X2 (on the X axis), Y1, Y2 (on the Y axis), as the calibration panel takes them. */
  readonly picks: readonly [DemoPick, DemoPick, DemoPick, DemoPick];
  readonly datasets: readonly DemoDataset[];
}

export const DEMOS: readonly Demo[] = [
  {
    sample: 'vector-clean',
    title: 'Pump curves',
    summary: 'A clean vector chart with three coloured curves on linear axes.',
    imageUrl: vectorClean,
    xAxis: { type: 'linear', label: 'Flow rate Q', unit: 'm³/h' },
    yAxis: { type: 'linear', label: 'Head H', unit: 'm' },
    picks: [
      { px: [412, 1450], value: [10, 0] },
      { px: [2108, 1450], value: [90, 0] },
      { px: [200, 1226.7], value: [0, 10] },
      { px: [200, 333.3], value: [0, 50] },
    ],
    datasets: [
      { name: 'Pump A', xUnit: 'm³/h', yUnit: 'm' },
      { name: 'Pump B', xUnit: 'm³/h', yUnit: 'm' },
      { name: 'Pump C', xUnit: 'm³/h', yUnit: 'm' },
    ],
  },
  {
    sample: 'scan-tilted',
    title: 'Allowable stress (1970s scan)',
    summary: 'A tilted, blurred, grainy scan with one solid and one dashed curve.',
    imageUrl: scanTilted,
    xAxis: { type: 'linear', label: 'Temperature T', unit: '°C' },
    yAxis: { type: 'linear', label: 'Allowable stress', unit: 'MPa' },
    picks: [
      { px: [323.3, 990.2], value: [50, 0] },
      { px: [1458.9, 1022], value: [450, 0] },
      { px: [183.9, 872.5], value: [0, 20] },
      { px: [198.9, 189.5], value: [0, 140] },
    ],
    datasets: [
      { name: 'Carbon steel', xUnit: '°C', yUnit: 'MPa' },
      { name: 'Low-alloy steel', xUnit: '°C', yUnit: 'MPa' },
    ],
  },
  {
    sample: 'sn-family',
    title: 'S-N curve family',
    summary: 'Three crossing black curves on log-log axes with a dense grid.',
    imageUrl: snFamily,
    xAxis: { type: 'log10', label: 'Number of cycles N' },
    yAxis: { type: 'log10', label: 'Stress amplitude S', unit: 'MPa' },
    picks: [
      { px: [500, 1330], value: [100, 10] },
      { px: [1620, 1330], value: [1e6, 10] },
      { px: [220, 923.3], value: [10, 100] },
      { px: [220, 516.7], value: [10, 1000] },
    ],
    datasets: [
      { name: 'UTS 480 MPa', xUnit: 'cycles', yUnit: 'MPa', param: { name: 'UTS', value: 480, unit: 'MPa' } },
      { name: 'UTS 690 MPa', xUnit: 'cycles', yUnit: 'MPa', param: { name: 'UTS', value: 690, unit: 'MPa' } },
      { name: 'UTS 860 MPa', xUnit: 'cycles', yUnit: 'MPa', param: { name: 'UTS', value: 860, unit: 'MPa' } },
    ],
  },
  {
    sample: 'dark-bg',
    title: 'Dark background',
    summary: 'Two bright curves on a dark semi-log chart; try Invert in pre-processing.',
    imageUrl: darkBg,
    xAxis: { type: 'linear', label: 'Time t', unit: 's' },
    yAxis: { type: 'log10', label: 'Count' },
    picks: [
      { px: [343, 1050], value: [1, 1] },
      { px: [1567, 1050], value: [9, 1] },
      { px: [190, 812.5], value: [0, 10] },
      { px: [190, 337.5], value: [0, 1000] },
    ],
    datasets: [
      { name: 'Run 1', xUnit: 's', yUnit: '' },
      { name: 'Run 2', xUnit: 's', yUnit: '' },
    ],
  },
];

/** The calibration panel's draft for the demo's clicks, as a user would fill it in. */
export function demoDraft(demo: Demo): CalibrationDraft {
  const [x1, x2, y1, y2] = demo.picks;
  return {
    picks: [x1.px, x2.px, y1.px, y2.px],
    values: {
      x1: numberText(x1.value[0]),
      x2: numberText(x2.value[0]),
      y1: numberText(y1.value[1]),
      y2: numberText(y2.value[1]),
      xAxisAt: numberText(x1.value[1]),
      yAxisAt: numberText(y1.value[0]),
    },
    xAxis: demo.xAxis,
    yAxis: demo.yAxis,
    model: 'affine',
  };
}

export interface DemoDeps {
  /** Reads a bundled file from the app's own origin. */
  readonly fetchBytes: (url: string) => Promise<Uint8Array>;
  readonly newId: () => string;
}

const defaultDeps: DemoDeps = {
  fetchBytes: async (url) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`The sample image did not load (HTTP ${String(response.status)}).`);
    return new Uint8Array(await response.arrayBuffer());
  },
  newId: () => crypto.randomUUID(),
};

/**
 * Opens the demo as a new project named after it: its image as the one graph, calibrated, with an empty dataset per
 * curve. Returns the graph's id. The setup goes through dispatch like any edit, so it can be undone.
 */
export async function openDemo(
  workspace: Workspace,
  demo: Demo,
  deps: DemoDeps = defaultDeps,
): Promise<string> {
  const evaluation = evaluateDraft(demoDraft(demo));
  if (evaluation.status !== 'ok') throw new Error(`The ${demo.title} demo's calibration does not solve.`);
  const bytes = await deps.fetchBytes(demo.imageUrl);
  const store = await workspace.createProject(demo.title);
  const { graphIds, failures } = await workspace.importImages([{ name: `${demo.title}.png`, bytes }]);
  const graphId = graphIds[0];
  if (graphId === undefined) throw new Error(failures[0]?.message ?? 'The sample image did not open.');
  store.dispatch(setCalibration(graphId, evaluation.calibration));
  const colors: string[] = [];
  for (const d of demo.datasets) {
    const color = nextDatasetColor(colors);
    colors.push(color);
    const dataset: Dataset = {
      id: deps.newId(),
      name: d.name,
      color,
      mode: 'function',
      ...(d.param === undefined ? {} : { param: d.param }),
      xUnit: d.xUnit,
      yUnit: d.yUnit,
      sourceRef: '',
      notes: `Demo from the ${demo.sample} sample.`,
      points: [],
    };
    store.dispatch(addDataset(graphId, dataset));
  }
  await workspace.flush();
  return graphId;
}
