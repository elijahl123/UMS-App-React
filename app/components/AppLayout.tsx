import { Outlet } from 'react-router-dom';
import { useState } from 'react';
import Sidebar from '@/app/components/Sidebar';
import { Button } from '@/components/ui/button';
import { Menu, X } from 'lucide-react';

function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-full min-h-screen w-full bg-background">
      {/* Mobile hamburger button */}
      <div className="fixed bottom-5 right-5 z-40 md:hidden">
        <Button
          size="icon"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="h-14 w-14 rounded-full shadow-lg"
          aria-label="Toggle menu"
        >
          {sidebarOpen ? <X className="h-7 w-7" /> : <Menu className="h-7 w-7" />}
        </Button>
      </div>

      {/* Sidebar - hidden on mobile, visible on desktop */}
      <div
        className={`fixed inset-0 z-30 bg-black/50 md:static md:bg-transparent md:inset-auto ${
          sidebarOpen ? 'block' : 'hidden md:block'
        }`}
        onClick={() => setSidebarOpen(false)}
      >
        <div onClick={(e) => e.stopPropagation()}>
          <Sidebar onClose={() => setSidebarOpen(false)} />
        </div>
      </div>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-y-auto p-3 sm:p-4 md:overflow-hidden md:p-6">
        <Outlet />
      </main>
    </div>
  );
}

export default AppLayout;
