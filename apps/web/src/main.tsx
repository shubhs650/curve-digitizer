import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { docsSlug } from './docs/route';
import './global.css';

// The docs are their own chunk: the app never loads them, and /docs never starts the workspace.
const DocsApp = lazy(() => import('./docs/DocsApp'));

const root = document.getElementById('root');
if (!root) throw new Error('index.html is missing #root');

const slug = docsSlug(location.pathname);

createRoot(root).render(
  <StrictMode>
    {slug === null ? (
      <App />
    ) : (
      <Suspense>
        <DocsApp slug={slug} />
      </Suspense>
    )}
  </StrictMode>,
);
