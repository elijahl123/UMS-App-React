import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, CheckCheck, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/app/lib/auth/AuthContext';
import {
  listNotificationInstances,
  markAllNotificationsRead,
  markNotificationRead,
  unreadNotificationCount,
} from '@/app/lib/notifications/client';
import { showDueWebNotifications, syncAndScheduleNotifications } from '@/app/lib/notifications/scheduler';
import type { NotificationInstance } from '@/app/data/types';
import { cn } from '@/lib/utils';

function formatNotificationTime(value: string) {
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function useNotificationCenterState() {
  const { user } = useAuth();
  const userId = user?.id;
  const [instances, setInstances] = useState<NotificationInstance[]>([]);
  const [loading, setLoading] = useState(false);

  const unreadCount = useMemo(() => unreadNotificationCount(instances), [instances]);

  const reload = useCallback(async (sync = false) => {
    if (!userId) return;
    setLoading(true);
    try {
      const rows = sync ? await syncAndScheduleNotifications() : await listNotificationInstances();
      await showDueWebNotifications(rows);
      setInstances(rows);
    } catch {
      setInstances([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    void reload(true);
    const intervalId = window.setInterval(() => void reload(false), 60_000);
    const handleMutation = () => void reload(true);
    window.addEventListener('ums-notifications-changed', handleMutation);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('ums-notifications-changed', handleMutation);
    };
  }, [reload, userId]);

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead();
    await reload(false);
  };

  const handleItemClick = async (instance: NotificationInstance) => {
    if (!instance.readAt && new Date(instance.fireAt) <= new Date()) {
      await markNotificationRead(instance.id);
      await reload(false);
    }
  };

  return {
    instances,
    loading,
    unreadCount,
    reload,
    handleMarkAllRead,
    handleItemClick,
  };
}

type NotificationListProps = {
  instances: NotificationInstance[];
  loading: boolean;
  unreadCount: number;
  onMarkAllRead: () => void;
  onItemClick: (instance: NotificationInstance) => void;
  title?: string;
  maxHeightClassName?: string;
};

function NotificationList({
  instances,
  loading,
  unreadCount,
  onMarkAllRead,
  onItemClick,
  title = 'Notifications',
  maxHeightClassName = 'max-h-96',
}: NotificationListProps) {
  return (
    <>
      <div className="flex items-center justify-between gap-3 px-3 py-2">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 gap-1 px-2"
          disabled={unreadCount === 0}
          onClick={onMarkAllRead}
        >
          <CheckCheck className="h-4 w-4" />
          Read
        </Button>
      </div>
      <div className="border-t" />
      {loading && instances.length === 0 ? (
        <div className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading notifications...
        </div>
      ) : instances.length === 0 ? (
        <div className="px-3 py-4 text-sm text-muted-foreground">No scheduled reminders.</div>
      ) : (
        <div className={cn(maxHeightClassName, 'overflow-y-auto py-1')}>
          {instances.map((instance) => {
            const isDue = new Date(instance.fireAt) <= new Date();
            const unread = isDue && !instance.readAt;
            return (
              <button
                type="button"
                key={instance.id}
                className="flex w-full cursor-pointer flex-col items-start gap-1 px-3 py-2 text-left hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => onItemClick(instance)}
              >
                <div className="flex w-full min-w-0 items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{instance.title}</span>
                  {unread && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
                </div>
                <p className="line-clamp-2 text-xs text-muted-foreground">{instance.body}</p>
                <p className="text-xs text-muted-foreground">
                  {isDue ? 'Due' : 'Scheduled'} {formatNotificationTime(instance.fireAt)}
                </p>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

export function NotificationInbox({ className, title }: { className?: string; title?: string }) {
  const { instances, loading, unreadCount, handleMarkAllRead, handleItemClick } = useNotificationCenterState();

  return (
    <div className={cn('overflow-hidden rounded-md border bg-background', className)}>
      <NotificationList
        instances={instances}
        loading={loading}
        unreadCount={unreadCount}
        onMarkAllRead={handleMarkAllRead}
        onItemClick={handleItemClick}
        title={title}
        maxHeightClassName="max-h-80"
      />
    </div>
  );
}

function NotificationCenter() {
  const { instances, loading, unreadCount, reload, handleMarkAllRead, handleItemClick } = useNotificationCenterState();

  return (
    <DropdownMenu onOpenChange={(open) => open && reload(false)}>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="icon" className="relative" aria-label="Notifications">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <Badge className="absolute -right-2 -top-2 h-5 min-w-5 justify-center px-1 text-[10px]">
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(22rem,calc(100vw-1.5rem))] p-0">
        <NotificationList
          instances={instances}
          loading={loading}
          unreadCount={unreadCount}
          onMarkAllRead={handleMarkAllRead}
          onItemClick={handleItemClick}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default NotificationCenter;
