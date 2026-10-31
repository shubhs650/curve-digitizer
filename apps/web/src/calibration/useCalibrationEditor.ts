import { type Calibration, type Graph, type ImageRef, setCalibration, type Vec2 } from '@cd/core';
import { useCallback, useMemo } from 'react';
import { create } from 'zustand';
import { useDispatch } from '../session/context';
import {
  type CalibrationDraft,
  draftFromCalibration,
  type DraftEvaluation,
  EMPTY_DRAFT,
  evaluateDraft,
  type PickIndex,
  pointValues,
} from './draft';

/** A graph's calibration editor: the draft, the calibration it was last in step with, and the pick to place. */
interface EditorEntry {
  readonly draft: CalibrationDraft;
  /** The project's calibration when the draft was last saved or loaded; a different one (undo) resets the draft. */
  readonly basis: Calibration | null;
  /** The render the picks are in; a re-render at another DPI (or its undo) moves every pixel, so it resets too. */
  readonly image: ImageRef;
  readonly active: PickIndex | null;
}

interface EditorStore {
  readonly entries: Readonly<Record<string, EditorEntry>>;
  readonly put: (graphId: string, entry: EditorEntry) => void;
}

// UI state: a half-finished calibration is not part of the project until it solves.
const useEditorStore = create<EditorStore>()((set) => ({
  entries: {},
  put: (graphId, entry) => {
    set((s) => ({ entries: { ...s.entries, [graphId]: entry } }));
  },
}));

/** Forgets every draft; for tests, whose graphs reuse ids. */
export function resetCalibrationEditors(): void {
  useEditorStore.setState({ entries: {} });
}

export interface CalibrationEditor {
  readonly draft: CalibrationDraft;
  readonly evaluation: DraftEvaluation;
  /** The pick the next click on the canvas places, if any. */
  readonly active: PickIndex | null;
  /**
   * Changes the draft and, when it then solves, saves the calibration to the project (undoable). Edits with the
   * same `coalesceKey` (one field focus, one drag) undo as one step.
   */
  readonly edit: (change: (draft: CalibrationDraft) => CalibrationDraft, coalesceKey?: string) => void;
  readonly place: (index: PickIndex, px: Vec2, coalesceKey?: string) => void;
  readonly setActive: (index: PickIndex | null) => void;
  readonly clear: () => void;
}

/** The pick to place after `index`: the next one still missing, if any. */
function nextMissing(draft: CalibrationDraft, after: PickIndex): PickIndex | null {
  for (const i of [1, 2, 3, 4] as const) {
    const candidate = ((after + i) % 4) as PickIndex;
    if (draft.picks[candidate] === null) return candidate;
  }
  return null;
}

export function useCalibrationEditor(graph: Graph): CalibrationEditor {
  const dispatch = useDispatch();
  const stored = useEditorStore((s) => s.entries[graph.id]);
  const put = useEditorStore((s) => s.put);
  const entry: EditorEntry = useMemo(
    () =>
      stored !== undefined && stored.basis === graph.calibration && stored.image === graph.image
        ? stored
        : {
            draft: draftFromCalibration(graph.calibration),
            basis: graph.calibration,
            image: graph.image,
            active: graph.calibration === null ? 0 : null,
          },
    [stored, graph.calibration, graph.image],
  );
  const evaluation = useMemo(() => evaluateDraft(entry.draft), [entry.draft]);

  const save = useCallback(
    (draft: CalibrationDraft, active: PickIndex | null, coalesceKey?: string) => {
      const result = evaluateDraft(draft);
      let basis = entry.basis;
      if (result.status === 'ok') {
        const saved = dispatch(
          setCalibration(graph.id, result.calibration, pointValues(graph, result.calibration), coalesceKey),
        );
        if (saved) basis = result.calibration;
      }
      put(graph.id, { draft, basis, image: graph.image, active });
    },
    [dispatch, graph, entry.basis, put],
  );

  const edit = useCallback<CalibrationEditor['edit']>(
    (change, coalesceKey) => {
      save(change(entry.draft), entry.active, coalesceKey);
    },
    [save, entry],
  );

  const place = useCallback<CalibrationEditor['place']>(
    (index, px, coalesceKey) => {
      const picks = [...entry.draft.picks] as [Vec2 | null, Vec2 | null, Vec2 | null, Vec2 | null];
      const wasMissing = picks[index] === null;
      picks[index] = px;
      const draft = { ...entry.draft, picks };
      // Placing walks through the missing picks; moving a placed one keeps the current choice.
      save(
        draft,
        wasMissing || entry.active === index ? nextMissing(draft, index) : entry.active,
        coalesceKey,
      );
    },
    [save, entry],
  );

  const setActive = useCallback(
    (active: PickIndex | null) => {
      put(graph.id, { ...entry, active });
    },
    [put, graph.id, entry],
  );

  const clear = useCallback(() => {
    if (graph.calibration !== null) dispatch(setCalibration(graph.id, null));
    put(graph.id, {
      draft: { ...EMPTY_DRAFT, xAxis: entry.draft.xAxis, yAxis: entry.draft.yAxis },
      basis: null,
      image: graph.image,
      active: 0,
    });
  }, [dispatch, put, graph, entry.draft]);

  return { draft: entry.draft, evaluation, active: entry.active, edit, place, setActive, clear };
}
