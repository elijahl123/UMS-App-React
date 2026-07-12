import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/app/lib/auth/AuthContext';
import { Button } from '@/components/ui/button';

function ProtectedRoute() {
  const { user, isLoading, isStagingAccessLoading, stagingAccess, isStagingAccessControlEnabled, logout } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading...</div>;
  }

  if (!user) {
    const from = location.pathname === '/login' ? '/' : `${location.pathname}${location.search}`;
    return <Navigate to="/login" state={{ from }} replace />;
  }

  if (isStagingAccessControlEnabled && isStagingAccessLoading) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Checking access...</div>;
  }

  if (isStagingAccessControlEnabled && !stagingAccess) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-md rounded-lg border bg-card p-6 text-center shadow-sm">
          <h1 className="text-2xl font-bold text-foreground">Access pending</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Your account is signed in, but it has not been approved for this staging site.
          </p>
          <Button className="mt-6" variant="outline" onClick={logout}>
            Log out
          </Button>
        </div>
      </div>
    );
  }

  return <Outlet />;
}

export default ProtectedRoute;
