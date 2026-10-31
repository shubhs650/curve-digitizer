import { Button, type ButtonProps } from '@fluentui/react-components';
import { DocumentAddRegular } from '@fluentui/react-icons';
import { useRef } from 'react';
import { OPEN_ACCEPT } from './files';

export interface OpenFileButtonProps {
  readonly onFiles: (files: File[]) => void;
  readonly label?: string;
  readonly appearance?: NonNullable<ButtonProps['appearance']>;
  readonly size?: NonNullable<ButtonProps['size']>;
  readonly className?: string;
}

/** A button that opens the system file picker for PDFs and images. */
export function OpenFileButton({
  onFiles,
  label = 'Open PDF or image…',
  appearance = 'secondary',
  size,
  className,
}: OpenFileButtonProps) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button
        appearance={appearance}
        {...(size === undefined ? {} : { size })}
        {...(className === undefined ? {} : { className })}
        icon={<DocumentAddRegular />}
        onClick={() => {
          input.current?.click();
        }}
      >
        {label}
      </Button>
      <input
        ref={input}
        type="file"
        accept={OPEN_ACCEPT}
        multiple
        hidden
        aria-label="PDF or image files"
        data-testid="open-file-input"
        onChange={(event) => {
          const files = [...(event.currentTarget.files ?? [])];
          // Clearing lets the same file be picked again.
          event.currentTarget.value = '';
          if (files.length > 0) onFiles(files);
        }}
      />
    </>
  );
}
