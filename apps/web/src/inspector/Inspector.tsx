import type { Graph } from '@cd/core';
import { makeStyles } from '@fluentui/react-components';
import { CalibrationPanel } from '../calibration/CalibrationPanel';
import { MaskPanel } from '../mask/MaskPanel';
import { GraphSourcePanel } from '../pdf/GraphSourcePanel';
import { PointsPanel } from '../points/PointsPanel';
import { ProcessingPanel } from '../processing/ProcessingPanel';
import { DatasetsPanel } from './DatasetsPanel';

const useStyles = makeStyles({
  scroll: {
    flexGrow: 1,
    minHeight: 0,
    overflowY: 'auto',
  },
});

/** The inspector's panels for one graph, in one scroll area. */
export function Inspector({ graph }: { graph: Graph }) {
  const styles = useStyles();
  return (
    <div className={styles.scroll}>
      <GraphSourcePanel graph={graph} />
      <CalibrationPanel graph={graph} />
      <DatasetsPanel graph={graph} />
      <PointsPanel graph={graph} />
      <ProcessingPanel graph={graph} />
      <MaskPanel graph={graph} />
    </div>
  );
}
