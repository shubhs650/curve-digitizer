import type { Fit } from '@cd/core';
import { codeFileName, generateCode, identifier, LANGUAGES, type LanguageId } from '@cd/fit';
import {
  Button,
  Caption1,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  Input,
  makeStyles,
  Tab,
  TabList,
  tokens,
} from '@fluentui/react-components';
import { ArrowDownloadRegular, CopyRegular } from '@fluentui/react-icons';
import { useMemo, useState } from 'react';
import { downloadFile } from '../export/download';
import { useNotify } from '../ui/notices';

const useStyles = makeStyles({
  surface: {
    maxWidth: '880px',
    width: 'calc(100vw - 32px)',
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  code: {
    margin: 0,
    maxHeight: '50vh',
    overflow: 'auto',
    padding: tokens.spacingHorizontalM,
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase200,
    backgroundColor: tokens.colorNeutralBackground3,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    whiteSpace: 'pre',
  },
  cell: {
    maxWidth: '160px',
  },
  hint: {
    color: tokens.colorNeutralForeground3,
  },
});

/** How to use each language's code, under the code. */
function hint(language: LanguageId, name: string): string {
  switch (language) {
    case 'python':
      return `Needs NumPy. ${name}(x) takes a number or a NumPy array.`;
    case 'javascript':
      return `${name}(x) takes one number and returns NaN where the fit is undefined.`;
    case 'excel':
      return (
        'Paste into the cell next to your first X value and fill down. Knot tables use LET, which needs ' +
        'Excel 2021 or Microsoft 365; on older Excel use the VBA function.'
      );
    case 'vba':
      return `In Excel press Alt+F11, choose Insert > Module and paste; then use =${name}(A2) in a cell.`;
    case 'matlab':
      return `Save as ${name}.m. Works in GNU Octave too; x can be an array of any shape.`;
    case 'c':
      return 'C99 or C++; link with -lm on Linux. Returns NAN where the fit is undefined.';
  }
}

/** The stored fit as code in six languages (PRD §4.8, task 3.3), to copy or save; generated on the device. */
export function CodeDialog({
  fit,
  datasetName,
  onClose,
}: {
  readonly fit: Fit;
  readonly datasetName: string;
  readonly onClose: () => void;
}) {
  const styles = useStyles();
  const notify = useNotify();
  const [language, setLanguage] = useState<LanguageId>('python');
  const [xRef, setXRef] = useState('A2');
  const cell = /^\$?[A-Za-z]{1,3}\$?[1-9]\d{0,6}$/.test(xRef.trim()) ? xRef.trim().toUpperCase() : 'A2';
  const code = useMemo(
    () => generateCode(fit, language, { datasetName, xRef: cell }),
    [fit, language, datasetName, cell],
  );
  const label = LANGUAGES.find((l) => l.id === language)?.label ?? language;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(language === 'excel' ? code.trimEnd() : code);
      notify({ intent: 'success', title: `Copied the ${label} code` });
    } catch (error) {
      notify({
        intent: 'error',
        title: 'Could not copy the code',
        body: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(_, data) => {
        if (!data.open) onClose();
      }}
    >
      <DialogSurface className={styles.surface}>
        <DialogBody>
          <DialogTitle>Code for {datasetName}</DialogTitle>
          <DialogContent className={styles.content}>
            <TabList
              size="small"
              selectedValue={language}
              onTabSelect={(_, data) => {
                setLanguage(data.value as LanguageId);
              }}
              aria-label="Language"
            >
              {LANGUAGES.map((l) => (
                <Tab key={l.id} value={l.id}>
                  {l.label}
                </Tab>
              ))}
            </TabList>
            {language === 'excel' && (
              <Field label="X value cell" size="small" className={styles.cell}>
                <Input
                  size="small"
                  value={xRef}
                  onChange={(_, data) => {
                    setXRef(data.value);
                  }}
                />
              </Field>
            )}
            {/* Focusable so the code scrolls from the keyboard; it holds no controls of its own. */}
            <pre className={styles.code} tabIndex={0} aria-label={`${label} code`} role="region">
              {code}
            </pre>
            <Caption1 className={styles.hint}>{hint(language, identifier(datasetName))}</Caption1>
          </DialogContent>
          <DialogActions>
            <Button icon={<CopyRegular />} onClick={() => void copy()}>
              Copy
            </Button>
            <Button
              icon={<ArrowDownloadRegular />}
              onClick={() => {
                downloadFile(
                  new TextEncoder().encode(code),
                  codeFileName(language, datasetName),
                  'text/plain',
                );
              }}
            >
              Download
            </Button>
            <Button appearance="primary" onClick={onClose}>
              Close
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
