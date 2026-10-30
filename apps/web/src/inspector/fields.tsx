import { Field, Input, Textarea } from '@fluentui/react-components';
import { useId, useRef, useState } from 'react';

/**
 * Text fields that write through on every keystroke. All the keystrokes of one focus visit share a coalesce
 * key, so a whole edit is one undo step and nothing is lost if the tab dies before blur.
 */
function useEditSession(): { key: () => string; onFocus: () => void } {
  const id = useId();
  const visit = useRef(0);
  return {
    key: () => `${id}#${String(visit.current)}`,
    onFocus: () => {
      visit.current++;
    },
  };
}

export interface TextFieldProps {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string, coalesceKey: string) => void;
  readonly placeholder?: string;
  readonly multiline?: boolean;
  readonly hint?: string;
  /** Shown as an error under the field. */
  readonly error?: string;
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  multiline = false,
  hint,
  error,
}: TextFieldProps) {
  const session = useEditSession();
  const common = {
    value,
    onFocus: session.onFocus,
    ...(placeholder === undefined ? {} : { placeholder }),
  };
  return (
    <Field
      label={label}
      size="small"
      {...(hint === undefined ? {} : { hint })}
      {...(error === undefined ? {} : { validationState: 'error' as const, validationMessage: error })}
    >
      {multiline ? (
        <Textarea
          {...common}
          resize="vertical"
          onChange={(_, data) => {
            onChange(data.value, session.key());
          }}
        />
      ) : (
        <Input
          {...common}
          size="small"
          onChange={(_, data) => {
            onChange(data.value, session.key());
          }}
        />
      )}
    </Field>
  );
}

export interface NumberFieldProps {
  readonly label: string;
  readonly value: number | null;
  /** Called only with finite numbers, or null when the field is cleared. */
  readonly onChange: (value: number | null, coalesceKey: string) => void;
}

/** Keeps the typed text while it is not yet a number ("1e", "-") and shows a validation message. */
export function NumberField({ label, value, onChange }: NumberFieldProps) {
  const session = useEditSession();
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? (value === null ? '' : String(value));
  const parsed = text.trim() === '' ? null : Number(text);
  const invalid = parsed !== null && !Number.isFinite(parsed);
  return (
    <Field
      label={label}
      size="small"
      {...(invalid ? { validationState: 'error' as const, validationMessage: 'Enter a number' } : {})}
    >
      <Input
        size="small"
        inputMode="decimal"
        value={text}
        onFocus={() => {
          session.onFocus();
          setDraft(text);
        }}
        onBlur={() => {
          setDraft(null);
        }}
        onChange={(_, data) => {
          setDraft(data.value);
          const next = data.value.trim() === '' ? null : Number(data.value);
          if (next === null || Number.isFinite(next)) onChange(next, session.key());
        }}
      />
    </Field>
  );
}
