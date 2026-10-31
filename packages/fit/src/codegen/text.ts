import type { FitStats } from '@cd/core';
import { MODELS, isModelId } from '../models/index.ts';
import type { FitCurve } from '../types.ts';
import { type CodeForm, inFitSpace } from './form.ts';

/** A fit as the code generators need it: what it computes, where it was fitted, and how well. */
export type CodeFit = FitCurve & { readonly stats: FitStats };

/**
 * A number as source text. Full precision is the shortest text that reads back as the same double, which every
 * target language parses exactly; Excel keeps 15 significant digits of a typed number, so its text is rounded
 * there rather than silently by Excel.
 */
export function literal(value: number, digits: 'full' | 15 = 'full'): string {
  if (!Number.isFinite(value)) throw new RangeError(`Cannot write ${String(value)} as code`);
  return String(digits === 'full' ? value : Number(value.toPrecision(digits)));
}

/** Wraps a negative number's text in parentheses, for a position after an operator. */
export function operand(text: string): string {
  return text.startsWith('-') ? `(${text})` : text;
}

/**
 * Horner's scheme for c₀ + c₁·u + … + c_d·u^d as nested text, c₀ + u·(c₁ + u·(… + u·c_d)), with `mul` the
 * multiplication operator (`.*` in MATLAB) and `space` around the operators.
 */
export function horner(
  c: readonly string[],
  u: string,
  { mul = '*', space = ' ' }: { readonly mul?: string; readonly space?: string } = {},
): string {
  const [first = '0', ...rest] = c;
  if (rest.length === 0) return first;
  const inner = horner(rest, u, { mul, space });
  const tail = rest.length === 1 ? operand(inner) : `(${inner})`;
  return `${first}${space}+${space}${u}${space}${mul}${space}${tail}`;
}

/** Text as a factor after `*` or `/`: a lone number as it is (negative in parentheses), anything else in parentheses. */
export function group(text: string): string {
  return /^-?[0-9.]+(e[-+]?[0-9]+)?$/i.test(text) ? operand(text) : `(${text})`;
}

/** `a + b·t` with the sign of b folded into the operator, so a negative b reads `a - 0.5*t`. */
export function plusTerm(a: string, b: number, t: string, lit: (n: number) => string, space = ' '): string {
  return `${a}${space}${b < 0 ? '-' : '+'}${space}${lit(Math.abs(b))}${space}*${space}${t}`;
}

/** Splits list items into lines of at most `width` characters (an item longer than that gets its own line). */
export function wrapItems(items: readonly string[], width: number, separator = ', '): string[] {
  const lines: string[] = [];
  let line = '';
  for (const item of items) {
    const next = line ? `${line}${separator}${item}` : item;
    if (line && next.length > width) {
      lines.push(line + separator.trimEnd());
      line = item;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** Text for comments: ASCII only (the VBA editor and older compilers mangle anything else), on one line. */
export function ascii(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[^\x20-\x7e]/g, '')
    .trim();
}

const RESERVED = new Set(
  (
    'and array as assert async auto await break byref byval call case catch char class const continue curve ' +
    'date def default del delete dim do double each else elseif end enum eqv error exec exit exp export ' +
    'extern false finally fix float for from function get global goto if imp import in inline int integer is ' +
    'lambda len let like log log10 long loop math me mod new next none nonlocal not np null numpy object ' +
    'on option or pass pow preserve print private property public raise redim register resume return select ' +
    'set short signed single sizeof static step stop string struct sub sum switch then this throw to true try ' +
    'type typedef typeof union unsigned until var variant void volatile wend while with xor yield'
  ).split(' '),
);

/**
 * A function name valid in every target language, from the dataset name: lower-case ASCII words joined by `_`.
 * Prefixed with `curve_` when it would be a keyword, start with a digit, or read as a cell reference in Excel
 * (`p1`), where a VBA function is called from a worksheet.
 */
export function identifier(name: string | undefined): string {
  const slug = ascii(name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
    .replace(/_+$/, '');
  if (slug === '') return 'curve';
  if (RESERVED.has(slug) || !/^[a-z]/.test(slug) || /^[a-z]{1,3}\d+$/.test(slug)) return `curve_${slug}`;
  return slug;
}

function stat(value: number): string {
  return Number.isFinite(value) ? String(Number(value.toPrecision(6))) : 'n/a';
}

const EQUATIONS: Readonly<Record<'power' | 'exp' | 'log', string>> = {
  power: 'y = a * x^b',
  exp: 'y = a * exp(b * x)',
  log: 'y = a + b * ln(x)',
};

/** What the fit is, in words, ASCII. */
function title(fit: CodeFit, form: CodeForm): string {
  if (!isModelId(fit.model)) throw new RangeError(`Unknown fit model ${fit.model}`);
  const model = MODELS[fit.model];
  if (form.kind === 'power' || form.kind === 'exp' || form.kind === 'log')
    return `${model.label}, ${EQUATIONS[form.kind]}`;
  return ascii(model.describe(fit.params));
}

/** The comment every generated snippet starts with, as ASCII lines without comment markers. */
export interface Header {
  /** The model, the dataset, the fit space, the X range it is valid for and its statistics. */
  readonly lines: readonly string[];
  /** The same in fewer words, for Excel's 255-character text in a formula. */
  readonly short: readonly string[];
}

export function header(fit: CodeFit, form: CodeForm, datasetName?: string): Header {
  const logY = fit.space.y === 'log';
  const name = datasetName === undefined ? '' : ascii(datasetName);
  const what = [`Curve Digitizer fit: ${title(fit, form)}`, ...(name ? [`Dataset: ${name}`] : [])];
  const [lo, hi] = fit.domain;
  const range = `Valid for ${stat(lo)} <= x <= ${stat(hi)}`;
  const points = `${String(fit.stats.n)} fitted points`;
  const r2 = `R^2 = ${stat(fit.stats.r2)}, RMSE = ${stat(fit.stats.rmse)}${logY ? ' (in log10 y)' : ''}`;
  const lines = [...what];
  if (inFitSpace(form) && (fit.space.x === 'log' || logY)) {
    const u = fit.space.x === 'log' ? 'u = log10(x)' : 'u = x';
    const y = logY ? 'y = 10^v' : 'y = v';
    lines.push(`Fitted on log paper: ${u}, ${y}`);
  }
  lines.push(
    `${range}, the range of the ${points}; outside it the curve is extrapolated`,
    `${r2}, AICc = ${stat(fit.stats.aicc)}`,
  );
  return { lines, short: [...what, `${range} (${points})`, r2] };
}

/** The fitted instance's code form. */
export function formOf(fit: CodeFit): CodeForm {
  if (!isModelId(fit.model)) throw new RangeError(`Unknown fit model ${fit.model}`);
  return MODELS[fit.model].form(fit.params);
}
