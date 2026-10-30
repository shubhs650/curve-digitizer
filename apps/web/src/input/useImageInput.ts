import { useEffect, useState } from 'react';
import { dragHasFiles, isEditableTarget } from './files';

/** Minimal typing of the File Handling API (Chromium only), which the TypeScript DOM library does not declare. */
interface LaunchParams {
  readonly files: readonly FileSystemFileHandle[];
}
interface LaunchQueue {
  setConsumer(consumer: (params: LaunchParams) => void): void;
}

/**
 * Feeds files dropped anywhere on the page, pasted from the clipboard, or opened with the installed app
 * (manifest `file_handlers`) to `onFiles`. Returns whether a file drag is over the page, for a drop hint.
 */
export function useImageInput(onFiles: (files: File[]) => void): boolean {
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    let depth = 0;
    const onDragEnter = (event: DragEvent) => {
      if (!dragHasFiles(event.dataTransfer)) return;
      depth++;
      setDragging(true);
    };
    const onDragLeave = (event: DragEvent) => {
      if (!dragHasFiles(event.dataTransfer)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const onDragOver = (event: DragEvent) => {
      if (!dragHasFiles(event.dataTransfer)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    };
    const onDrop = (event: DragEvent) => {
      depth = 0;
      setDragging(false);
      const files = event.dataTransfer?.files;
      if (!files || files.length === 0) return;
      event.preventDefault();
      onFiles([...files]);
    };
    const onPaste = (event: ClipboardEvent) => {
      if (isEditableTarget(event.target)) return;
      const files = event.clipboardData?.files;
      if (!files || files.length === 0) return;
      event.preventDefault();
      onFiles([...files]);
    };
    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    document.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
      document.removeEventListener('paste', onPaste);
    };
  }, [onFiles]);

  useEffect(() => {
    const queue = (window as { launchQueue?: LaunchQueue }).launchQueue;
    queue?.setConsumer((params) => {
      void Promise.all(params.files.map((handle) => handle.getFile())).then(onFiles);
    });
  }, [onFiles]);

  return dragging;
}
