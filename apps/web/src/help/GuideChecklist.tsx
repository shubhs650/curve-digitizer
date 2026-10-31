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
} from '@fluentui/react-icons';
import { useState } from 'react';
import { useActiveGraph, useProject } from '../session/context';
import { useUiStore } from '../ui/uiStore';
import { currentStep, guidePreference, type GuideStepId, guideSteps } from './guide';

const useStyles = makeStyles({
  guide: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    padding: tokens.spacingHorizontalS,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  steps: {
    listStyleType: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
  },
  step: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
  },
  done: {
    color: tokens.colorPaletteGreenForeground1,
  },
  current: {
    fontWeight: tokens.fontWeightSemibold,
  },
  hint: {
    paddingLeft: tokens.spacingHorizontalL,
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
  return (
    <section aria-labelledby="guide-heading" className={styles.guide}>
      <div className={styles.header}>
        <Caption1Strong id="guide-heading">Getting started</Caption1Strong>
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
          <li key={step.id} aria-current={step === current ? 'step' : undefined}>
            <div className={mergeClasses(styles.step, step === current && styles.current)}>
              {step.done ? (
                <CheckmarkCircleFilled className={styles.done} aria-hidden="true" />
              ) : (
                <CircleRegular aria-hidden="true" />
              )}
              <Caption1 className={step === current ? styles.current : undefined}>
                {i + 1}. {step.title}
                <span className={styles.visuallyHidden}>
                  {step.done ? ', done' : step === current ? ', next' : ''}
                </span>
              </Caption1>
            </div>
            {step === current && <Caption1 className={styles.hint}>{step.hint}</Caption1>}
          </li>
        ))}
      </ol>
      {current === null && <Caption1>All done. The checklist can be hidden now.</Caption1>}
      {action && (
        <Button
          size="small"
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
