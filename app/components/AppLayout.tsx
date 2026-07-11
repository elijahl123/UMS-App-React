import { Outlet } from 'react-router-dom';
import { useState } from 'react';
import Sidebar from '@/app/components/Sidebar';
import { Button } from '@/components/ui/button';
import { Menu, X } from 'lucide-react';

function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(min-width: 768px) and (max-width: 1279px)').matches;
  });

  return (
    <div className="h-[100dvh] w-full overflow-hidden bg-background">
      {/* Mobile hamburger button */}
      <div className="fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] right-5 z-40 md:hidden">
        <Button
          size="icon"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="h-14 w-14 rounded-full shadow-lg"
          aria-label="Toggle menu"
        >
          {sidebarOpen ? <X className="h-7 w-7" /> : <Menu className="h-7 w-7" />}
        </Button>
      </div>

      {/* Sidebar drawer on mobile, persistent and collapsible on larger screens */}
      <div
        className={`fixed inset-0 z-30 h-[100dvh] bg-black/50 md:inset-y-0 md:left-0 md:right-auto md:block md:bg-transparent ${
          sidebarOpen ? 'block' : 'hidden md:block'
        }`}
        onClick={() => setSidebarOpen(false)}
      >
        <div className="h-full" onClick={(e) => e.stopPropagation()}>
          <Sidebar
            collapsed={sidebarCollapsed}
            onCollapsedChange={setSidebarCollapsed}
            onClose={() => setSidebarOpen(false)}
          />
        </div>
      </div>

      {/* Main content */}
      <main
        className={`flex h-[100dvh] min-w-0 flex-col overflow-hidden p-3 pb-20 sm:p-4 sm:pb-20 md:pb-4 xl:p-6 ${
          sidebarCollapsed ? 'md:ml-20' : 'md:ml-72'
        }`}
      >
        <Outlet />
      </main>
    </div>
  );
}

export default AppLayout;
