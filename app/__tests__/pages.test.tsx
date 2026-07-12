import { Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AccountPage from '@/app/pages/AccountPage';
import BillingPage from '@/app/pages/BillingPage';
import CalendarPage from '@/app/pages/CalendarPage';
import ClassSchedulePage from '@/app/pages/ClassSchedulePage';
import CoursePage from '@/app/pages/CoursePage';
import CoursesPage from '@/app/pages/CoursesPage';
import DashboardPage from '@/app/pages/DashboardPage';
import ForgotPasswordPage from '@/app/pages/ForgotPasswordPage';
import HomeworkPage from '@/app/pages/HomeworkPage';
import LoginPage from '@/app/pages/LoginPage';
import NotesEditorPage from '@/app/pages/NotesEditorPage';
import NotesPage from '@/app/pages/NotesPage';
import ResetPasswordPage from '@/app/pages/ResetPasswordPage';
import SignupPage from '@/app/pages/SignupPage';
import VerifyEmailPage from '@/app/pages/VerifyEmailPage';
import { authActions, authState } from '@/app/test/mocks';
import { renderWithRouter } from '@/app/test/render';

function renderRoute(path: string, element: React.ReactElement, route = path) {
  return renderWithRouter(
    <Routes>
      <Route path={path} element={element} />
    </Routes>,
    { route }
  );
}

describe('page rendering', () => {
  it('renders dashboard widgets with loaded school data', () => {
    renderWithRouter(<DashboardPage />);

    expect(screen.getByText(/upcoming assignments/i)).toBeInTheDocument();
    expect(screen.getByText(/late assignments/i)).toBeInTheDocument();
    expect(screen.getByText(/study group/i)).toBeInTheDocument();
  });

  it('renders the homework board with grouped assignments', () => {
    renderWithRouter(<HomeworkPage />);

    expect(screen.getByRole('heading', { name: /homework/i })).toBeInTheDocument();
    expect(screen.getByText(/derivative quiz/i)).toBeInTheDocument();
    expect(screen.getByText(/limits worksheet/i)).toBeInTheDocument();
  });

  it('collapses completed assignments by default', async () => {
    const user = userEvent.setup();
    renderWithRouter(<HomeworkPage />);

    expect(screen.queryByText(/reading response/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /completed/i }));
    expect(screen.getByText(/reading response/i)).toBeInTheDocument();
  });

  it('renders the class schedule grid and legend', () => {
    renderWithRouter(<ClassSchedulePage />);

    expect(screen.getByRole('heading', { name: /class schedule/i })).toBeInTheDocument();
    expect(screen.getAllByText(/math 101/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/9:00 a\.m\. - 10:15 a\.m\./i)).toBeInTheDocument();
  });

  it('renders the calendar and opens day details', async () => {
    const user = userEvent.setup();
    renderWithRouter(<CalendarPage />);

    expect(screen.getByRole('heading', { name: /july 2026/i })).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: /10/i })[0]);
    expect(await screen.findByText(/study group/i)).toBeInTheDocument();
  });

  it('renders courses and course details', () => {
    renderWithRouter(<CoursesPage />);

    expect(screen.getByRole('heading', { name: /courses/i })).toBeInTheDocument();
    expect(screen.getByText(/calculus i/i)).toBeInTheDocument();

    renderRoute('/courses/:courseId', <CoursePage />, '/courses/1');

    expect(screen.getByRole('heading', { name: /calculus i/i })).toBeInTheDocument();
    expect(screen.getByText(/open assignments/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /syllabus/i })).toBeInTheDocument();
  });

  it('renders notes list and editor states', () => {
    renderWithRouter(<NotesPage />);

    expect(screen.getByRole('heading', { name: /notes/i })).toBeInTheDocument();
    expect(screen.getByText(/chain rule notes/i)).toBeInTheDocument();

    renderRoute('/notes/:noteId', <NotesEditorPage />, '/notes/1');

    expect(screen.getByDisplayValue(/chain rule notes/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/rich text editor/i)).toBeInTheDocument();
  });

  it('warns before leaving a note with unsaved changes', async () => {
    const user = userEvent.setup();
    vi.mocked(window.confirm).mockReturnValueOnce(false).mockReturnValueOnce(true);

    renderWithRouter(
      <Routes>
        <Route path="/notes/:noteId" element={<NotesEditorPage />} />
        <Route path="/notes" element={<div>Notes list destination</div>} />
      </Routes>,
      { route: '/notes/1' }
    );

    const titleInput = screen.getByDisplayValue(/chain rule notes/i);
    await user.clear(titleInput);
    await user.type(titleInput, 'Edited Chain Rule Notes');

    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(window.confirm).toHaveBeenCalledWith('You have unsaved changes. Leave without saving?');
    expect(screen.getByDisplayValue(/edited chain rule notes/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(await screen.findByText(/notes list destination/i)).toBeInTheDocument();
  });

  it('renders the account page', () => {
    renderWithRouter(<AccountPage />);

    expect(screen.getByRole('heading', { name: /^account$/i })).toBeInTheDocument();
    expect(screen.getByText(/your email address is not verified/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^connected accounts$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /connect google/i })).toBeInTheDocument();
  });

  it('connects Google from the account page', async () => {
    const user = userEvent.setup();
    renderWithRouter(<AccountPage />);

    await user.click(screen.getByRole('button', { name: /connect google/i }));

    expect(authActions.signInWithGoogle).toHaveBeenCalled();
  });

  it('shows Google as connected on the account page', () => {
    authState.user = {
      ...authState.user!,
      connectedProviders: ['password', 'google.com'],
    };

    renderWithRouter(<AccountPage />);

    expect(screen.getByText(/^connected$/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /connect google/i })).not.toBeInTheDocument();
  });

  it('renders the billing page', async () => {
    cleanup();

    renderWithRouter(<BillingPage />);

    expect(await screen.findByText(/^your subscription is active\.$/i)).toBeInTheDocument();
    expect(screen.getByText(/visa ending in 4242/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel at period end/i })).toBeInTheDocument();
  });

  it('changes the payment method from the billing page', async () => {
    cleanup();
    const user = userEvent.setup();

    renderWithRouter(<BillingPage />);

    await user.click(await screen.findByRole('button', { name: /change payment method/i }));
    expect(await screen.findByTestId('payment-element')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /save payment method/i }));

    expect(await screen.findByText(/payment method updated/i)).toBeInTheDocument();
    expect(screen.getByText(/mastercard ending in 5555/i)).toBeInTheDocument();
  });
});

describe('auth and recovery pages', () => {
  it('submits login credentials through auth context', async () => {
    const user = userEvent.setup();
    renderWithRouter(<LoginPage />, { route: '/login' });

    await user.type(screen.getByLabelText(/email/i), 'jane@example.com');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /^log in$/i }));

    await waitFor(() => expect(authActions.login).toHaveBeenCalledWith('jane@example.com', 'password123'));
  });

  it('submits signup details through auth context', async () => {
    const user = userEvent.setup();
    renderWithRouter(<SignupPage />, { route: '/signup' });

    await user.type(screen.getByLabelText(/first name/i), 'Jane');
    await user.type(screen.getByLabelText(/last name/i), 'Doe');
    await user.type(screen.getByLabelText(/email/i), 'jane@example.com');
    await user.type(screen.getByLabelText(/^password$/i), 'password123');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() =>
      expect(authActions.signup).toHaveBeenCalledWith({
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@example.com',
        password: 'password123',
      })
    );
  });

  it('requests a password reset and shows the submitted state', async () => {
    const user = userEvent.setup();
    renderWithRouter(<ForgotPasswordPage />, { route: '/forgot-password' });

    await user.type(screen.getByLabelText(/email/i), 'jane@example.com');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    expect(await screen.findByText(/check your inbox/i)).toBeInTheDocument();
    expect(authActions.requestPasswordReset).toHaveBeenCalledWith('jane@example.com');
  });

  it('handles reset and verification token pages', async () => {
    const user = userEvent.setup();
    renderWithRouter(<ResetPasswordPage />, { route: '/reset-password?oobCode=abc123' });

    await user.type(screen.getByLabelText(/^new password$/i), 'password123');
    await user.type(screen.getByLabelText(/confirm new password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /reset password/i }));

    expect(await screen.findByText(/your password has been reset/i)).toBeInTheDocument();

    renderWithRouter(<VerifyEmailPage />, { route: '/verify-email?oobCode=abc123' });

    expect(await screen.findByText(/your email address has been verified/i)).toBeInTheDocument();
    expect(authActions.verifyEmailWithToken).toHaveBeenCalledWith('abc123');
  });

  it('shows validation errors on invalid login input', async () => {
    renderWithRouter(<LoginPage />, { route: '/login' });

    fireEvent.click(screen.getByRole('button', { name: /^log in$/i }));

    expect(await screen.findByText(/email is required/i)).toBeInTheDocument();
    expect(screen.getByText(/password is required/i)).toBeInTheDocument();
  });
});
