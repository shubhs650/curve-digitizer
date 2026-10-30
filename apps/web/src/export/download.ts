/** Saves bytes as a file through a temporary object URL and a download link; nothing leaves the device. */
export function downloadFile(bytes: ArrayBuffer | Uint8Array, fileName: string, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mimeType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();
  // Revoking right away can cancel the download in some browsers.
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 60_000);
}

/** A file name safe on Windows, macOS and Linux: reserved characters replaced, length bounded. */
export function safeFileName(name: string, extension: string): string {
  const base = name
    // Control characters are never valid in file names.
    // eslint-disable-next-line no-control-regex
    .replaceAll(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replaceAll(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
    .slice(0, 120);
  return `${base === '' ? 'export' : base}.${extension}`;
}
