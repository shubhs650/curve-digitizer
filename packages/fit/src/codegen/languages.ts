import type { CodeForm } from './form.ts';
import type { CodeFit, Header } from './text.ts';

export type LanguageId = 'python' | 'javascript' | 'excel' | 'vba' | 'matlab' | 'c';

/** What a language's generator gets: the fit, its code form, the function name and the header comment. */
export interface EmitContext {
  readonly fit: CodeFit;
  readonly form: CodeForm;
  readonly name: string;
  readonly header: readonly string[];
  /** The header in fewer words (Excel). */
  readonly note: Header['short'];
  /** The cell holding x, for the Excel formula. */
  readonly xRef: string;
}

export interface Language {
  readonly id: LanguageId;
  /** For tabs and menus. */
  readonly label: string;
  /** File name extension of a download, without the dot. */
  readonly extension: string;
}

/** The code export targets (docs/PRD.md §4.8), in the order the app lists them. */
export const LANGUAGES: readonly Language[] = [
  { id: 'python', label: 'Python', extension: 'py' },
  { id: 'javascript', label: 'JavaScript', extension: 'js' },
  { id: 'excel', label: 'Excel formula', extension: 'txt' },
  { id: 'vba', label: 'VBA', extension: 'bas' },
  { id: 'matlab', label: 'MATLAB', extension: 'm' },
  { id: 'c', label: 'C/C++', extension: 'c' },
];
