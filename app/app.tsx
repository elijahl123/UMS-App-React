'use client';

import '@/index.css';
import { HashRouter, Navigate, Routes, Route, useLocation } from 'react-router-dom';
import AppLayout from '@/app/components/AppLayout';
import ProtectedRoute from '@/app/components/ProtectedRoute';
import SubscriptionRoute from '@/app/components/SubscriptionRoute';
import { AuthProvider, useAuth } from '@/app/lib/auth/AuthContext';
import LoginPage from '@/app/pages/LoginPage';
import SignupPage from '@/app/pages/SignupPage';
import ForgotPasswordPage from '@/app/pages/ForgotPasswordPage';
import ResetPasswordPage from '@/app/pages/ResetPasswordPage';
import VerifyEmailPage from '@/app/pages/VerifyEmailPage';
import BillingPage from '@/app/pages/BillingPage';
import DashboardPage from '@/app/pages/DashboardPage';
import CalendarPage from '@/app/pages/CalendarPage';
import HomeworkPage from '@/app/pages/HomeworkPage';
import ClassSchedulePage from '@/app/pages/ClassSchedulePage';
import CoursesPage from '@/app/pages/CoursesPage';
import CoursePage from '@/app/pages/CoursePage';
import NotesPage from '@/app/pages/NotesPage';
import NotesEditorPage from '@/app/pages/NotesEditorPage';
import AccountPage from '@/app/pages/AccountPage';

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

function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
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
