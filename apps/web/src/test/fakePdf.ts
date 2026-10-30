import type { PdfOpenOutput, RgbaImage } from '@cd/workers';
import type { PdfBackend } from '../session/pdf';

/** The password of {@link LOCKED_PDF}. */
export const FAKE_PASSWORD = 'pw';

const ascii = (text: string) => Uint8Array.from(text, (c) => c.charCodeAt(0));

/** Fake PDFs for {@link FakePdfBackend}; the text after the header picks the behaviour. */
export const PLAIN_PDF = ascii('%PDF-1.7 plain 2 pages');
export const LOCKED_PDF = ascii('%PDF-1.7 locked');
export const NO_COPY_PDF = ascii('%PDF-1.7 no-copy');

export function pdfFile(bytes: Uint8Array, name = 'chart.pdf'): File {
  return new File([bytes as Uint8Array<ArrayBuffer>], name, { type: 'application/pdf' });
}

/** Stands in for PDFium in the render worker: two A4 pages, a password, a no-copy flag, or PDFium missing. */
export class FakePdfBackend implements PdfBackend {
  readonly open_ = new Set<string>();
  unavailable = false;

  async open(key: string, file: Blob, password?: string): Promise<PdfOpenOutput> {
    const text = await file.text();
    if (this.unavailable) {
      return { status: 'failed', reason: 'pdfiumUnavailable', message: 'PDF support could not be loaded.' };
    }
    if (!text.startsWith('%PDF-')) return { status: 'failed', reason: 'notPdf', message: 'Not a PDF.' };
    if (text.includes('locked') && password !== FAKE_PASSWORD) {
      return password === undefined
        ? { status: 'failed', reason: 'passwordRequired', message: 'Password needed.' }
        : { status: 'failed', reason: 'wrongPassword', message: 'Wrong password.' };
    }
    this.open_.add(key);
    const page = { width: 595, height: 842, rotation: 0 } as const;
    return {
      status: 'opened',
      pages: [page, page],
      permissions: { copy: !text.includes('no-copy'), print: true },
      // Distinct per fake file, which is all the workspace needs.
      sha256: text.padEnd(64, '0').slice(0, 64),
    };
  }

  thumbnail(key: string, _pageIndex: number, maxSide: number): Promise<RgbaImage> {
    if (!this.open_.has(key)) return Promise.reject(new Error(`The PDF "${key}" is not open`));
    const width = Math.round((maxSide * 595) / 842);
    return Promise.resolve({ width, height: maxSide, rgba: new Uint8Array(width * maxSide * 4).fill(255) });
  }

  close(key: string): Promise<void> {
    this.open_.delete(key);
    return Promise.resolve();
  }
}
