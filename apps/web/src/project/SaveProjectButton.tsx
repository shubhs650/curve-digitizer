import type { Project } from '@cd/core';
import { Button, Menu, MenuItem, MenuList, MenuPopover, MenuTrigger } from '@fluentui/react-components';
import { SaveRegular } from '@fluentui/react-icons';
import { useCallback, useEffect, useState } from 'react';
import { downloadFile, safeFileName } from '../export/download';
import { useWorkspace } from '../session/context';
import { useNotify } from '../ui/notices';

export const CDZ_MIME = 'application/x-curve-digitizer';

/**
 * Saves the open project as a portable `.cdz` (task 1.10, PRD §4.9), with or without its source PDFs; Ctrl+S
 * saves without them. Projects are already autosaved on this device; the file is for moving or archiving one.
 */
export function SaveProjectButton({ project }: { readonly project: Project }) {
  const workspace = useWorkspace();
  const notify = useNotify();
  const [busy, setBusy] = useState(false);

  const save = useCallback(
    (embedSources: boolean) => {
      setBusy(true);
      workspace
        .saveCdz({ embedSources })
        .then(({ bytes, fileName }) => {
          downloadFile(bytes, safeFileName(fileName, 'cdz'), CDZ_MIME);
        })
        .catch((error: unknown) => {
          notify({
            intent: 'error',
            title: 'Could not save the project',
            body: error instanceof Error ? error.message : String(error),
          });
        })
        .finally(() => {
          setBusy(false);
        });
    },
    [workspace, notify],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 's') {
        // The browser's "Save page" would only save the app shell.
        event.preventDefault();
        if (!busy) save(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [save, busy]);

  const label = busy ? 'Saving…' : 'Save .cdz';
  if (project.sources.length === 0) {
    return (
      <Button
        icon={<SaveRegular />}
        disabled={busy}
        title="Save the project as a file (Ctrl+S)"
        onClick={() => {
          save(false);
        }}
      >
        {label}
      </Button>
    );
  }
  return (
    <Menu>
      <MenuTrigger disableButtonEnhancement>
        <Button icon={<SaveRegular />} disabled={busy}>
          {label}
        </Button>
      </MenuTrigger>
      <MenuPopover>
        <MenuList>
          <MenuItem
            secondaryContent="Ctrl+S"
            onClick={() => {
              save(false);
            }}
          >
            Project only
          </MenuItem>
          <MenuItem
            onClick={() => {
              save(true);
            }}
          >
            Project with its PDFs
          </MenuItem>
        </MenuList>
      </MenuPopover>
    </Menu>
  );
}
