import { makeStyles, mergeClasses, Text, tokens } from '@fluentui/react-components';
import type { ReactNode } from 'react';

const useStyles = makeStyles({
  title: {
    margin: 0,
    color: tokens.colorNeutralForeground1,
  },
});

/** The heading of an inspector or crop panel section; the section names itself with its id. */
export function PanelTitle({
  id,
  children,
  className,
}: {
  readonly id: string;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  const styles = useStyles();
  return (
    <Text as="h3" id={id} size={300} weight="semibold" className={mergeClasses(styles.title, className)}>
      {children}
    </Text>
  );
}
