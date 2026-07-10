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
      <div className="fixed bottom-6 right-6 z-40 md:hidden">
        <Button
          size="icon"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="rounded-full"
          aria-label="Toggle menu"
        >
          {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
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
      <main className="flex-1 flex flex-col overflow-hidden p-3 sm:p-4 md:p-6">
        <Outlet />
      </main>
    </div>
  );
}

export default AppLayout;
