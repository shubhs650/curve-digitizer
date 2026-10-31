// A PDF with many pages, built in memory for the P7 memory check. Every page shares one content stream (axes, a
// grid and a curve), so a 1000-page file stays small while PDFium still parses each page on its own.

const CONTENT = [
  '0.5 w 0.8 G',
  ...Array.from({ length: 9 }, (_, i) => `${String(100 + i * 70)} 100 m ${String(100 + i * 70)} 500 l S`),
  '1.5 w 0 G 100 100 m 700 100 l S 100 100 m 100 500 l S',
  '2 w 0 0 0.7 RG 100 450 m 300 300 450 200 700 150 c S',
].join('\n');

export function manyPagePdf(pages: number): Buffer {
  const objects: string[] = [];
  const add = (body: string): number => objects.push(body);
  const catalog = add('');
  const tree = add('');
  const content = add(`<< /Length ${String(Buffer.byteLength(CONTENT))} >>\nstream\n${CONTENT}\nendstream`);
  const kids: number[] = [];
  for (let i = 0; i < pages; i++) {
    kids.push(
      add(
        `<< /Type /Page /Parent ${String(tree)} 0 R /MediaBox [0 0 842 595] /Contents ${String(content)} 0 R >>`,
      ),
    );
  }
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${String(tree)} 0 R >>`;
  objects[tree - 1] =
    `<< /Type /Pages /Kids [${kids.map((k) => `${String(k)} 0 R`).join(' ')}] /Count ${String(pages)} >>`;

  let pdf = '%PDF-1.7\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${String(i + 1)} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${String(objects.length + 1)}\n0000000000 65535 f \n`;
  pdf += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${String(objects.length + 1)} /Root ${String(catalog)} 0 R >>\nstartxref\n${String(xref)}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}
