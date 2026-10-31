import type { Graph, Project } from '@cd/core';
import { Button, Menu, MenuItem, MenuList, MenuPopover, MenuTrigger } from '@fluentui/react-components';
import { ArrowDownloadRegular } from '@fluentui/react-icons';
import type { ExportFormat } from '@cd/workers';
import { useState } from 'react';
import { useWorkspace } from '../session/context';
import { useNotify } from '../ui/notices';
import { useUiStore } from '../ui/uiStore';
import { downloadFile } from './download';
import { runExport } from './runExport';

export interface ExportMenuProps {
  readonly project: Project;
  readonly graph: Graph | null;
}

/** CSV (long, wide) for the shown graph; Excel workbook and audit JSON for the whole project (PRD §4.10). */
export function ExportMenu({ project, graph }: ExportMenuProps) {
  const workspace = useWorkspace();
  const notify = useNotify();
  const markExported = useUiStore((s) => s.markExported);
  const [busy, setBusy] = useState(false);
  const calibrated = graph?.calibration != null;
  const anyCalibrated = project.graphs.some((g) => g.calibration !== null);

  const run = (format: ExportFormat) => {
    setBusy(true);
    runExport(format, project, graph, (path) => workspace.readFile(path))
      .then((file) => {
        downloadFile(file.bytes, file.fileName, file.mimeType);
        markExported(project.id);
      })
      .catch((error: unknown) => {
        notify({
          intent: 'error',
          title: 'Export failed',
          body: error instanceof Error ? error.message : String(error),
        });
      })
      .finally(() => {
        setBusy(false);
      });
  };

  return (
    <Menu>
      <MenuTrigger disableButtonEnhancement>
        <Button icon={<ArrowDownloadRegular />} disabled={busy}>
          {busy ? 'Exporting…' : 'Export'}
        </Button>
      </MenuTrigger>
      <MenuPopover>
        <MenuList>
          <MenuItem
            disabled={!calibrated}
            secondaryContent={calibrated ? 'this graph' : 'calibrate first'}
            onClick={() => {
              run('csvLong');
            }}
          >
            CSV, long
          </MenuItem>
          <MenuItem
            disabled={!calibrated}
            secondaryContent={calibrated ? 'this graph' : 'calibrate first'}
            onClick={() => {
              run('csvWide');
            }}
          >
            CSV, wide
          </MenuItem>
          <MenuItem
            disabled={!anyCalibrated}
            secondaryContent="all graphs"
            onClick={() => {
              run('xlsx');
            }}
          >
            Excel workbook
          </MenuItem>
          <MenuItem
            secondaryContent="provenance"
            onClick={() => {
              run('audit');
            }}
          >
            Audit JSON
          </MenuItem>
        </MenuList>
      </MenuPopover>
    </Menu>
  );
}
