import { Outlet } from 'react-router-dom';
import { useState } from 'react';
import Sidebar from '@/app/components/Sidebar';
import MobileBottomNavigation from '@/app/components/MobileBottomNavigation';

function AppLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(min-width: 768px) and (max-width: 1279px)').matches;
  });

  return (
    <div className="min-h-[100dvh] w-full overflow-x-hidden bg-background md:h-[100dvh] md:overflow-hidden">
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
        className={`flex min-h-[100dvh] min-w-0 flex-col overflow-visible p-3 pb-[calc(5.75rem+env(safe-area-inset-bottom))] sm:p-4 sm:pb-[calc(5.75rem+env(safe-area-inset-bottom))] md:h-[100dvh] md:overflow-hidden md:pb-4 xl:p-6 ${
          sidebarCollapsed ? 'md:ml-20' : 'md:ml-72'
        }`}
      >
        <Outlet />
      </main>
      <MobileBottomNavigation />
    </div>
  );
}

export default AppLayout;
