import { REPLAYER_TASKS, replayers, type Replayer, type ReplayerRegistry } from './replayers.ts';
import type { Sample } from './sample.ts';
import { score, TARGETS, type Score } from './score.ts';
import type { Op, OpKind, TargetId } from './truth.ts';

export type ReplayResult =
  | { readonly status: 'todo'; readonly reason: string }
  | { readonly status: 'scored'; readonly score: Score };

/** The target's limit on this sample; throws when the target is not measured on it. */
export function limitFor(target: TargetId, sample: string): number {
  const limit = TARGETS[target].limits[sample];
  if (limit === undefined) throw new Error(`${target} is not measured on ${sample}`);
  return limit;
}

export function hasReplayer(kind: OpKind, registry: ReplayerRegistry = replayers): boolean {
  return registry[kind] !== undefined;
}

/** Replays one op through its feature's replayer and scores it for one target, or says why it cannot yet. */
export async function replay(
  sample: Sample,
  op: Op,
  target: TargetId,
  registry: ReplayerRegistry = replayers,
): Promise<ReplayResult> {
  const limit = limitFor(target, sample.name);
  // The registry maps each kind to the replayer for that kind, so looking it up by op.kind matches op.
  const replayer = registry[op.kind] as Replayer<OpKind> | undefined;
  if (!replayer) {
    return { status: 'todo', reason: `waiting for the ${op.kind} replayer (task ${REPLAYER_TASKS[op.kind]})` };
  }
  const output = await replayer(op, sample);
  return { status: 'scored', score: score(target, limit, op, output, sample.truth) };
}
