import { FluentProvider, Link, makeStyles, Text, tokens } from '@fluentui/react-components';
import { ArrowLeftRegular } from '@fluentui/react-icons';
import { useEffect, useMemo } from 'react';
import { DEFAULT_THEME, themes } from '../theme';
import { docPage, DOC_PAGES, renderDoc } from './pages';
import { docsHref } from './route';

const useStyles = makeStyles({
  shell: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalL,
    flexShrink: 0,
    height: '48px',
    paddingInline: tokens.spacingHorizontalL,
    backgroundColor: tokens.colorNeutralBackground3,
    borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  title: {
    flexGrow: 1,
  },
  back: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
  },
  body: {
    display: 'flex',
    minHeight: 0,
    flexGrow: 1,
  },
  nav: {
    flexShrink: 0,
    width: '220px',
    padding: tokens.spacingHorizontalL,
    overflowY: 'auto',
    borderRight: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  navList: {
    listStyleType: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  current: {
    fontWeight: tokens.fontWeightSemibold,
  },
  main: {
    flexGrow: 1,
    overflowY: 'auto',
    padding: `${tokens.spacingVerticalL} ${tokens.spacingHorizontalXXL}`,
  },
  article: {
    maxWidth: '72ch',
    fontFamily: tokens.fontFamilyBase,
    fontSize: tokens.fontSizeBase300,
    lineHeight: tokens.lineHeightBase400,
    color: tokens.colorNeutralForeground1,
    '& a': { color: tokens.colorBrandForegroundLink },
    '& h1': { fontSize: tokens.fontSizeHero700, lineHeight: tokens.lineHeightHero700 },
    '& h2': { fontSize: tokens.fontSizeBase500, marginTop: tokens.spacingVerticalXXL },
    '& code, & kbd': {
      fontFamily: tokens.fontFamilyMonospace,
      fontSize: tokens.fontSizeBase200,
      padding: `0 ${tokens.spacingHorizontalXS}`,
      borderRadius: tokens.borderRadiusSmall,
      backgroundColor: tokens.colorNeutralBackground3,
    },
    '& kbd': { border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1}` },
    '& table': { borderCollapse: 'collapse', width: '100%' },
    '& th, & td': {
      textAlign: 'left',
      verticalAlign: 'top',
      padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
      borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    },
  },
});

export interface DocsAppProps {
  /** From docsSlug: '' for the index. */
  readonly slug: string;
}

/** The static /docs pages (PRD §4.11). Links between pages are plain navigations; the app is not loaded. */
export default function DocsApp({ slug }: DocsAppProps) {
  const styles = useStyles();
  const page = docPage(slug);
  const html = useMemo(() => (page ? renderDoc(page.markdown) : ''), [page]);

  useEffect(() => {
    document.title = `${page?.title ?? 'Page not found'} · Curve Digitizer docs`;
  }, [page]);

  return (
    <FluentProvider theme={themes[DEFAULT_THEME]} data-theme={DEFAULT_THEME}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <Text as="h1" size={400} weight="semibold" className={styles.title}>
            Curve Digitizer docs
          </Text>
          <Link href="/" className={styles.back}>
            <ArrowLeftRegular aria-hidden="true" />
            Back to the app
          </Link>
        </header>
        <div className={styles.body}>
          <nav aria-label="Documentation" className={styles.nav}>
            <ul className={styles.navList}>
              {DOC_PAGES.map((p) => (
                <li key={p.slug}>
                  <Link
                    href={docsHref(p.slug)}
                    aria-current={p === page ? 'page' : undefined}
                    className={p === page ? styles.current : undefined}
                  >
                    {p.title}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          {/* Focusable so a page without links still scrolls from the keyboard. */}
          <main className={styles.main} tabIndex={0} aria-label={page?.title ?? 'Page not found'}>
            {page ? (
              <article className={styles.article} dangerouslySetInnerHTML={{ __html: html }} />
            ) : (
              <article className={styles.article}>
                <h1>Page not found</h1>
                <p>
                  There is no docs page called “{slug}”. Pick a page from the list, or start with{' '}
                  <a href={docsHref('getting-started')}>Getting started</a>.
                </p>
              </article>
            )}
          </main>
        </div>
      </div>
    </FluentProvider>
  );
}
