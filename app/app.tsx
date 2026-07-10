'use client';

import '@/index.css';
import { HashRouter, Routes, Route } from 'react-router-dom';
import AppLayout from '@/app/components/AppLayout';
import ProtectedRoute from '@/app/components/ProtectedRoute';
import { AuthProvider } from '@/app/lib/auth/AuthContext';
import LoginPage from '@/app/pages/LoginPage';
import SignupPage from '@/app/pages/SignupPage';
import ForgotPasswordPage from '@/app/pages/ForgotPasswordPage';
import ResetPasswordPage from '@/app/pages/ResetPasswordPage';
import VerifyEmailPage from '@/app/pages/VerifyEmailPage';
import DashboardPage from '@/app/pages/DashboardPage';
import CalendarPage from '@/app/pages/CalendarPage';
import HomeworkPage from '@/app/pages/HomeworkPage';
import ClassSchedulePage from '@/app/pages/ClassSchedulePage';
import CoursesPage from '@/app/pages/CoursesPage';
import CoursePage from '@/app/pages/CoursePage';
import NotesPage from '@/app/pages/NotesPage';
import NotesEditorPage from '@/app/pages/NotesEditorPage';
import AccountPage from '@/app/pages/AccountPage';

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
        </Routes>
      </AuthProvider>
    </HashRouter>
  );
}

export default App;
