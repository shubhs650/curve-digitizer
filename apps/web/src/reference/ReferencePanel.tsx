import type { Graph } from '@cd/core';
import { sniffImageType } from '@cd/image';
import {
  Button,
  Caption1,
  Caption1Strong,
  Field,
  makeStyles,
  Slider,
  SpinButton,
  Switch,
  tokens,
} from '@fluentui/react-components';
import { DismissRegular, ImageAddRegular } from '@fluentui/react-icons';
import { useRef } from 'react';
import { useNotify } from '../ui/notices';
import { useReference, useReferenceStore } from './referenceStore';

const useStyles = makeStyles({
  panel: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM} ${tokens.spacingVerticalM}`,
    borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  row: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
    alignItems: 'flex-end',
  },
  offset: {
    width: '96px',
  },
  muted: {
    color: tokens.colorNeutralForeground3,
  },
});

/** Decodes a PNG, JPEG or WebP for the overlay, off the main thread. */
export async function decodeReference(bytes: Uint8Array): Promise<ImageBitmap> {
  const type = sniffImageType(bytes);
  if (type === null) throw new Error('Not a PNG, JPEG or WebP image.');
  return createImageBitmap(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: `image/${type}` }));
}

/**
 * The reference overlay (PRD §4.10, task 3.6): a second image over the graph, semi-transparent and movable,
 * to compare the figure with another crop or edition. Not saved with the project.
 */
export function ReferencePanel({ graph }: { readonly graph: Graph }) {
  const styles = useStyles();
  const notify = useNotify();
  const input = useRef<HTMLInputElement>(null);
  const reference = useReference(graph.id);
  const setReference = useReferenceStore((s) => s.setReference);
  const update = useReferenceStore((s) => s.updateReference);
  const remove = useReferenceStore((s) => s.removeReference);

  const load = async (file: File) => {
    try {
      const bitmap = await decodeReference(new Uint8Array(await file.arrayBuffer()));
      setReference(graph.id, file.name, bitmap);
    } catch (error) {
      notify({
        intent: 'error',
        title: `Could not use ${file.name} as a reference`,
        body: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return (
    <section aria-labelledby="reference-heading" className={styles.panel}>
      <Caption1Strong id="reference-heading">Reference overlay</Caption1Strong>
      {reference === null ? (
        <Caption1 className={styles.muted}>
          Lay a second image over this graph to compare them: an image file, or a crop of a PDF page (Use as
          reference, in the crop panel). It is a viewing aid and is not saved with the project.
        </Caption1>
      ) : (
        <>
          <Caption1>
            {reference.name}, {reference.bitmap.width} × {reference.bitmap.height} px
          </Caption1>
          <Switch
            label="Show reference"
            checked={reference.visible}
            onChange={(_, data) => {
              update(graph.id, { visible: data.checked });
            }}
          />
          <Field label={`Opacity ${String(Math.round(reference.opacity * 100))} %`}>
            <Slider
              min={0}
              max={100}
              step={5}
              value={Math.round(reference.opacity * 100)}
              onChange={(_, data) => {
                update(graph.id, { opacity: data.value / 100 });
              }}
            />
          </Field>
          <div className={styles.row}>
            {(['X', 'Y'] as const).map((axis, i) => (
              <Field key={axis} label={`Offset ${axis} (px)`} className={styles.offset}>
                <SpinButton
                  value={reference.offsetPx[i] ?? 0}
                  onChange={(_, data) => {
                    const value = data.value ?? Number(data.displayValue);
                    if (!Number.isFinite(value)) return;
                    const offsetPx: [number, number] = [...reference.offsetPx];
                    offsetPx[i] = Math.round(value);
                    update(graph.id, { offsetPx });
                  }}
                />
              </Field>
            ))}
          </div>
        </>
      )}
      <div className={styles.row}>
        <Button
          icon={<ImageAddRegular />}
          onClick={() => {
            input.current?.click();
          }}
        >
          {reference === null ? 'Load reference image…' : 'Replace…'}
        </Button>
        {reference !== null && (
          <Button
            icon={<DismissRegular />}
            onClick={() => {
              remove(graph.id);
            }}
          >
            Remove reference
          </Button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        aria-label="Reference image file"
        data-testid="reference-file-input"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          // Clearing lets the same file be picked again.
          event.currentTarget.value = '';
          if (file) void load(file);
        }}
      />
    </section>
  );
}
