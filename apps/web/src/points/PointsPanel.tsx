import { type Graph, removePoints, updateSettings } from '@cd/core';
import { Button, Caption1, Caption1Strong, makeStyles, Switch, tokens } from '@fluentui/react-components';
import { DeleteRegular } from '@fluentui/react-icons';
import { calibratedReadout } from '../calibration/format';
import { NumberField } from '../inspector/fields';
import { useDispatch, useProject } from '../session/context';
import { useUiStore } from '../ui/uiStore';
import { selectedPoints } from './usePointTools';

const useStyles = makeStyles({
  panel: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM} ${tokens.spacingVerticalM}`,
    borderTop: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  muted: {
    color: tokens.colorNeutralForeground3,
  },
  numbers: {
    fontVariantNumeric: 'tabular-nums',
  },
});

/** Largest snap radius offered; beyond it a click would jump to curves the user did not aim at. */
const MAX_SNAP_RADIUS_PX = 50;

/** Snap settings and the point selection (task 1.4, PRD §4.4). */
export function PointsPanel({ graph }: { graph: Graph }) {
  const styles = useStyles();
  const dispatch = useDispatch();
  const project = useProject();
  const snap = useUiStore((s) => s.snap);
  const toggleSnap = useUiStore((s) => s.toggleSnap);
  const selection = useUiStore((s) => s.selection);
  const setSelection = useUiStore((s) => s.setSelection);
  const selected = selectedPoints(graph, selection);
  const [only] = selected;

  return (
    <section aria-labelledby="points-heading" className={styles.panel}>
      <Caption1Strong id="points-heading">Points</Caption1Strong>
      <Caption1 className={styles.muted}>
        Add points with P. Click a point to select it, Shift+click for more, drag to move; arrow keys nudge 1
        px (Shift: 0.1 px) and Delete removes.
      </Caption1>
      <Switch label="Magnetic snap to the curve" checked={snap} onChange={toggleSnap} />
      <NumberField
        label="Snap radius (px)"
        value={project?.settings.snapRadiusPx ?? null}
        onChange={(value, key) => {
          if (value !== null && value >= 1 && value <= MAX_SNAP_RADIUS_PX) {
            dispatch(updateSettings({ snapRadiusPx: value }, key));
          }
        }}
      />
      <Caption1 className={styles.numbers} data-testid="point-selection">
        {selected.length === 0
          ? 'No points selected.'
          : only && selected.length === 1
            ? `Selected: x ${only.point.px[0].toFixed(2)} px, y ${only.point.px[1].toFixed(2)} px${
                graph.calibration === null ? '' : ` (${calibratedReadout(graph.calibration, only.point.px)})`
              }${only.point.origin === 'snap' ? ', snapped' : ''}`
            : `${String(selected.length)} points selected.`}
      </Caption1>
      {selected.length > 0 && (
        <Button
          size="small"
          icon={<DeleteRegular />}
          onClick={() => {
            dispatch(
              removePoints(
                graph.id,
                selected.map(({ datasetId, point }) => ({ datasetId, pointId: point.id })),
              ),
            );
            setSelection(new Set());
          }}
        >
          {selected.length === 1 ? 'Delete point' : `Delete ${String(selected.length)} points`}
        </Button>
      )}
    </section>
  );
}
