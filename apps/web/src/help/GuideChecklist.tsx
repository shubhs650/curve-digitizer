import {
  Button,
  Caption1,
  Caption1Strong,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components';
import {
  CheckmarkCircleFilled,
  CircleRegular,
  DismissRegular,
  LightbulbRegular,
  RecordRegular,
} from '@fluentui/react-icons';
import { useState } from 'react';
import { useActiveGraph, useProject } from '../session/context';
import { useUiStore } from '../ui/uiStore';
import { currentStep, guidePreference, type GuideStepId, guideSteps } from './guide';

const useStyles = makeStyles({
  guide: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },
  title: {
    flexGrow: 1,
  },
  count: {
    color: tokens.colorNeutralForeground3,
    fontVariantNumeric: 'tabular-nums',
  },
  steps: {
    listStyleType: 'none',
    margin: 0,
    padding: 0,
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
    gap: `${tokens.spacingVerticalXXS} ${tokens.spacingHorizontalS}`,
  },
  step: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    minWidth: 0,
    color: tokens.colorNeutralForeground3,
  },
  done: {
    color: tokens.colorPaletteGreenForeground1,
  },
  current: {
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorBrandForeground1,
  },
  hint: {
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalS}`,
    borderRadius: tokens.borderRadiusMedium,
    color: tokens.colorNeutralForeground2,
    backgroundColor: tokens.colorNeutralBackground1,
    borderLeft: `${tokens.strokeWidthThicker} solid ${tokens.colorBrandStroke1}`,
  },
  action: {
    alignSelf: 'flex-start',
  },
  // Read by screen readers only: the icons carry the same state visually.
  visuallyHidden: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    overflow: 'hidden',
    clipPath: 'inset(50%)',
    whiteSpace: 'nowrap',
  },
});

/** Tool each step's button switches to, where a tool does the step. */
const STEP_TOOLS: Partial<
  Record<GuideStepId, { readonly tool: 'calibrate' | 'point'; readonly label: string }>
> = {
  calibrate: { tool: 'calibrate', label: 'Calibrate (C)' },
  digitize: { tool: 'point', label: 'Add points (P)' },
};

/** The dismissible "1 Crop · 2 Calibrate · 3 Digitize · 4 Export" checklist in the sidebar (task 1.11, U1). */
export function GuideChecklist() {
  const styles = useStyles();
  const project = useProject();
  const graph = useActiveGraph();
  const exported = useUiStore((s) => project !== null && s.exportedProjects.has(project.id));
  const setTool = useUiStore((s) => s.setTool);
  const [dismissed, setDismissed] = useState(() => guidePreference.dismissed());

  if (dismissed) {
    return (
      <Button
        appearance="transparent"
        size="small"
        icon={<LightbulbRegular />}
        onClick={() => {
          guidePreference.setDismissed(false);
          setDismissed(false);
        }}
      >
        Show the getting-started guide
      </Button>
    );
  }

  const steps = guideSteps(project, graph, exported);
  const current = currentStep(steps);
  const action = current ? STEP_TOOLS[current.id] : undefined;
  const done = steps.filter((step) => step.done).length;
  return (
    <section aria-labelledby="guide-heading" className={styles.guide}>
      <div className={styles.header}>
        <LightbulbRegular aria-hidden="true" />
        <Caption1Strong id="guide-heading" className={styles.title}>
          Getting started
        </Caption1Strong>
        <Caption1 className={styles.count} data-testid="guide-progress">
          {done} of {steps.length}
        </Caption1>
        <Button
          appearance="subtle"
          size="small"
          icon={<DismissRegular />}
          aria-label="Hide the getting-started guide"
          onClick={() => {
            guidePreference.setDismissed(true);
            setDismissed(true);
          }}
        />
      </div>
      <ol className={styles.steps}>
        {steps.map((step, i) => (
          <li
            key={step.id}
            aria-current={step === current ? 'step' : undefined}
            className={mergeClasses(
              styles.step,
              step.done && styles.done,
              step === current && styles.current,
            )}
          >
            {step.done ? (
              <CheckmarkCircleFilled aria-hidden="true" />
            ) : step === current ? (
              <RecordRegular aria-hidden="true" />
            ) : (
              <CircleRegular aria-hidden="true" />
            )}
            <Caption1 className={step === current ? styles.current : undefined}>
              {i + 1}. {step.title}
              <span className={styles.visuallyHidden}>
                {step.done ? ', done' : step === current ? ', next' : ''}
              </span>
            </Caption1>
          </li>
        ))}
      </ol>
      {current !== null ? (
        <Caption1 className={styles.hint}>{current.hint}</Caption1>
      ) : (
        <Caption1 className={styles.hint}>All done. The checklist can be hidden now.</Caption1>
      )}
      {action && (
        <Button
          size="small"
          appearance="primary"
          className={styles.action}
          onClick={() => {
            setTool(action.tool);
          }}
        >
          {action.label}
        </Button>
      )}
    </section>
  );
}
