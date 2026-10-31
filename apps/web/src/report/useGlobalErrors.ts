import { useEffect } from 'react';
import { useNotify } from '../ui/notices';

/** Not bugs: a cancelled task, and the browser's own ResizeObserver note, which carries no error object. */
function ignorable(error: unknown): boolean {
  return error == null || (error instanceof DOMException && error.name === 'AbortError');
}

/**
 * Turns an error nothing caught (a throw in an event handler, a rejected promise) into an error notice, which
 * offers the error reporter (ARCHITECTURE §11). Render crashes are the error boundary's.
 */
export function useGlobalErrors(): void {
  const notify = useNotify();
  useEffect(() => {
    const show = (error: unknown) => {
      if (ignorable(error)) return;
      notify({
        intent: 'error',
        title: 'Something went wrong',
        body: error instanceof Error ? error.message : String(error),
        error,
      });
    };
    const onError = (event: ErrorEvent) => {
      show(event.error);
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      show(event.reason);
    };
    addEventListener('error', onError);
    addEventListener('unhandledrejection', onRejection);
    return () => {
      removeEventListener('error', onError);
      removeEventListener('unhandledrejection', onRejection);
    };
  }, [notify]);
}
