// A small evaluator for the worksheet formulas the Excel code generator writes (A8: "Excel via formula
// evaluator"). It follows Excel where the generated formulas depend on it: typed numbers keep 15 significant
// digits, negation binds tighter than ^ (-2^2 is 4), errors propagate, and MATCH(…, 1) / INDEX / LET / IFERROR
// behave as documented. Anything it does not know (a function, a name) throws, so a typo fails the test
// rather than evaluating to something.

export type ExcelError = { readonly error: '#NUM!' | '#DIV/0!' | '#N/A' | '#REF!' | '#VALUE!' };
export type ExcelValue = number | string | readonly number[] | ExcelError;

type Node =
  | { readonly t: 'num'; readonly value: number }
  | { readonly t: 'str'; readonly value: string }
  | { readonly t: 'array'; readonly items: readonly number[] }
  | { readonly t: 'name'; readonly name: string }
  | { readonly t: 'neg'; readonly arg: Node }
  | { readonly t: 'bin'; readonly op: string; readonly left: Node; readonly right: Node }
  | { readonly t: 'call'; readonly fn: string; readonly args: readonly Node[] };

const TOKEN =
  /\s*(?:(\d+(?:\.\d*)?(?:E[-+]?\d+)?|\.\d+(?:E[-+]?\d+)?)|("(?:[^"]|"")*")|(\$?[A-Za-z_][A-Za-z0-9_.]*\$?\d*)|(<=|>=|<>|[-+*/^&=<>(),{}]))/iy;

function tokenize(text: string): string[] {
  const tokens: string[] = [];
  TOKEN.lastIndex = 0;
  while (TOKEN.lastIndex < text.length) {
    const start = TOKEN.lastIndex;
    const m = TOKEN.exec(text);
    if (!m) {
      if (text.slice(start).trim() === '') break;
      throw new SyntaxError(`Unexpected text at ${String(start)}: ${text.slice(start, start + 20)}`);
    }
    tokens.push(m[1] ?? m[2] ?? m[3] ?? m[4] ?? '');
  }
  return tokens;
}

/** Excel stores a typed number to 15 significant digits. */
function typed(text: string): number {
  return Number(Number(text).toPrecision(15));
}

const BINARY: Readonly<Record<string, number>> = {
  '=': 1,
  '<': 1,
  '>': 1,
  '<=': 1,
  '>=': 1,
  '<>': 1,
  '&': 2,
  '+': 3,
  '-': 3,
  '*': 4,
  '/': 4,
  '^': 5,
};

function parse(text: string): Node {
  const tokens = tokenize(text.replace(/^=/, ''));
  let i = 0;
  const peek = () => tokens[i];
  const take = (expected?: string): string => {
    const token = tokens[i++];
    if (token === undefined || (expected !== undefined && token !== expected))
      throw new SyntaxError(`Expected ${expected ?? 'a token'}, got ${token ?? 'the end'}`);
    return token;
  };
  // Negation binds tighter than every binary operator, ^ included.
  const unary = (): Node => {
    if (peek() === '-') {
      take();
      return { t: 'neg', arg: unary() };
    }
    if (peek() === '+') {
      take();
      return unary();
    }
    return primary();
  };
  const primary = (): Node => {
    const token = take();
    if (token === '(') {
      const node = expression(0);
      take(')');
      return node;
    }
    if (token === '{') {
      const items: number[] = [];
      for (;;) {
        const negative = peek() === '-' ? (take(), true) : false;
        const value = typed(take());
        items.push(negative ? -value : value);
        if (take() === '}') break;
      }
      return { t: 'array', items };
    }
    if (token.startsWith('"')) return { t: 'str', value: token.slice(1, -1).replace(/""/g, '"') };
    if (/^[\d.]/.test(token)) return { t: 'num', value: typed(token) };
    if (peek() === '(') {
      take();
      const args: Node[] = [];
      if (peek() !== ')') {
        for (;;) {
          args.push(expression(0));
          if (take() === ')') break;
        }
      } else take();
      return { t: 'call', fn: token.toUpperCase(), args };
    }
    return { t: 'name', name: token };
  };
  const expression = (min: number): Node => {
    let left = unary();
    for (;;) {
      const op = peek();
      const level = op === undefined ? undefined : BINARY[op];
      if (level === undefined || level < min) return left;
      take();
      // ^ is left-associative in Excel (2^3^2 = 64), like the others.
      left = { t: 'bin', op: op ?? '', left, right: expression(level + 1) };
    }
  };
  const node = expression(0);
  if (i !== tokens.length) throw new SyntaxError(`Unexpected ${tokens[i] ?? ''}`);
  return node;
}

const isError = (v: ExcelValue): v is ExcelError => typeof v === 'object' && 'error' in v;
const err = (error: ExcelError['error']): ExcelError => ({ error });

function num(v: ExcelValue): number | ExcelError {
  if (typeof v === 'number') return v;
  if (isError(v)) return v;
  return err('#VALUE!');
}

/** Excel shows no NaN or infinity: an out-of-range result is #NUM!. */
function result(value: number): number | ExcelError {
  return Number.isFinite(value) ? value : err('#NUM!');
}

function arithmetic(op: string, a: number, b: number): number | ExcelError {
  switch (op) {
    case '+':
      return result(a + b);
    case '-':
      return result(a - b);
    case '*':
      return result(a * b);
    case '/':
      return b === 0 ? err('#DIV/0!') : result(a / b);
    case '^':
      return a === 0 && b < 0 ? err('#DIV/0!') : result(a ** b);
    default:
      throw new SyntaxError(`Operator ${op} is not supported`);
  }
}

type Scope = ReadonlyMap<string, ExcelValue>;

function evaluate(node: Node, scope: Scope): ExcelValue {
  switch (node.t) {
    case 'num':
    case 'str':
      return node.value;
    case 'array':
      return node.items;
    case 'name': {
      const value = scope.get(bare(node.name.replace(/\$/g, '')));
      if (value === undefined) throw new ReferenceError(`Unknown name ${node.name}`);
      return value;
    }
    case 'neg': {
      const a = num(evaluate(node.arg, scope));
      return isError(a) ? a : -a;
    }
    case 'bin': {
      const a = num(evaluate(node.left, scope));
      if (isError(a)) return a;
      const b = num(evaluate(node.right, scope));
      if (isError(b)) return b;
      return arithmetic(node.op, a, b);
    }
    case 'call':
      return call(node.fn, node.args, scope);
  }
}

/**
 * A name as Excel compares it: case-insensitive, and without the `_xlpm.` prefix a worksheet file gives LET's
 * names (functions newer than the file format are stored `_xlfn.NAME`).
 */
function bare(name: string): string {
  return name.toUpperCase().replace(/^_XLPM\./, '');
}

function call(stored: string, args: readonly Node[], scope: Scope): ExcelValue {
  const fn = stored.toUpperCase().replace(/^_XLFN\./, '');
  const arg = (k: number): ExcelValue => {
    const a = args[k];
    if (a === undefined) throw new SyntaxError(`${fn} needs argument ${String(k + 1)}`);
    return evaluate(a, scope);
  };
  const numeric = (k: number, f: (x: number) => number | ExcelError): ExcelValue => {
    const x = num(arg(k));
    return isError(x) ? x : f(x);
  };
  switch (fn) {
    case 'LET': {
      if (args.length % 2 === 0) throw new SyntaxError('LET needs name, value pairs and a result');
      const inner = new Map(scope);
      for (let k = 0; k < args.length - 1; k += 2) {
        const name = args[k];
        if (name?.t !== 'name') throw new SyntaxError('LET names must be names');
        if (/^[RC]$/i.test(bare(name.name)) || /^\$?[A-Z]{1,3}\$?\d+$/i.test(bare(name.name)))
          throw new SyntaxError(`${name.name} cannot be a LET name in Excel`);
        inner.set(bare(name.name), evaluate(args[k + 1] as Node, inner));
      }
      return evaluate(args[args.length - 1] as Node, inner);
    }
    case 'LOG10':
      return numeric(0, (x) => (x > 0 ? Math.log10(x) : err('#NUM!')));
    case 'LN':
      return numeric(0, (x) => (x > 0 ? Math.log(x) : err('#NUM!')));
    case 'EXP':
      return numeric(0, (x) => result(Math.exp(x)));
    case 'N': {
      const v = arg(0);
      return typeof v === 'string' ? 0 : v;
    }
    case 'IFERROR': {
      const v = arg(0);
      return isError(v) ? arg(1) : v;
    }
    case 'MIN':
    case 'MAX': {
      const values = args.map((_, k) => num(arg(k)));
      const error = values.find(isError);
      if (error) return error;
      return (fn === 'MIN' ? Math.min : Math.max)(...(values as number[]));
    }
    case 'MATCH': {
      const lookup = num(arg(0));
      const array = arg(1);
      if (isError(lookup)) return lookup;
      if (!Array.isArray(array) || num(arg(2)) !== 1)
        throw new SyntaxError('Only MATCH(x, array, 1) is supported');
      // The position of the largest value <= lookup in an ascending array; #N/A before the first.
      let position = 0;
      (array as readonly number[]).forEach((v, k) => {
        if (v <= lookup) position = k + 1;
      });
      return position === 0 ? err('#N/A') : position;
    }
    case 'INDEX': {
      const array = arg(0);
      const k = num(arg(1));
      if (isError(k)) return k;
      // A one-cell range is a number here; INDEX(cell, 1) is that cell.
      if (typeof array === 'number') return Math.trunc(k) === 1 ? array : err('#REF!');
      if (!Array.isArray(array)) throw new SyntaxError('Only INDEX(array, n) is supported');
      const value = (array as readonly number[])[Math.trunc(k) - 1];
      return value === undefined ? err('#REF!') : value;
    }
    default:
      throw new SyntaxError(`Function ${fn} is not supported`);
  }
}

/** Cell and workbook-name values a formula reads: a number, or a column of numbers for a range. */
export type Cells = Readonly<Record<string, number | readonly number[]>>;

/** The value of a worksheet formula, with cell references and names taken from `cells` (e.g. `{ A2: 3 }`). */
export function evaluateFormula(formula: string, cells: Cells = {}): ExcelValue {
  const scope = new Map<string, ExcelValue>(
    Object.entries(cells).map(([ref, value]) => [ref.replace(/\$/g, '').toUpperCase(), value]),
  );
  return evaluate(parse(formula.trim()), scope);
}

/** The formula's number, or NaN for an Excel error (the app's NaN where a fit is undefined). */
export function formulaNumber(formula: string, cells: Cells): number {
  const value = evaluateFormula(formula, cells);
  return typeof value === 'number' ? value : Number.NaN;
}
