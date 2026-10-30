import { expose } from 'comlink';
import { createWorkerApi } from './runner.ts';
import { computeTasks } from './tasks.ts';

expose(createWorkerApi(computeTasks));
