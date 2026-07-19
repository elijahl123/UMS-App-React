import { useEffect, useMemo, useState } from 'react';
import { Bell, CheckCheck, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/app/lib/auth/AuthContext';
import {
  listNotificationInstances,
  markAllNotificationsRead,
  markNotificationRead,
  unreadNotificationCount,
} from '@/app/lib/notifications/client';
import { syncAndScheduleNotifications } from '@/app/lib/notifications/scheduler';
import type { NotificationInstance } from '@/app/data/types';

function formatNotificationTime(value: string) {
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function NotificationCenter() {
  const { user } = useAuth();
  const [instances, setInstances] = useState<NotificationInstance[]>([]);
  const [loading, setLoading] = useState(false);

  const unreadCount = useMemo(() => unreadNotificationCount(instances), [instances]);

  const reload = async (sync = false) => {
    if (!user) return;
    setLoading(true);
    try {
      const rows = sync ? await syncAndScheduleNotifications() : await listNotificationInstances();
      setInstances(rows);
    } catch {
      setInstances([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    void reload(true);
    const intervalId = window.setInterval(() => void reload(false), 60_000);
    const handleMutation = () => void reload(true);
    window.addEventListener('ums-notifications-changed', handleMutation);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('ums-notifications-changed', handleMutation);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

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
        <div className="flex items-center justify-between gap-3 px-3 py-2">
          <DropdownMenuLabel className="p-0">Notifications</DropdownMenuLabel>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1 px-2"
            disabled={unreadCount === 0}
            onClick={handleMarkAllRead}
          >
            <CheckCheck className="h-4 w-4" />
            Read
          </Button>
        </div>
        <DropdownMenuSeparator />
        {loading && instances.length === 0 ? (
          <div className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading notifications...
          </div>
        ) : instances.length === 0 ? (
          <div className="px-3 py-4 text-sm text-muted-foreground">No scheduled reminders.</div>
        ) : (
          <div className="max-h-96 overflow-y-auto py-1">
            {instances.map((instance) => {
              const isDue = new Date(instance.fireAt) <= new Date();
              const unread = isDue && !instance.readAt;
              return (
                <DropdownMenuItem
                  key={instance.id}
                  className="flex cursor-pointer flex-col items-start gap-1 px-3 py-2"
                  onClick={() => handleItemClick(instance)}
                >
                  <div className="flex w-full min-w-0 items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{instance.title}</span>
                    {unread && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
                  </div>
                  <p className="line-clamp-2 text-xs text-muted-foreground">{instance.body}</p>
                  <p className="text-xs text-muted-foreground">
                    {isDue ? 'Due' : 'Scheduled'} {formatNotificationTime(instance.fireAt)}
                  </p>
                </DropdownMenuItem>
              );
            })}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default NotificationCenter;
