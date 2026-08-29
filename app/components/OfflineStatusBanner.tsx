import { Link } from 'react-router-dom';
import { AlertTriangle, CloudOff, RefreshCw, X } from 'lucide-react';
import { useOffline } from '@/app/lib/offline/OfflineContext';

const noticeClasses =
  'mb-3 flex shrink-0 items-start gap-2 rounded-lg border border-[color-mix(in_srgb,var(--course-citrine)_64%,var(--surface))] bg-[color-mix(in_srgb,var(--course-citrine)_34%,var(--surface))] px-3 py-2 text-sm text-[color-mix(in_srgb,var(--course-citrine)_68%,var(--secondary-accent))]';

function pendingLabel(count: number): string {
  return count === 1 ? '1 change' : `${count} changes`;
}

function OfflineStatusBanner() {
  const { enabled, isOnline, pendingCount, syncState, syncIssues, dismissIssue } = useOffline();

  if (isOnline && syncIssues.length === 0 && (!enabled || (pendingCount === 0 && syncState === 'idle'))) {
    return null;
  }

  return (
    <>
      {!isOnline && (
        <div role="status" className={noticeClasses}>
          <CloudOff className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {enabled ? (
              <>
                You are offline. Your saved work is available and any changes stay on this device until you reconnect
                {pendingCount > 0 ? ` (${pendingLabel(pendingCount)} waiting).` : '.'}
              </>
            ) : (
              <>
                You are offline. Turn on offline access in{' '}
                <Link to="/account" className="underline underline-offset-2">
                  Account preferences
                </Link>{' '}
                to keep working without a connection.
              </>
            )}
          </span>
        </div>
      )}

      {isOnline && enabled && (pendingCount > 0 || syncState === 'syncing') && (
        <div role="status" className={noticeClasses}>
          <RefreshCw className={`mt-0.5 h-4 w-4 shrink-0 ${syncState === 'syncing' ? 'animate-spin' : ''}`} />
          <span>
            {syncState === 'syncing'
              ? `Syncing ${pendingLabel(pendingCount)} made offline...`
              : `${pendingLabel(pendingCount)} made offline are waiting to sync.`}
          </span>
        </div>
      )}

      {syncIssues.map((issue) => (
        <div key={issue.id} role="status" className={noticeClasses}>
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{issue.message}</span>
          <button
            type="button"
            aria-label="Dismiss sync message"
            onClick={() => dismissIssue(issue.id)}
            className="shrink-0 rounded p-0.5 hover:bg-[color-mix(in_srgb,var(--course-citrine)_50%,transparent)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </>
  );
}

export default OfflineStatusBanner;
