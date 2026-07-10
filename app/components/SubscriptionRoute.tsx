import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '@/app/lib/auth/AuthContext';
import { getBillingStatus, type BillingStatus } from '@/app/lib/billing/client';

function SubscriptionRoute() {
  const { user } = useAuth();
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
      try {
        const startedAt = performance.now();
        const nextStatus = await getBillingStatus(user.id);
        console.log(`[Billing] Local subscription check took ${Math.round(performance.now() - startedAt)}ms`);
        if (!cancelled) {
          setStatus(nextStatus);
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

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Checking subscription...</div>;
  }

  if (!status?.subscribed) {
    return <Navigate to="/billing" state={{ from: location.pathname }} replace />;
  }

  return <Outlet />;
}

export default SubscriptionRoute;
