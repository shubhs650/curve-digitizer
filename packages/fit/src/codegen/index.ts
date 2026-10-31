import { c } from './c.ts';
import { excel } from './excel.ts';
import { javascript } from './javascript.ts';
import { type EmitContext, LANGUAGES, type LanguageId } from './languages.ts';
import { matlab } from './matlab.ts';
import { python } from './python.ts';
import { type CodeFit, formOf, header, identifier } from './text.ts';
import { vba } from './vba.ts';

export type { CodeForm } from './form.ts';
export { LANGUAGES, type Language, type LanguageId } from './languages.ts';
export { type CodeFit, identifier } from './text.ts';

const GENERATORS: Readonly<Record<LanguageId, (context: EmitContext) => string>> = {
  python,
  javascript,
  excel,
  vba,
  matlab,
  c,
};

export interface CodeOptions {
  /** The dataset's name: it names the function and goes in the header. */
  readonly datasetName?: string;
  /** The cell the Excel formula reads x from. */
  readonly xRef?: string;
}

/**
 * Source code that computes the fit's y at x in `language`, with a header giving the model, the fit space, the X
 * range it was fitted over and its statistics (A8: every language agrees with `evaluateFit` within 1e-9).
 *
 * @throws RangeError for an unknown model or a parameter that is not a finite number.
 */
export function generateCode(fit: CodeFit, language: LanguageId, options: CodeOptions = {}): string {
  const form = formOf(fit);
  const { lines, short } = header(fit, form, options.datasetName);
  return GENERATORS[language]({
    fit,
    form,
    name: identifier(options.datasetName),
    header: lines,
    note: short,
    xRef: options.xRef ?? 'A2',
  });
}

/** The file name for a download of the code: the function name and the language's extension. */
export function codeFileName(language: LanguageId, datasetName?: string): string {
  const extension = LANGUAGES.find((l) => l.id === language)?.extension ?? 'txt';
  return `${identifier(datasetName)}.${extension}`;
}
