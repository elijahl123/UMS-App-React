import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '@/app/lib/auth/AuthContext';
import { getBillingStatus, type BillingStatus } from '@/app/lib/billing/client';
import { cacheBillingStatus, readCachedBillingStatus } from '@/app/lib/offline/billingCache';
import { useOffline } from '@/app/lib/offline/OfflineContext';

export type SubscriptionOutletContext = { accessStatus: BillingStatus };

function SubscriptionRoute() {
  const { user } = useAuth();
  const { enabled: offlineEnabled, isOnline } = useOffline();
  const location = useLocation();
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function loadStatus() {
      if (!user) {
        setLoading(false);
        return;
      }

      setLoading(true);

      // Show the app from the last known answer straight away. This check gates
      // every authenticated screen, so waiting for it on an unresponsive
      // connection means a blank app for the length of the request timeout.
      const known = await readCachedBillingStatus(user.id);
      if (known && !cancelled) {
        setStatus(known);
        setLoading(false);
      }

      try {
        const startedAt = performance.now();
        const nextStatus = await getBillingStatus(user.id);
        console.log(`[Billing] Local subscription check took ${Math.round(performance.now() - startedAt)}ms`);
        if (!cancelled) {
          setStatus(nextStatus);
        }
      } catch (err) {
        // With offline access on, fall back to the last known answer rather than
        // stranding the user on the "unable to check access" screen.
        const cached = await readCachedBillingStatus(user.id);
        if (!cached) console.warn('[Billing] Subscription check failed:', err);
        if (!cancelled && cached) {
          setStatus(cached);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadStatus();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Snapshot the access decision whenever offline mode is on, including the moment
  // it is switched on, so a later offline start is not locked out by the guard.
  useEffect(() => {
    if (!user || !status || !offlineEnabled) return;
    void cacheBillingStatus(user.id, status);
  }, [offlineEnabled, status, user]);

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Checking subscription...</div>;
  }

  if (!status) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-center text-muted-foreground">
        {isOnline || offlineEnabled ? (
          <span>Unable to check access. Refresh to try again.</span>
        ) : (
          <span>
            You are offline and your access has not been saved on this device. Turn on offline access in your account
            preferences while connected to keep using UMS without a connection.
          </span>
        )}
      </div>
    );
  }

  if (!status.hasAccess && location.pathname !== '/account') {
    return <Navigate to="/billing" state={{ from: location.pathname }} replace />;
  }

  return <Outlet context={{ accessStatus: status } satisfies SubscriptionOutletContext} />;
}

export default SubscriptionRoute;
