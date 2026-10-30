import { Button, Caption1, makeStyles, Tooltip, tokens } from '@fluentui/react-components';
import { ArrowMaximizeRegular, ZoomInRegular, ZoomOutRegular } from '@fluentui/react-icons';

const useStyles = makeStyles({
  bar: {
    position: 'absolute',
    right: tokens.spacingHorizontalS,
    bottom: tokens.spacingVerticalS,
    backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: tokens.borderRadiusMedium,
    boxShadow: tokens.shadow4,
    display: 'flex',
    alignItems: 'center',
  },
  percent: {
    minWidth: '48px',
    textAlign: 'center',
    fontVariantNumeric: 'tabular-nums',
  },
});

export interface ZoomBarProps {
  readonly scale: number;
  readonly onZoomIn: () => void;
  readonly onZoomOut: () => void;
  readonly onFit: () => void;
  readonly onActualSize: () => void;
}

export function ZoomBar({ scale, onZoomIn, onZoomOut, onFit, onActualSize }: ZoomBarProps) {
  const styles = useStyles();
  const percent = `${String(Math.round(scale * 100))}%`;
  // A plain toolbar of buttons: Fluent's Toolbar makes Tabster add focusable aria-hidden sentinels that axe flags.
  return (
    <div role="toolbar" aria-label="Zoom" className={styles.bar}>
      <Tooltip content="Zoom out (−)" relationship="description">
        <Button
          appearance="subtle"
          size="small"
          aria-label="Zoom out"
          icon={<ZoomOutRegular />}
          onClick={onZoomOut}
        />
      </Tooltip>
      <Tooltip content="Actual size (1)" relationship="description">
        <Button
          appearance="subtle"
          size="small"
          aria-label={`${percent}, actual size`}
          onClick={onActualSize}
        >
          <Caption1 className={styles.percent} data-testid="zoom-percent">
            {percent}
          </Caption1>
        </Button>
      </Tooltip>
      <Tooltip content="Zoom in (+)" relationship="description">
        <Button
          appearance="subtle"
          size="small"
          aria-label="Zoom in"
          icon={<ZoomInRegular />}
          onClick={onZoomIn}
        />
      </Tooltip>
      <Tooltip content="Fit to window (0)" relationship="description">
        <Button
          appearance="subtle"
          size="small"
          aria-label="Fit to window"
          icon={<ArrowMaximizeRegular />}
          onClick={onFit}
        />
      </Tooltip>
    </div>
  );
}
