import { strToU8, zipSync, type Zippable } from 'fflate';

// A minimal Office Open XML (SpreadsheetML) writer: inline strings, numbers, booleans, formulas, a bold header
// style, frozen header rows, column widths, workbook names, and drawings holding charts and PNG images. That
// covers the workbook (tasks 1.9 and 3.4) without a spreadsheet library; ADR 27 records why not ExcelJS, ADR 43
// what the formulas and charts are.

/** A formula as the file stores it (no leading `=`), with the value it had when written, if known. */
export interface FormulaCell {
  readonly formula: string;
  readonly value: number | null;
}

export type Cell = string | number | boolean | null | FormulaCell;

/** Where a drawing object sits: its top-left cell (0-based) and its size in screen pixels. */
export interface Anchor {
  readonly col: number;
  readonly row: number;
  readonly widthPx: number;
  readonly heightPx: number;
}

/** A chart on a sheet: the `c:chartSpace` part, see chart.ts. */
export interface SheetChart {
  readonly anchor: Anchor;
  readonly name: string;
  readonly xml: string;
}

/** A PNG on a sheet. */
export interface SheetImage {
  readonly anchor: Anchor;
  readonly name: string;
  /** Alternative text. */
  readonly description: string;
  readonly png: Uint8Array;
}

/** A workbook-level name, e.g. `pump_a_c` for `'Fit'!$A$12:$A$15`. */
export interface DefinedName {
  readonly name: string;
  readonly ref: string;
}

export interface SheetSpec {
  /** Excel's limits apply: ≤ 31 characters, none of []:*?/\ — use {@link sheetName}. */
  readonly name: string;
  readonly rows: readonly (readonly Cell[])[];
  /** Leading rows shown bold and frozen while scrolling. */
  readonly headerRows?: number;
  /** Column widths in characters. */
  readonly widths?: readonly number[];
  /** Rows (0-based) shown bold, besides the header. */
  readonly boldRows?: readonly number[];
  /** Body text in a monospaced font (code). */
  readonly mono?: boolean;
  readonly charts?: readonly SheetChart[];
  readonly images?: readonly SheetImage[];
}

const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const DRAWING_NS = 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing';
const A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const CHART_NS = 'http://schemas.openxmlformats.org/drawingml/2006/chart';
/** English Metric Units per screen pixel at 96 DPI. */
const EMU_PER_PX = 9525;

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

/** An absolute reference to a cell or a range on a sheet, e.g. `'Fit 2'!$B$3:$B$9` (0-based indices). */
export function sheetRef(sheet: string, col: number, row: number, toCol = col, toRow = row): string {
  const cell = (c: number, r: number) => `$${columnName(c)}$${String(r + 1)}`;
  const range = toCol === col && toRow === row ? cell(col, row) : `${cell(col, row)}:${cell(toCol, toRow)}`;
  return `'${sheet.replaceAll("'", "''")}'!${range}`;
}

const STYLE_BOLD = 1;
const STYLE_MONO = 2;

function cellXml(value: Cell, ref: string, styleId: number): string {
  const style = styleId > 0 ? ` s="${String(styleId)}"` : '';
  if (value === null || value === '') return '';
  if (typeof value === 'object') {
    const cached =
      value.value !== null && Number.isFinite(value.value) ? `<v>${String(value.value)}</v>` : '';
    return `<c r="${ref}"${style}><f>${xmlText(value.formula)}</f>${cached}</c>`;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? `<c r="${ref}"${style}><v>${String(value)}</v></c>` : '';
  }
  if (typeof value === 'boolean') return `<c r="${ref}"${style} t="b"><v>${value ? '1' : '0'}</v></c>`;
  const space = /^\s|\s$/.test(value) ? ' xml:space="preserve"' : '';
  return `<c r="${ref}"${style} t="inlineStr"><is><t${space}>${xmlText(value)}</t></is></c>`;
}

function sheetXml(
  { rows, headerRows = 0, widths = [], boldRows = [], mono = false }: SheetSpec,
  drawingRel: string | null,
): string {
  const bold = new Set(boldRows);
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
      const style = r < headerRows || bold.has(r) ? STYLE_BOLD : mono ? STYLE_MONO : 0;
      const xml = cells.map((c, i) => cellXml(c, `${columnName(i)}${n}`, style)).join('');
      return `<row r="${n}">${xml}</row>`;
    })
    .join('');
  const drawing = drawingRel === null ? '' : `<drawing r:id="${drawingRel}"/>`;
  return `${XML_HEAD}<worksheet xmlns="${MAIN}" xmlns:r="${REL}">${pane}${cols}<sheetData>${data}</sheetData>${drawing}</worksheet>`;
}

function anchorXml({ col, row, widthPx, heightPx }: Anchor, body: string): string {
  return `<xdr:oneCellAnchor><xdr:from><xdr:col>${String(col)}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${String(
    row,
  )}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="${String(Math.round(widthPx * EMU_PER_PX))}" cy="${String(
    Math.round(heightPx * EMU_PER_PX),
  )}"/>${body}<xdr:clientData/></xdr:oneCellAnchor>`;
}

/** A sheet's drawing part: its charts, then its images, each with relationship ids rId1, rId2, … in order. */
function drawingXml(sheet: SheetSpec): string {
  const charts = sheet.charts ?? [];
  const images = sheet.images ?? [];
  let id = 1;
  const objects = [
    ...charts.map((chart) => {
      id += 1;
      return anchorXml(
        chart.anchor,
        `<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${String(id)}" name="${xmlText(
          chart.name,
        )}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="${CHART_NS}"><c:chart xmlns:c="${CHART_NS}" r:id="rId${String(
          id - 1,
        )}"/></a:graphicData></a:graphic></xdr:graphicFrame>`,
      );
    }),
    ...images.map((image) => {
      id += 1;
      const { widthPx, heightPx } = image.anchor;
      return anchorXml(
        image.anchor,
        `<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${String(id)}" name="${xmlText(image.name)}" descr="${xmlText(
          image.description,
        )}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId${String(
          id - 1,
        )}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${String(
          Math.round(widthPx * EMU_PER_PX),
        )}" cy="${String(Math.round(heightPx * EMU_PER_PX))}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic>`,
      );
    }),
  ];
  return `${XML_HEAD}<xdr:wsDr xmlns:xdr="${DRAWING_NS}" xmlns:a="${A_NS}" xmlns:r="${REL}">${objects.join('')}</xdr:wsDr>`;
}

const hasDrawing = (sheet: SheetSpec) => (sheet.charts?.length ?? 0) + (sheet.images?.length ?? 0) > 0;

/** Where each sheet's drawing objects go: drawing, chart and image part numbers, counted across the workbook. */
interface Layout {
  readonly drawing: number | null;
  readonly charts: readonly number[];
  readonly images: readonly number[];
}

function layout(sheets: readonly SheetSpec[]): Layout[] {
  let drawings = 0;
  let charts = 0;
  let images = 0;
  return sheets.map((sheet) => ({
    drawing: hasDrawing(sheet) ? ++drawings : null,
    charts: (sheet.charts ?? []).map(() => ++charts),
    images: (sheet.images ?? []).map(() => ++images),
  }));
}

/** The workbook's options beyond its sheets. */
export interface WorkbookOptions {
  readonly names?: readonly DefinedName[];
}

const STYLES = `${XML_HEAD}<styleSheet xmlns="${MAIN}"><fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><sz val="10"/><name val="Consolas"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

const override = (part: string, type: string) =>
  `<Override PartName="/${part}" ContentType="application/vnd.openxmlformats-officedocument.${type}"/>`;

const relationship = (id: string, type: string, target: string) =>
  `<Relationship Id="${id}" Type="${REL}/${type}" Target="${target}"/>`;

const relationships = (items: readonly string[]) =>
  `${XML_HEAD}<Relationships xmlns="${PKG_REL}">${items.join('')}</Relationships>`;

/**
 * The workbook's XML parts by path inside the zip; exposed so tests can compare XML instead of zip bytes. Images
 * are binary and come from {@link xlsxMedia}.
 */
export function xlsxParts(
  sheets: readonly SheetSpec[],
  options: WorkbookOptions = {},
): Record<string, string> {
  if (sheets.length === 0) throw new RangeError('A workbook needs at least one sheet');
  const names = new Set<string>();
  for (const s of sheets) {
    if (s.name !== sheetName(s.name, names))
      throw new RangeError(`Invalid or duplicate sheet name "${s.name}"`);
    names.add(s.name);
  }
  const defined = options.names ?? [];
  const lowerNames = new Set<string>();
  for (const { name } of defined) {
    if (!/^[A-Za-z_][A-Za-z0-9_.]*$/.test(name) || /^[A-Za-z]{1,3}\d+$/.test(name) || /^[RC]$/i.test(name))
      throw new RangeError(`"${name}" is not a valid workbook name`);
    if (lowerNames.has(name.toLowerCase())) throw new RangeError(`Duplicate workbook name "${name}"`);
    lowerNames.add(name.toLowerCase());
  }
  const places = layout(sheets);
  const sheetParts = sheets.map((_, i) => `xl/worksheets/sheet${String(i + 1)}.xml`);
  const drawingParts = places.flatMap((p) => (p.drawing === null ? [] : [p.drawing]));
  const chartParts = places.flatMap((p) => p.charts);
  const anyImage = places.some((p) => p.images.length > 0);
  const definedXml =
    defined.length === 0
      ? ''
      : `<definedNames>${defined
          .map((d) => `<definedName name="${xmlText(d.name)}">${xmlText(d.ref)}</definedName>`)
          .join('')}</definedNames>`;
  const parts: Record<string, string> = {
    '[Content_Types].xml': `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${
      anyImage ? '<Default Extension="png" ContentType="image/png"/>' : ''
    }${override('xl/workbook.xml', 'spreadsheetml.sheet.main+xml')}${override('xl/styles.xml', 'spreadsheetml.styles+xml')}${sheetParts
      .map((p) => override(p, 'spreadsheetml.worksheet+xml'))
      .join('')}${drawingParts
      .map((n) => override(`xl/drawings/drawing${String(n)}.xml`, 'drawing+xml'))
      .join('')}${chartParts
      .map((n) => override(`xl/charts/chart${String(n)}.xml`, 'drawingml.chart+xml'))
      .join('')}</Types>`,
    '_rels/.rels': relationships([relationship('rId1', 'officeDocument', 'xl/workbook.xml')]),
    // fullCalcOnLoad: Excel recomputes every formula on open, so the cached values never stand in for them.
    'xl/workbook.xml': `${XML_HEAD}<workbook xmlns="${MAIN}" xmlns:r="${REL}"><sheets>${sheets
      .map(
        (s, i) => `<sheet name="${xmlText(s.name)}" sheetId="${String(i + 1)}" r:id="rId${String(i + 1)}"/>`,
      )
      .join('')}</sheets>${definedXml}<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`,
    'xl/_rels/workbook.xml.rels': relationships([
      ...sheets.map((_, i) =>
        relationship(`rId${String(i + 1)}`, 'worksheet', `worksheets/sheet${String(i + 1)}.xml`),
      ),
      relationship(`rId${String(sheets.length + 1)}`, 'styles', 'styles.xml'),
    ]),
    'xl/styles.xml': STYLES,
  };
  sheets.forEach((sheet, i) => {
    const place = places[i];
    const drawing = place?.drawing ?? null;
    parts[sheetParts[i] ?? ''] = sheetXml(sheet, drawing === null ? null : 'rId1');
    if (drawing === null || !place) return;
    const d = String(drawing);
    parts[`xl/worksheets/_rels/sheet${String(i + 1)}.xml.rels`] = relationships([
      relationship('rId1', 'drawing', `../drawings/drawing${d}.xml`),
    ]);
    parts[`xl/drawings/drawing${d}.xml`] = drawingXml(sheet);
    parts[`xl/drawings/_rels/drawing${d}.xml.rels`] = relationships([
      ...place.charts.map((n, k) =>
        relationship(`rId${String(k + 1)}`, 'chart', `../charts/chart${String(n)}.xml`),
      ),
      ...place.images.map((n, k) =>
        relationship(`rId${String(place.charts.length + k + 1)}`, 'image', `../media/image${String(n)}.png`),
      ),
    ]);
    (sheet.charts ?? []).forEach((chart, k) => {
      parts[`xl/charts/chart${String(place.charts[k])}.xml`] = chart.xml;
    });
  });
  return parts;
}

/** The workbook's images by path inside the zip. */
export function xlsxMedia(sheets: readonly SheetSpec[]): Record<string, Uint8Array> {
  const media: Record<string, Uint8Array> = {};
  const places = layout(sheets);
  sheets.forEach((sheet, i) => {
    (sheet.images ?? []).forEach((image, k) => {
      media[`xl/media/image${String(places[i]?.images[k])}.png`] = image.png;
    });
  });
  return media;
}

/** Zips the parts; entries are stamped with `mtime` so the same workbook always gives the same bytes. */
export function writeXlsx(
  sheets: readonly SheetSpec[],
  mtime: Date,
  options: WorkbookOptions = {},
): Uint8Array {
  const files: Zippable = {};
  for (const [path, xml] of Object.entries(xlsxParts(sheets, options))) files[path] = strToU8(xml);
  // PNG is already deflated: storing it saves the time of compressing it again.
  for (const [path, png] of Object.entries(xlsxMedia(sheets))) files[path] = [png, { level: 0 }];
  return zipSync(files, { level: 6, mtime });
}
