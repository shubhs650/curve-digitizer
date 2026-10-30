import { strToU8, zipSync, type Zippable } from 'fflate';

// A minimal Office Open XML (SpreadsheetML) writer: inline strings, numbers, booleans, a bold header style,
// frozen header rows and column widths. That covers the M1 "basic XLSX" without a spreadsheet library;
// ADR 27 records why ExcelJS was not used here.

export type Cell = string | number | boolean | null;

export interface SheetSpec {
  /** Excel's limits apply: ≤ 31 characters, none of []:*?/\ — use {@link sheetName}. */
  readonly name: string;
  readonly rows: readonly (readonly Cell[])[];
  /** Leading rows shown bold and frozen while scrolling. */
  readonly headerRows?: number;
  /** Column widths in characters. */
  readonly widths?: readonly number[];
}

const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

/** Escapes XML text and drops characters XML 1.0 cannot carry. */
export function xmlText(text: string): string {
  return text
    .replaceAll(/[^\t\n\r -퟿-�\u{10000}-\u{10FFFF}]/gu, '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** "A", "B", …, "Z", "AA", … for a 0-based column index. */
export function columnName(index: number): string {
  let n = index + 1;
  let name = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    name = String.fromCharCode(65 + r) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

/** A valid, unique sheet name: forbidden characters replaced, ≤ 31 characters, numbered on collision. */
export function sheetName(wanted: string, taken: ReadonlySet<string>): string {
  const base =
    wanted
      .replaceAll(/[[\]:*?/\\]/g, '-')
      .replaceAll(/^'+|'+$/g, '')
      .trim()
      .slice(0, 31) || 'Sheet';
  const lower = new Set([...taken].map((t) => t.toLowerCase()));
  if (!lower.has(base.toLowerCase())) return base;
  for (let i = 2; ; i++) {
    const suffix = ` (${String(i)})`;
    const name = base.slice(0, 31 - suffix.length) + suffix;
    if (!lower.has(name.toLowerCase())) return name;
  }
}

function cellXml(value: Cell, ref: string, bold: boolean): string {
  const style = bold ? ' s="1"' : '';
  if (value === null || value === '') return '';
  if (typeof value === 'number') {
    return Number.isFinite(value) ? `<c r="${ref}"${style}><v>${String(value)}</v></c>` : '';
  }
  if (typeof value === 'boolean') return `<c r="${ref}"${style} t="b"><v>${value ? '1' : '0'}</v></c>`;
  const space = /^\s|\s$/.test(value) ? ' xml:space="preserve"' : '';
  return `<c r="${ref}"${style} t="inlineStr"><is><t${space}>${xmlText(value)}</t></is></c>`;
}

function sheetXml({ rows, headerRows = 0, widths = [] }: SheetSpec): string {
  const pane =
    headerRows > 0
      ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${String(headerRows)}" topLeftCell="A${String(
          headerRows + 1,
        )}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
      : '';
  const cols =
    widths.length > 0
      ? `<cols>${widths
          .map(
            (w, i) =>
              `<col min="${String(i + 1)}" max="${String(i + 1)}" width="${String(w)}" customWidth="1"/>`,
          )
          .join('')}</cols>`
      : '';
  const data = rows
    .map((cells, r) => {
      const n = String(r + 1);
      const xml = cells.map((c, i) => cellXml(c, `${columnName(i)}${n}`, r < headerRows)).join('');
      return `<row r="${n}">${xml}</row>`;
    })
    .join('');
  return `${XML_HEAD}<worksheet xmlns="${MAIN}">${pane}${cols}<sheetData>${data}</sheetData></worksheet>`;
}

const STYLES = `${XML_HEAD}<styleSheet xmlns="${MAIN}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

/** The workbook's parts by path inside the zip; exposed so tests can compare XML instead of zip bytes. */
export function xlsxParts(sheets: readonly SheetSpec[]): Record<string, string> {
  if (sheets.length === 0) throw new RangeError('A workbook needs at least one sheet');
  const names = new Set<string>();
  for (const s of sheets) {
    if (s.name !== sheetName(s.name, names))
      throw new RangeError(`Invalid or duplicate sheet name "${s.name}"`);
    names.add(s.name);
  }
  const sheetParts = sheets.map((_, i) => `xl/worksheets/sheet${String(i + 1)}.xml`);
  const parts: Record<string, string> = {
    '[Content_Types].xml': `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheetParts
      .map(
        (p) =>
          `<Override PartName="/${p}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
      )
      .join('')}</Types>`,
    '_rels/.rels': `${XML_HEAD}<Relationships xmlns="${PKG_REL}"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `${XML_HEAD}<workbook xmlns="${MAIN}" xmlns:r="${REL}"><sheets>${sheets
      .map(
        (s, i) => `<sheet name="${xmlText(s.name)}" sheetId="${String(i + 1)}" r:id="rId${String(i + 1)}"/>`,
      )
      .join('')}</sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `${XML_HEAD}<Relationships xmlns="${PKG_REL}">${sheets
      .map(
        (_, i) =>
          `<Relationship Id="rId${String(i + 1)}" Type="${REL}/worksheet" Target="worksheets/sheet${String(i + 1)}.xml"/>`,
      )
      .join(
        '',
      )}<Relationship Id="rId${String(sheets.length + 1)}" Type="${REL}/styles" Target="styles.xml"/></Relationships>`,
    'xl/styles.xml': STYLES,
  };
  sheets.forEach((s, i) => {
    parts[sheetParts[i] ?? ''] = sheetXml(s);
  });
  return parts;
}

/** Zips the parts; entries are stamped with `mtime` so the same workbook always gives the same bytes. */
export function writeXlsx(sheets: readonly SheetSpec[], mtime: Date): Uint8Array {
  const files: Zippable = {};
  for (const [path, xml] of Object.entries(xlsxParts(sheets))) files[path] = strToU8(xml);
  return zipSync(files, { level: 6, mtime });
}
