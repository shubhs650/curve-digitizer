import { setCalibration } from '@cd/core';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../App';
import { workspaceWithGraph } from '../test/workspace';
import { useUiStore } from '../ui/uiStore';
import { EMPTY_DRAFT, evaluateDraft } from './draft';
import { resetCalibrationEditors } from './useCalibrationEditor';

afterEach(() => {
  cleanup();
  resetCalibrationEditors();
  useUiStore.setState({ activeGraphId: null, activeDatasetIds: {}, tool: 'select' });
});

/** The app on a graph calibrated from vector-clean's clicks, with the crossings left to solve. */
async function setup({ calibrated = true } = {}) {
  const workspace = await workspaceWithGraph();
  const store = workspace.state.store;
  const graphId = store?.project.graphs[0]?.id ?? '';
  if (calibrated) {
    const evaluation = evaluateDraft({
      ...EMPTY_DRAFT,
      picks: [
        [412, 1450],
        [2108, 1450],
        [200, 1226.7],
        [200, 333.3],
      ],
      values: { x1: '10', x2: '90', y1: '10', y2: '50', xAxisAt: '', yAxisAt: '' },
    });
    if (evaluation.status !== 'ok') throw new Error('expected a calibration');
    store?.dispatch(setCalibration(graphId, evaluation.calibration));
  }
  const user = userEvent.setup();
  render(<App workspace={workspace} />);
  const panel = within(screen.getByRole('region', { name: 'Calibration' }));
  const calibration = () => store?.project.graphs[0]?.calibration ?? null;
  return { user, panel, calibration };
}

describe('CalibrationPanel', () => {
  it('starts uncalibrated and arms the calibrate tool on X1', async () => {
    const { user, panel } = await setup({ calibrated: false });
    expect(panel.getByTestId('calibration-status').textContent).toBe('Not calibrated');
    expect(panel.getByText('Still to place: X1, X2, Y1, Y2.')).toBeTruthy();
    const x2 = panel.getByRole('button', { name: 'Place X2' });
    await user.click(x2);
    expect(useUiStore.getState().tool).toBe('calibrate');
    expect(x2.getAttribute('aria-pressed')).toBe('true');
    expect(panel.getByRole('button', { name: 'Place X1' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('shows the saved calibration with its residual, resolution and solved crossings', async () => {
    const { panel } = await setup();
    expect(panel.getByTestId('calibration-status').textContent).toBe('Calibrated');
    expect(panel.getByRole<HTMLInputElement>('textbox', { name: 'X1 value' }).value).toBe('10');
    expect(panel.getByRole<HTMLInputElement>('textbox', { name: 'Y2 value' }).value).toBe('50');
    expect(panel.getByText('at 412.0, 1450.0 px')).toBeTruthy();
    const crossing = panel.getByRole<HTMLInputElement>('textbox', { name: 'X-axis ticks lie at Y =' });
    expect(crossing.value).toBe('');
    expect(crossing.placeholder).toMatch(/^-?0(\.\d+)? \(solved\)$|e-\d+ \(solved\)$/);
    const summary = panel.getByTestId('calibration-summary').textContent;
    expect(summary).toContain('Residual 0.000 px');
    // 80 X units over 1696 px; 40 Y units over 893.4 px.
    expect(summary).toContain('Digitization resolution ≈ 0.047 X units/px, 0.045 Y units/px');
  });

  it('re-solves on every edit and shows what is wrong with a value', async () => {
    const { user, panel, calibration } = await setup();
    const x2 = panel.getByRole('textbox', { name: 'X2 value' });
    await user.clear(x2);
    await user.type(x2, '170');
    expect(calibration()?.points[1]?.axis[0]).toBe(170);
    await user.type(x2, 'x');
    expect(panel.getByText('Enter a number')).toBeTruthy();
    expect(calibration()?.points[1]?.axis[0]).toBe(170);

    await user.click(panel.getByRole('switch', { name: /Projective/ }));
    expect(panel.getAllByText('Projective needs this value')).toHaveLength(2);
  });

  it('switches an axis to log and rejects values at or below zero', async () => {
    const { user, panel, calibration } = await setup();
    await user.click(panel.getAllByRole('radio', { name: 'Log₁₀' })[0] as HTMLElement);
    // X1 = 10 and X2 = 90 are fine on a log axis; the crossing solved at X = 0 is not typed, so it is fine too.
    expect(calibration()?.xAxis.type).toBe('log10');
    const x1 = panel.getByRole('textbox', { name: 'X1 value' });
    await user.clear(x1);
    await user.type(x1, '0');
    expect(panel.getByText('A log axis needs a value above 0')).toBeTruthy();
  });

  it('labels the axes and clears the calibration', async () => {
    const { user, panel, calibration } = await setup();
    const label = panel.getByRole('textbox', { name: 'Y axis label' });
    await user.clear(label);
    await user.type(label, 'Stress');
    await user.type(panel.getByRole('textbox', { name: 'Y axis unit' }), 'MPa');
    expect(calibration()?.yAxis).toEqual({ type: 'linear', label: 'Stress', unit: 'MPa' });
    expect(panel.getByRole('textbox', { name: 'X-axis ticks lie at Stress =' })).toBeTruthy();

    await user.click(panel.getByRole('button', { name: 'Clear calibration' }));
    expect(calibration()).toBeNull();
    expect(panel.getByTestId('calibration-status').textContent).toBe('Not calibrated');
    expect(panel.getByRole<HTMLInputElement>('textbox', { name: 'Y axis label' }).value).toBe('Stress');
  });
});
