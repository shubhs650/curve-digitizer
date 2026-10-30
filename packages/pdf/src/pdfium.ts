// The only static import of PDFium. `loadPdfEngine` imports this module dynamically, so the bundler puts the
// PDFium glue in its own chunk (named after this file, which the size check and the service worker's
// runtime-cache rule recognise) and nothing fetches it before the first PDF is opened (P2).
export { init } from '@embedpdf/pdfium';
