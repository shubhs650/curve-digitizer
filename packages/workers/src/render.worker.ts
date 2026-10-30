import { expose } from 'comlink';
import { createWorkerApi } from './runner.ts';
import { renderTasks } from './tasks.ts';

expose(createWorkerApi(renderTasks));
