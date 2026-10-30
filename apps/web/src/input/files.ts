import type { InputFile } from '../session/workspace';

/** What the file picker offers: the image types a Graph can come from (PRD §4.1). */
export const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp';

export async function readInputFiles(files: Iterable<File>): Promise<InputFile[]> {
  return Promise.all(
    [...files].map(async (file) => ({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) })),
  );
}

/** True when a drag carries files, so the page should accept the drop instead of letting the browser open it. */
export function dragHasFiles(transfer: DataTransfer | null): boolean {
  return transfer !== null && [...transfer.types].includes('Files');
}

/** Pastes into text fields stay text pastes. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
  );
}
