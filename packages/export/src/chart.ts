import { xmlText } from './xlsx.ts';

// A DrawingML scatter chart (task 3.4): the digitised points of each dataset as markers and each kept fit as a
// line, on linear or log axes like the graph. Series read their cells, so editing the data or a fit
// coefficient redraws the chart; the cached values are only what shows before Excel recalculates.

const C = 'http://schemas.openxmlformats.org/drawingml/2006/chart';
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

/** A column of numbers on a sheet, by absolute reference, with the values it holds now. */
export interface ChartData {
  readonly ref: string;
  readonly values: readonly (number | null)[];
}

export interface ChartSeries {
  readonly name: string;
  /** `#rrggbb`. */
  readonly color: string;
  /** Markers only (digitised points), or a line without markers (a fit). */
  readonly kind: 'points' | 'line';
  readonly x: ChartData;
  readonly y: ChartData;
}

export interface ChartAxis {
  readonly title: string;
  readonly log: boolean;
}

export interface ScatterChart {
  readonly title: string;
  readonly x: ChartAxis;
  readonly y: ChartAxis;
  readonly series: readonly ChartSeries[];
}

const X_AXIS_ID = 101;
const Y_AXIS_ID = 102;

function rgb(color: string): string {
  const hex = /^#?([0-9a-f]{6})$/i.exec(color)?.[1];
  return (hex ?? '1F77B4').toUpperCase();
}

function text(value: string): string {
  return `<c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr b="0"/></a:pPr><a:r><a:t>${xmlText(
    value,
  )}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/>`;
}

function numbers(data: ChartData): string {
  const points = data.values
    .map((v, i) =>
      v === null || !Number.isFinite(v) ? '' : `<c:pt idx="${String(i)}"><c:v>${String(v)}</c:v></c:pt>`,
    )
    .join('');
  return `<c:numRef><c:f>${xmlText(data.ref)}</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${String(
    data.values.length,
  )}"/>${points}</c:numCache></c:numRef>`;
}

function seriesXml(s: ChartSeries, index: number): string {
  const color = `<a:solidFill><a:srgbClr val="${rgb(s.color)}"/></a:solidFill>`;
  const look =
    s.kind === 'points'
      ? `<c:spPr><a:ln w="19050"><a:noFill/></a:ln></c:spPr><c:marker><c:symbol val="circle"/><c:size val="5"/><c:spPr>${color}<a:ln><a:noFill/></a:ln></c:spPr></c:marker>`
      : `<c:spPr><a:ln w="19050" cap="rnd">${color}<a:round/></a:ln></c:spPr><c:marker><c:symbol val="none"/></c:marker>`;
  return `<c:ser><c:idx val="${String(index)}"/><c:order val="${String(index)}"/><c:tx><c:v>${xmlText(
    s.name,
  )}</c:v></c:tx>${look}<c:xVal>${numbers(s.x)}</c:xVal><c:yVal>${numbers(s.y)}</c:yVal><c:smooth val="0"/></c:ser>`;
}

function axisXml(axis: ChartAxis, id: number, cross: number, position: 'b' | 'l'): string {
  const scaling = `<c:scaling>${axis.log ? '<c:logBase val="10"/>' : ''}<c:orientation val="minMax"/></c:scaling>`;
  return `<c:valAx><c:axId val="${String(id)}"/>${scaling}<c:delete val="0"/><c:axPos val="${position}"/><c:majorGridlines><c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="D9D9D9"/></a:solidFill></a:ln></c:spPr></c:majorGridlines><c:title>${text(
    axis.title,
  )}</c:title><c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="low"/><c:crossAx val="${String(
    cross,
  )}"/><c:crosses val="autoZero"/><c:crossBetween val="midCat"/></c:valAx>`;
}

/** The chart part (`xl/charts/chartN.xml`). */
export function scatterChartXml(chart: ScatterChart): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<c:chartSpace xmlns:c="${C}" xmlns:a="${A}" xmlns:r="${R}"><c:roundedCorners val="0"/><c:chart><c:title>${text(
    chart.title,
  )}</c:title><c:autoTitleDeleted val="0"/><c:plotArea><c:layout/><c:scatterChart><c:scatterStyle val="lineMarker"/><c:varyColors val="0"/>${chart.series
    .map(seriesXml)
    .join(
      '',
    )}<c:axId val="${String(X_AXIS_ID)}"/><c:axId val="${String(Y_AXIS_ID)}"/></c:scatterChart>${axisXml(
    chart.x,
    X_AXIS_ID,
    Y_AXIS_ID,
    'b',
  )}${axisXml(chart.y, Y_AXIS_ID, X_AXIS_ID, 'l')}</c:plotArea><c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart></c:chartSpace>`;
}
