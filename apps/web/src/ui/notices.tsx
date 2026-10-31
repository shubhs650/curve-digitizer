import {
  Link,
  Toast,
  ToastBody,
  Toaster,
  ToastTitle,
  ToastTrigger,
  useToastController,
} from '@fluentui/react-components';
import { useCallback } from 'react';
import { useReportStore } from '../report/reportStore';

const TOASTER_ID = 'app-notices';

export interface Notice {
  readonly title: string;
  readonly body?: string;
  readonly intent: 'error' | 'warning' | 'success' | 'info';
  /** What was thrown, for the error reporter that every error notice offers; else the body is reported. */
  readonly error?: unknown;
}

/** The app's single toast outlet; render once. */
export function Notices() {
  return <Toaster toasterId={TOASTER_ID} position="bottom-end" />;
}

/**
 * Shows a toast through {@link Notices}. Errors stay longer because they usually need reading, and offer the
 * error reporter (task 3.7), which sends nothing by itself.
 */
export function useNotify(): (notice: Notice) => void {
  const { dispatchToast } = useToastController(TOASTER_ID);
  return useCallback(
    ({ title, body, intent, error }: Notice) => {
      const report =
        intent === 'error' ? (
          // The trigger closes the toast: the dialog takes over from it.
          <ToastTrigger>
            <Link
              as="button"
              onClick={() => {
                useReportStore.getState().open({ error: error ?? body ?? title, title });
              }}
            >
              Report…
            </Link>
          </ToastTrigger>
        ) : null;
      dispatchToast(
        <Toast>
          <ToastTitle action={report}>{title}</ToastTitle>
          {body !== undefined && <ToastBody>{body}</ToastBody>}
        </Toast>,
        { intent, timeout: intent === 'error' ? 8000 : 4000 },
      );
    },
    [dispatchToast],
  );
}
