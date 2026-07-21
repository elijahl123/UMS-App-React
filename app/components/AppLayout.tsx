import { Outlet } from 'react-router-dom';
import { useState } from 'react';
import Sidebar from '@/app/components/Sidebar';
import MobileBottomNavigation from '@/app/components/MobileBottomNavigation';
import MobileSwipeNavigation from '@/app/components/MobileSwipeNavigation';
import NotificationCenter from '@/app/components/NotificationCenter';

function AppLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(min-width: 768px) and (max-width: 1279px)').matches;
  });

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
        <div className="fixed right-8 top-[calc(2.25rem+env(safe-area-inset-top))] z-50 hidden md:bottom-4 md:right-4 md:top-auto md:block xl:bottom-6 xl:right-6">
          <NotificationCenter />
        </div>
        <MobileSwipeNavigation>
          <Outlet />
        </MobileSwipeNavigation>
      </main>
      <MobileBottomNavigation />
    </div>
  );
}

export default AppLayout;
