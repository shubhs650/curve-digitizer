import { Button, type ButtonProps } from '@fluentui/react-components';
import { ImageAddRegular } from '@fluentui/react-icons';
import { useRef } from 'react';
import { IMAGE_ACCEPT } from './files';

export interface OpenImageButtonProps {
  readonly onFiles: (files: File[]) => void;
  readonly label?: string;
  readonly appearance?: NonNullable<ButtonProps['appearance']>;
}

/** A button that opens the system file picker for images. */
export function OpenImageButton({
  onFiles,
  label = 'Open image…',
  appearance = 'secondary',
}: OpenImageButtonProps) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button
        appearance={appearance}
        icon={<ImageAddRegular />}
        onClick={() => {
          input.current?.click();
        }}
      >
        {label}
      </Button>
      <input
        ref={input}
        type="file"
        accept={IMAGE_ACCEPT}
        multiple
        hidden
        aria-label="Image files"
        data-testid="image-file-input"
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
