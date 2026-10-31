import { type Dataset, type Graph, type Point, replacePoints } from '@cd/core';
import { Button, Caption1, makeStyles, mergeClasses, Select, tokens } from '@fluentui/react-components';
import { CopyRegular } from '@fluentui/react-icons';
import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { useActiveDataset, useActiveGraph, useDispatch } from '../session/context';
import { useNotify } from '../ui/notices';
import { useUiStore } from '../ui/uiStore';
import { cellText, type Column, columns, type EditableColumn, editPoint, editText, tableTsv } from './rows';

/** Fixed row height, CSS px; rows are windowed, so a 10 000-point trace renders only the visible ones. */
export const ROW_HEIGHT = 28;
/** Rows rendered beyond each edge of the visible window. */
const OVERSCAN = 8;
/** Rows assumed visible before the scroll area is laid out (and in jsdom, which lays out nothing). */
const FALLBACK_ROWS = 20;

const useStyles = makeStyles({
  dock: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    minHeight: 0,
  },
  bar: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    paddingInline: tokens.spacingHorizontalM,
    paddingBottom: tokens.spacingVerticalXS,
  },
  empty: {
    paddingInline: tokens.spacingHorizontalM,
    color: tokens.colorNeutralForeground3,
  },
  scroll: {
    flexGrow: 1,
    minHeight: 0,
    overflow: 'auto',
    backgroundColor: tokens.colorNeutralBackground1,
    borderTop: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  table: {
    borderCollapse: 'collapse',
    width: '100%',
    fontVariantNumeric: 'tabular-nums',
    fontSize: tokens.fontSizeBase200,
    tableLayout: 'fixed',
  },
  th: {
    position: 'sticky',
    top: 0,
    zIndex: 1,
    height: `${String(ROW_HEIGHT)}px`,
    paddingInline: tokens.spacingHorizontalS,
    textAlign: 'right',
    fontWeight: tokens.fontWeightSemibold,
    backgroundColor: tokens.colorNeutralBackground3,
    borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  row: {
    height: `${String(ROW_HEIGHT)}px`,
  },
  selected: {
    backgroundColor: tokens.colorBrandBackground2,
  },
  td: {
    paddingInline: tokens.spacingHorizontalS,
    textAlign: 'right',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke3}`,
    ':focus-visible': {
      outline: `${tokens.strokeWidthThick} solid ${tokens.colorStrokeFocus2}`,
      outlineOffset: `calc(-1 * ${tokens.strokeWidthThick})`,
    },
  },
  text: {
    textAlign: 'left',
  },
  muted: {
    color: tokens.colorNeutralForeground3,
  },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    height: `${String(ROW_HEIGHT - 4)}px`,
    font: 'inherit',
    textAlign: 'right',
    color: tokens.colorNeutralForeground1,
    backgroundColor: tokens.colorNeutralBackground1,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorBrandStroke1}`,
    borderRadius: tokens.borderRadiusSmall,
  },
  invalid: {
    border: `${tokens.strokeWidthThick} solid ${tokens.colorPaletteRedBorder2}`,
  },
});

/** The bottom dock's live data table for the shown graph (task 1.6). */
export function DataDock() {
  const styles = useStyles();
  const graph = useActiveGraph();
  const showingGraph = useUiStore((s) => s.cropPage === null);
  if (!graph || !showingGraph) {
    return <Caption1 className={styles.empty}>Open a graph to see its points here.</Caption1>;
  }
  return <DataTable key={graph.id} graph={graph} />;
}

export function DataTable({ graph }: { readonly graph: Graph }) {
  const styles = useStyles();
  const notify = useNotify();
  const dataset = useActiveDataset(graph);
  const setActiveDataset = useUiStore((s) => s.setActiveDataset);
  const selection = useUiStore((s) => s.selection);
  const selectId = useId();

  const copy = async (points?: readonly Point[]) => {
    if (!dataset) return;
    try {
      await navigator.clipboard.writeText(tableTsv(graph, dataset, points));
      const n = points?.length ?? dataset.points.length;
      notify({ intent: 'success', title: `Copied ${String(n)} ${n === 1 ? 'row' : 'rows'}` });
    } catch (error) {
      notify({
        intent: 'error',
        title: 'Could not copy the table',
        body: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return (
    <div className={styles.dock}>
      <div className={styles.bar}>
        {dataset && graph.datasets.length > 1 && (
          <>
            <label htmlFor={selectId}>
              <Caption1>Dataset</Caption1>
            </label>
            <Select
              id={selectId}
              size="small"
              value={dataset.id}
              onChange={(_, data) => {
                setActiveDataset(graph.id, data.value);
              }}
            >
              {graph.datasets.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </>
        )}
        {dataset && (
          <Caption1 className={styles.muted}>
            {dataset.points.length === 1 ? '1 point' : `${String(dataset.points.length)} points`}
            {graph.calibration === null && ' · calibrate to see values'}
          </Caption1>
        )}
        <Button
          size="small"
          appearance="subtle"
          icon={<CopyRegular />}
          disabled={!dataset || dataset.points.length === 0}
          onClick={() => {
            void copy();
          }}
        >
          Copy table
        </Button>
      </div>
      {!dataset ? (
        <Caption1 className={styles.empty}>No datasets yet. Add points with P.</Caption1>
      ) : (
        <PointsGrid
          graph={graph}
          dataset={dataset}
          selection={selection}
          onCopy={(points) => {
            void copy(points);
          }}
        />
      )}
    </div>
  );
}

interface Cell {
  readonly row: number;
  readonly col: number;
}

interface Editing extends Cell {
  readonly text: string;
  readonly error: string | null;
}

function PointsGrid({
  graph,
  dataset,
  selection,
  onCopy,
}: {
  readonly graph: Graph;
  readonly dataset: Dataset;
  readonly selection: ReadonlySet<string>;
  readonly onCopy: (points?: readonly Point[]) => void;
}) {
  const styles = useStyles();
  const dispatch = useDispatch();
  const setSelection = useUiStore((s) => s.setSelection);
  const scroll = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [focus, setFocus] = useState<Cell>({ row: 0, col: 1 });
  const [editing, setEditing] = useState<Editing | null>(null);
  const pendingFocus = useRef(false);

  const cols = columns(graph, dataset);
  const points = dataset.points;
  const keyOf = (p: Point) => `${dataset.id}/${p.id}`;
  const row = Math.min(focus.row, Math.max(0, points.length - 1));

  const height = scroll.current?.clientHeight ?? 0;
  const visible = height > 0 ? Math.ceil(height / ROW_HEIGHT) : FALLBACK_ROWS;
  const first = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 1 - OVERSCAN);
  const last = Math.min(points.length, first + visible + 2 * OVERSCAN + 2);

  // Brings a row into view (the header row sits above row 0).
  const reveal = (index: number) => {
    const element = scroll.current;
    if (!element) return;
    const top = (index + 1) * ROW_HEIGHT;
    const view = element.clientHeight;
    if (top - ROW_HEIGHT < element.scrollTop) element.scrollTop = top - ROW_HEIGHT;
    else if (top + ROW_HEIGHT > element.scrollTop + view) element.scrollTop = top + ROW_HEIGHT - view;
    setScrollTop(element.scrollTop);
  };

  // A point selected on the canvas scrolls into view.
  const selectedIndex = selection.size === 1 ? points.findIndex((p) => selection.has(keyOf(p))) : -1;
  useEffect(() => {
    if (selectedIndex >= 0) reveal(selectedIndex);
    // Only when the selection changes, not on every scroll.
  }, [selectedIndex]);

  useEffect(() => {
    if (!pendingFocus.current) return;
    pendingFocus.current = false;
    scroll.current?.querySelector<HTMLElement>(`[data-cell="${String(row)}:${String(focus.col)}"]`)?.focus();
  });

  const moveTo = (next: Cell) => {
    const clamped = {
      row: Math.max(0, Math.min(points.length - 1, next.row)),
      col: Math.max(0, Math.min(cols.length - 1, next.col)),
    };
    setFocus(clamped);
    reveal(clamped.row);
    pendingFocus.current = true;
  };

  const select = (index: number, toggle: boolean) => {
    const point = points[index];
    if (!point) return;
    const key = keyOf(point);
    if (!toggle) {
      setSelection(new Set([key]));
      return;
    }
    const next = new Set(selection);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelection(next);
  };

  const toggleExcluded = (index: number) => {
    const point = points[index];
    if (!point) return;
    dispatch(
      replacePoints(
        graph.id,
        [{ datasetId: dataset.id, point: { ...point, excludedFromFit: !point.excludedFromFit } }],
        point.excludedFromFit ? 'Include point in fits' : 'Exclude point from fits',
      ),
    );
  };

  const commit = (edit: Editing): boolean => {
    const point = points[edit.row];
    const column = cols[edit.col];
    if (!point || !column?.editable) return true;
    const result = editPoint(graph, point, column.id as EditableColumn, edit.text);
    if (!result.ok) {
      setEditing({ ...edit, error: result.error });
      return false;
    }
    dispatch(replacePoints(graph.id, [{ datasetId: dataset.id, point: result.point }], 'Edit point'));
    setEditing(null);
    return true;
  };

  const startEdit = (cell: Cell, text?: string) => {
    const point = points[cell.row];
    const column = cols[cell.col];
    if (!point || !column?.editable) return;
    setEditing({ ...cell, text: text ?? editText(point, column.id as EditableColumn), error: null });
  };

  const onGridKeyDown = (event: KeyboardEvent<HTMLTableElement>) => {
    if (editing) return;
    const page = Math.max(1, visible - 1);
    const at = { row, col: focus.col };
    const keys: Record<string, () => void> = {
      ArrowDown: () => {
        moveTo({ ...at, row: at.row + 1 });
      },
      ArrowUp: () => {
        moveTo({ ...at, row: at.row - 1 });
      },
      ArrowRight: () => {
        moveTo({ ...at, col: at.col + 1 });
      },
      ArrowLeft: () => {
        moveTo({ ...at, col: at.col - 1 });
      },
      PageDown: () => {
        moveTo({ ...at, row: at.row + page });
      },
      PageUp: () => {
        moveTo({ ...at, row: at.row - page });
      },
      Home: () => {
        moveTo(event.ctrlKey ? { row: 0, col: 0 } : { ...at, col: 0 });
      },
      End: () => {
        moveTo(
          event.ctrlKey ? { row: points.length - 1, col: cols.length - 1 } : { ...at, col: cols.length - 1 },
        );
      },
      Enter: () => {
        startEdit(at);
      },
      F2: () => {
        startEdit(at);
      },
      ' ': () => {
        if (cols[at.col]?.id === 'excluded') toggleExcluded(at.row);
        else select(at.row, event.shiftKey || event.ctrlKey);
      },
    };
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
      const chosen = points.filter((p) => selection.has(keyOf(p)));
      onCopy(chosen.length > 0 ? chosen : undefined);
      event.preventDefault();
      return;
    }
    const action = keys[event.key];
    if (action) {
      action();
      event.preventDefault();
      // Arrow keys also nudge points on the canvas; the table keeps them.
      event.stopPropagation();
      return;
    }
    // Typing a number starts editing with it, as in a spreadsheet.
    if (event.key.length === 1 && /[\d.+-]/.test(event.key) && !event.ctrlKey && !event.metaKey) {
      startEdit(at, event.key);
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const renderCell = (point: Point, index: number, column: Column, col: number) => {
    const isFocus = index === row && col === focus.col;
    const isEditing = editing?.row === index && editing.col === col;
    const label = `${column.header} of point ${String(index + 1)}`;
    const className = mergeClasses(
      styles.td,
      column.id === 'origin' && styles.text,
      (column.id === 'residual' || (!column.editable && (column.id === 'x' || column.id === 'y'))) &&
        styles.muted,
    );
    return (
      <td
        key={column.id}
        role="gridcell"
        className={className}
        tabIndex={isFocus && !isEditing ? 0 : -1}
        aria-colindex={col + 1}
        aria-readonly={column.editable ? undefined : true}
        data-cell={`${String(index)}:${String(col)}`}
        onFocus={() => {
          if (!isFocus) setFocus({ row: index, col });
        }}
        onClick={(event) => {
          setFocus({ row: index, col });
          select(index, event.shiftKey || event.ctrlKey || event.metaKey);
        }}
        onDoubleClick={() => {
          startEdit({ row: index, col });
        }}
      >
        {isEditing ? (
          <input
            className={mergeClasses(styles.input, editing.error !== null && styles.invalid)}
            aria-label={label}
            aria-invalid={editing.error !== null}
            title={editing.error ?? undefined}
            value={editing.text}
            // The editor opens at the user's request (Enter, F2, typing or a double-click).
            autoFocus
            onChange={(event) => {
              setEditing({ ...editing, text: event.target.value, error: null });
            }}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === 'Escape') {
                setEditing(null);
                pendingFocus.current = true;
              } else if (event.key === 'Enter' || event.key === 'Tab') {
                event.preventDefault();
                if (commit(editing)) {
                  if (event.key === 'Enter') moveTo({ row: index + (event.shiftKey ? -1 : 1), col });
                  else moveTo({ row: index, col: col + (event.shiftKey ? -1 : 1) });
                }
              }
            }}
            onBlur={() => {
              // Leaving a valid edit keeps it, as in a spreadsheet; an invalid one is dropped.
              if (!commit(editing)) setEditing(null);
            }}
          />
        ) : column.id === 'excluded' ? (
          <input
            type="checkbox"
            tabIndex={-1}
            aria-label={`Exclude point ${String(index + 1)} from fits`}
            checked={point.excludedFromFit}
            onChange={() => {
              toggleExcluded(index);
            }}
          />
        ) : (
          cellText(graph, point, index, column.id)
        )}
      </td>
    );
  };

  return (
    <div
      ref={scroll}
      className={styles.scroll}
      onScroll={(event) => {
        setScrollTop(event.currentTarget.scrollTop);
      }}
    >
      {points.length === 0 ? (
        <Caption1 className={styles.empty}>No points in {dataset.name} yet. Add points with P.</Caption1>
      ) : (
        <table
          role="grid"
          aria-label={`Points of ${dataset.name}`}
          aria-rowcount={points.length + 1}
          aria-colcount={cols.length}
          aria-multiselectable="true"
          className={styles.table}
          onKeyDown={onGridKeyDown}
        >
          <thead>
            <tr aria-rowindex={1}>
              {cols.map((column, col) => (
                <th
                  key={column.id}
                  scope="col"
                  className={mergeClasses(styles.th, column.id === 'origin' && styles.text)}
                  aria-colindex={col + 1}
                  title={
                    column.id === 'residual'
                      ? 'Distance to the fit, once the dataset is fitted'
                      : column.header
                  }
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {first > 0 && <tr aria-hidden="true" style={{ height: `${String(first * ROW_HEIGHT)}px` }} />}
            {points.slice(first, last).map((point, offset) => {
              const index = first + offset;
              const selected = selection.has(keyOf(point));
              return (
                <tr
                  key={point.id}
                  aria-rowindex={index + 2}
                  aria-selected={selected}
                  className={mergeClasses(styles.row, selected && styles.selected)}
                >
                  {cols.map((column, col) => renderCell(point, index, column, col))}
                </tr>
              );
            })}
            {last < points.length && (
              <tr aria-hidden="true" style={{ height: `${String((points.length - last) * ROW_HEIGHT)}px` }} />
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
