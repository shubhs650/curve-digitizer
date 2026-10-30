import { Toast, ToastBody, Toaster, ToastTitle, useToastController } from '@fluentui/react-components';
import { useCallback } from 'react';

const TOASTER_ID = 'app-notices';

export interface Notice {
  readonly title: string;
  readonly body?: string;
  readonly intent: 'error' | 'warning' | 'success' | 'info';
}

/** The app's single toast outlet; render once. */
export function Notices() {
  return <Toaster toasterId={TOASTER_ID} position="bottom-end" />;
}

/** Shows a toast through {@link Notices}. Errors stay longer because they usually need reading. */
export function useNotify(): (notice: Notice) => void {
  const { dispatchToast } = useToastController(TOASTER_ID);
  return useCallback(
    ({ title, body, intent }: Notice) => {
      dispatchToast(
        <Toast>
          <ToastTitle>{title}</ToastTitle>
          {body !== undefined && <ToastBody>{body}</ToastBody>}
        </Toast>,
        { intent, timeout: intent === 'error' ? 8000 : 4000 },
      );
    },
    [dispatchToast],
  );
}
