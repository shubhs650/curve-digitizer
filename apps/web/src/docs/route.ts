import { DOCS_PATH } from '../links';

// Kept apart from the docs pages so the app's entry can check the route without loading them.

/** The docs page slug for a location, '' for the docs index, or null outside /docs. */
export function docsSlug(pathname: string): string | null {
  if (pathname === DOCS_PATH || pathname === `${DOCS_PATH}/`) return '';
  if (!pathname.startsWith(`${DOCS_PATH}/`)) return null;
  return decodeURIComponent(pathname.slice(DOCS_PATH.length + 1)).replace(/\/$/, '');
}

export function docsHref(slug: string): string {
  return `${DOCS_PATH}/${slug}`;
}
