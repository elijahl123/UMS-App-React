'use client';

import '@/index.css';
import { useEffect, type ReactNode } from 'react';
import { HashRouter, Navigate, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import AppLayout from '@/app/components/AppLayout';
import NotificationService from '@/app/components/NotificationService';
import ProtectedRoute from '@/app/components/ProtectedRoute';
import SubscriptionRoute from '@/app/components/SubscriptionRoute';
import { AuthProvider, useAuth } from '@/app/lib/auth/AuthContext';
import LoginPage from '@/app/pages/LoginPage';
import SignupPage from '@/app/pages/SignupPage';
import ForgotPasswordPage from '@/app/pages/ForgotPasswordPage';
import ResetPasswordPage from '@/app/pages/ResetPasswordPage';
import VerifyEmailPage from '@/app/pages/VerifyEmailPage';
import BillingPage from '@/app/pages/BillingPage';
import PrivacyPolicyPage from '@/app/pages/PrivacyPolicyPage';
import DashboardPage from '@/app/pages/DashboardPage';
import CalendarPage from '@/app/pages/CalendarPage';
import HomeworkPage from '@/app/pages/HomeworkPage';
import ClassSchedulePage from '@/app/pages/ClassSchedulePage';
import CoursesPage from '@/app/pages/CoursesPage';
import CoursePage from '@/app/pages/CoursePage';
import NotesPage from '@/app/pages/NotesPage';
import NotesEditorPage from '@/app/pages/NotesEditorPage';
import AccountPage from '@/app/pages/AccountPage';
import StagingAccessPage from '@/app/pages/StagingAccessPage';

function FallbackRoute() {
  const location = useLocation();
  const { user, isLoading, isProcessingGoogleRedirect } = useAuth();
  const routeText = `${location.pathname}${location.search}${location.hash}`;

  if (routeText.includes('id_token=')) {
    if (user) {
      return <Navigate to="/" replace />;
    }

    if (!isLoading && !isProcessingGoogleRedirect) {
      return <Navigate to="/login" replace />;
    }

    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Completing sign-in...</div>;
  }

  return <Navigate to="/" replace />;
}

function AuthActionRedirect() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const browserParams = new URLSearchParams(window.location.search);
    const oobCode = browserParams.get('oobCode');
    const mode = browserParams.get('mode');

    if (!oobCode || location.pathname === '/verify-email' || location.pathname === '/reset-password') {
      return;
    }

    const targetPath = mode === 'resetPassword' ? '/reset-password' : '/verify-email';
    navigate(`${targetPath}${window.location.search}`, { replace: true });
  }, [location.pathname, navigate]);

  return null;
}

function TrialStartedRedirect() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isLoading, consumeTrialStartedRedirect } = useAuth();

  useEffect(() => {
    if (isLoading || !user || !consumeTrialStartedRedirect()) {
      return;
    }

    if (location.pathname !== '/billing' || !location.search.includes('trial=started')) {
      navigate('/billing?trial=started', { replace: true });
    }
  }, [consumeTrialStartedRedirect, isLoading, location.pathname, location.search, navigate, user]);

  return null;
}

function StagingAdminRoute({ children }: { children: ReactNode }) {
  const { stagingAccess, isStagingAccessControlEnabled } = useAuth();

  if (!isStagingAccessControlEnabled || stagingAccess?.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function App() {
  if (window.location.pathname.replace(/\/+$/, '') === '/privacy-policy') {
    return <PrivacyPolicyPage />;
  }

  return (
    <HashRouter>
      <AuthProvider>
        <AuthActionRedirect />
        <TrialStartedRedirect />
        <NotificationService />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/billing" element={<BillingPage />} />
            <Route element={<SubscriptionRoute />}>
              <Route element={<AppLayout />}>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/calendar" element={<CalendarPage />} />
                <Route path="/class-schedule" element={<ClassSchedulePage />} />
                <Route path="/homework" element={<HomeworkPage />} />
                <Route path="/notes" element={<NotesPage />} />
                <Route path="/notes/new" element={<NotesEditorPage />} />
                <Route path="/notes/:noteId" element={<NotesEditorPage />} />
                <Route path="/courses" element={<CoursesPage />} />
                <Route path="/courses/:courseId" element={<CoursePage />} />
                <Route path="/account" element={<AccountPage />} />
                <Route
                  path="/admin/staging-access"
                  element={
                    <StagingAdminRoute>
                      <StagingAccessPage />
                    </StagingAdminRoute>
                  }
                />
              </Route>
            </Route>
          </Route>
          <Route path="*" element={<FallbackRoute />} />
        </Routes>
      </AuthProvider>
    </HashRouter>
  );
}

export default App;
