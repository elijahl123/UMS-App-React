import { Outlet, useOutletContext } from 'react-router-dom';
import { useEffect, useState } from 'react';
import Sidebar from '@/app/components/Sidebar';
import MobileBottomNavigation from '@/app/components/MobileBottomNavigation';
import MobileSwipeNavigation from '@/app/components/MobileSwipeNavigation';
import NotificationCenter from '@/app/components/NotificationCenter';
import type { SubscriptionOutletContext } from '@/app/components/SubscriptionRoute';
import { AlertTriangle, LockKeyhole } from 'lucide-react';
import { trackProductEvent } from '@/app/lib/launch/client';
import OnboardingExperience from '@/app/components/onboarding/OnboardingExperience';

function AppLayout() {
  const { accessStatus } = useOutletContext<SubscriptionOutletContext>();
  const [accessNotice, setAccessNotice] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(min-width: 768px) and (max-width: 1279px)').matches;
  });

  useEffect(() => {
    const compactDesktop = window.matchMedia('(min-width: 768px) and (max-width: 1279px)');
    const handleBreakpointChange = (event: MediaQueryListEvent) => {
      setSidebarCollapsed(event.matches);
    };

    setSidebarCollapsed(compactDesktop.matches);
    compactDesktop.addEventListener('change', handleBreakpointChange);
    return () => compactDesktop.removeEventListener('change', handleBreakpointChange);
  }, []);

  useEffect(() => {
    const handleInstalled = () => void trackProductEvent('pwa_installed');
    window.addEventListener('appinstalled', handleInstalled);
    return () => window.removeEventListener('appinstalled', handleInstalled);
  }, []);

  useEffect(() => {
    const handleDenied = (event: Event) => {
      const code = (event as CustomEvent<{ code?: string }>).detail?.code;
      setAccessNotice(code === 'READ_ONLY_GRACE'
        ? 'This action is unavailable during your read-only grace period. You can still view and export your work.'
        : 'A subscription is required to make changes. Your account and exports remain available.');
    };
    window.addEventListener('ums-access-denied', handleDenied);
    return () => window.removeEventListener('ums-access-denied', handleDenied);
  }, []);

  return (
    <div className="min-h-[100dvh] w-full overflow-x-clip bg-background md:h-[100dvh] md:overflow-hidden">
      {/* Sidebar remains persistent and collapsible on larger screens */}
      <div className="fixed inset-y-0 left-0 z-30 hidden h-[100dvh] md:block">
        <div className="h-full">
          <Sidebar
            collapsed={sidebarCollapsed}
            onCollapsedChange={setSidebarCollapsed}
          />
        </div>
      </div>

      {/* Main content */}
      <main
        className={`relative flex min-h-[100dvh] min-w-0 flex-col overflow-x-clip px-3 pb-[calc(6.25rem+env(safe-area-inset-bottom))] pt-[calc(0.75rem+env(safe-area-inset-top))] sm:px-4 sm:pb-[calc(6.25rem+env(safe-area-inset-bottom))] sm:pt-[calc(1rem+env(safe-area-inset-top))] md:h-[100dvh] md:overflow-hidden md:pb-4 md:pt-4 xl:p-6 ${
          sidebarCollapsed ? 'md:ml-20' : 'md:ml-72'
        }`}
      >
        {(accessStatus.accessMode === 'read_only' || accessStatus.billingWarning || accessNotice) && (
          <div role="status" className="mb-3 flex shrink-0 items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/55 dark:text-amber-100">
            {accessStatus.accessMode === 'read_only' ? <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
            <span>{accessNotice ?? accessStatus.billingWarning ?? `Your ${accessStatus.entitlement?.institutionName ?? 'student'} access is in its 14-day read-only grace period. Viewing and exports remain available until 1 February 2027.`}</span>
          </div>
        )}
        <div className="fixed right-8 top-[calc(2.25rem+env(safe-area-inset-top))] z-50 hidden md:bottom-4 md:right-4 md:top-auto md:block xl:bottom-6 xl:right-6">
          <NotificationCenter />
        </div>
        <MobileSwipeNavigation>
          <Outlet context={{ accessStatus }} />
        </MobileSwipeNavigation>
      </main>
      <MobileBottomNavigation />
      <OnboardingExperience />
    </div>
  );
}

export default AppLayout;
