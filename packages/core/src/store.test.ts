import { describe, expect, it, vi } from 'vitest';
import type { Command } from './commands/command.ts';
import { renameGraph } from './commands/graph.ts';
import { renameProject } from './commands/project.ts';
import { type ProjectChange, ProjectStore } from './store.ts';
import { sampleProject } from './testing.ts';
import type { Project } from './types.ts';

function clock(): () => string {
  let tick = 0;
  return () => `2026-12-01T00:00:${String(tick++).padStart(2, '0')}Z`;
}

function makeStore(project: Project = sampleProject(), undoLimit?: number): ProjectStore {
  return new ProjectStore(project, { now: clock(), ...(undoLimit === undefined ? {} : { undoLimit }) });
}

/** Ignores `modified`, which the store restamps on every change. */
const content = (project: Project): Project => ({ ...project, modified: '' });

const drag = (key: string, name: string): Command => ({ ...renameProject(name), coalesceKey: key });

describe('ProjectStore', () => {
  it('dispatches, undoes and redoes', () => {
    const initial = sampleProject();
    const store = makeStore(initial);
    store.dispatch(renameProject('A'));
    store.dispatch(renameGraph('g1', 'B'));
    expect(store.project.name).toBe('A');
    expect(store.project.graphs[0]?.name).toBe('B');

    expect(store.undo()).toBe(true);
    expect(store.project.graphs[0]?.name).toBe(initial.graphs[0]?.name);
    expect(store.undo()).toBe(true);
    expect(content(store.project)).toEqual(content(initial));
    expect(store.undo()).toBe(false);

    expect(store.redo()).toBe(true);
    expect(store.redo()).toBe(true);
    expect(store.project.name).toBe('A');
    expect(store.project.graphs[0]?.name).toBe('B');
    expect(store.redo()).toBe(false);
  });

  it('stamps modified on every change but not on load', () => {
    const store = makeStore();
    store.dispatch(renameProject('A'));
    expect(store.project.modified).toBe('2026-12-01T00:00:00Z');
    store.undo();
    expect(store.project.modified).toBe('2026-12-01T00:00:01Z');
    store.redo();
    expect(store.project.modified).toBe('2026-12-01T00:00:02Z');
    const loaded = sampleProject();
    store.load(loaded);
    expect(store.project).toBe(loaded);
  });

  it('exposes undo/redo availability and labels', () => {
    const store = makeStore();
    expect([store.canUndo, store.canRedo, store.undoLabel, store.redoLabel]).toEqual([
      false,
      false,
      undefined,
      undefined,
    ]);
    store.dispatch(renameProject('A'));
    expect([store.canUndo, store.canRedo, store.undoLabel]).toEqual([true, false, 'Rename project']);
    store.undo();
    expect([store.canUndo, store.canRedo, store.redoLabel]).toEqual([false, true, 'Rename project']);
  });

  it('clears redo on a new dispatch', () => {
    const store = makeStore();
    store.dispatch(renameProject('A'));
    store.undo();
    store.dispatch(renameProject('B'));
    expect(store.canRedo).toBe(false);
    expect(store.redo()).toBe(false);
    expect(store.project.name).toBe('B');
  });

  it('leaves project and history untouched when a command throws', () => {
    const store = makeStore();
    store.dispatch(renameProject('A'));
    const before = store.project;
    const listener = vi.fn();
    store.subscribe(listener);
    expect(() => {
      store.dispatch(renameGraph('nope', 'x'));
    }).toThrow();
    expect(store.project).toBe(before);
    expect(store.undoLabel).toBe('Rename project');
    expect(listener).not.toHaveBeenCalled();
  });

  it('caps the undo stack, dropping the oldest steps', () => {
    const initial = sampleProject();
    const store = makeStore(initial, 3);
    for (const name of ['1', '2', '3', '4', '5']) store.dispatch(renameProject(name));
    while (store.undo());
    expect(store.project.name).toBe('2');
  });

  it('caps at 200 steps by default', () => {
    const store = makeStore();
    for (let i = 0; i < 250; i++) store.dispatch(renameProject(String(i)));
    let steps = 0;
    while (store.undo()) steps++;
    expect(steps).toBe(200);
    expect(store.project.name).toBe('49');
  });

  it('coalesces consecutive dispatches with the same key into one step', () => {
    const initial = sampleProject();
    const store = makeStore(initial);
    store.dispatch(drag('drag-1', 'a'));
    store.dispatch(drag('drag-1', 'ab'));
    store.dispatch(drag('drag-1', 'abc'));
    store.undo();
    expect(content(store.project)).toEqual(content(initial));
    expect(store.canUndo).toBe(false);
    store.redo();
    expect(store.project.name).toBe('abc');
  });

  it('does not coalesce different keys, keyless commands, or across undo', () => {
    const store = makeStore();
    store.dispatch(drag('drag-1', 'a'));
    store.dispatch(drag('drag-2', 'b'));
    store.dispatch(renameProject('c'));
    store.dispatch(renameProject('d'));
    store.undo();
    expect(store.project.name).toBe('c');
    store.undo();
    expect(store.project.name).toBe('b');

    store.dispatch(drag('drag-2', 'b2'));
    store.undo();
    expect(store.project.name).toBe('b');
    store.undo();
    store.dispatch(drag('drag-1', 'x'));
    store.undo();
    store.dispatch(drag('drag-1', 'y'));
    store.undo();
    expect(store.project.name).toBe('a');
  });

  it('emits one change per mutation and supports unsubscribe', () => {
    const store = makeStore();
    const changes: ProjectChange[] = [];
    const unsubscribe = store.subscribe((c) => changes.push(c));
    store.dispatch(renameProject('A'));
    store.undo();
    store.redo();
    store.undo();
    store.undo();
    const loaded = sampleProject();
    store.load(loaded);
    expect(changes.map((c) => [c.cause, c.label])).toEqual([
      ['dispatch', 'Rename project'],
      ['undo', 'Rename project'],
      ['redo', 'Rename project'],
      ['undo', 'Rename project'],
      ['load', undefined],
    ]);
    expect(changes.at(-1)?.project).toBe(loaded);
    unsubscribe();
    store.dispatch(renameProject('B'));
    expect(changes).toHaveLength(5);
  });

  it('load clears history', () => {
    const store = makeStore();
    store.dispatch(renameProject('A'));
    store.undo();
    store.dispatch(renameProject('B'));
    store.load(sampleProject());
    expect([store.canUndo, store.canRedo]).toEqual([false, false]);
  });

  it('never mutates projects it has handed out', () => {
    const store = makeStore();
    const seen: Project[] = [store.project];
    store.subscribe((c) => seen.push(c.project));
    store.dispatch(renameProject('A'));
    store.dispatch(renameGraph('g2', 'B'));
    store.undo();
    store.redo();
    expect(seen.map((p) => [p.name, p.graphs[1]?.name])).toEqual([
      ['ASME VIII-2 fatigue curves', 'Pump curve screenshot'],
      ['A', 'Pump curve screenshot'],
      ['A', 'B'],
      ['A', 'Pump curve screenshot'],
      ['A', 'B'],
    ]);
  });
});
