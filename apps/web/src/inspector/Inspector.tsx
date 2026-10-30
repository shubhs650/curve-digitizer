import type { Graph } from '@cd/core';
import { makeStyles } from '@fluentui/react-components';
import { CalibrationPanel } from '../calibration/CalibrationPanel';
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
      <CalibrationPanel graph={graph} />
      <DatasetsPanel graph={graph} />
    </div>
  );
}
