import { Badge, Tooltip } from '@fluentui/react-components';
import { CloudCheckmarkRegular } from '@fluentui/react-icons';
import type { OfflineReadiness } from './offlineReadiness';

const TEXT: Readonly<Record<Exclude<OfflineReadiness, 'none'>, { label: string; detail: string }>> = {
  images: {
    label: 'Ready offline for images',
    detail:
      'The app works without a connection. PDF support is saved for offline use the first time you open a PDF.',
  },
  full: {
    label: 'Ready offline',
    detail: 'The app, including PDF support, works without a connection.',
  },
};

/** PRD §6 "Ready offline" indicator; nothing shows until the service worker controls the page. */
export function OfflineBadge({ readiness }: { readonly readiness: OfflineReadiness }) {
  if (readiness === 'none') return null;
  const { label, detail } = TEXT[readiness];
  return (
    <Tooltip content={detail} relationship="description">
      <Badge
        appearance="tint"
        color={readiness === 'full' ? 'success' : 'informative'}
        icon={<CloudCheckmarkRegular />}
        data-testid="offline-status"
      >
        {label}
      </Badge>
    </Tooltip>
  );
}
