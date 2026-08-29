import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor } from '@testing-library/react';
import OnboardingExperience from '@/app/components/onboarding/OnboardingExperience';
import { renderWithRouter } from '@/app/test/render';
import { apiState, googleCalendarState, offlineActions, offlineState, onboardingActions, onboardingState } from '@/app/test/mocks';
import type { OnboardingState } from '@/app/lib/onboarding/client';
import { getNotificationPreferences } from '@/app/lib/notifications/client';

function onboarding(overrides: Partial<OnboardingState> = {}): OnboardingState {
  return {
    version: 1,
    status: 'active',
    currentStep: 'welcome',
    completedSteps: [],
    deferredSteps: [],
    inferredCompletedSteps: [],
    checklistDismissedAt: null,
    startedAt: '2026-08-13T12:00:00.000Z',
    skippedAt: null,
    completedAt: null,
    updatedAt: '2026-08-13T12:00:00.000Z',
    ...overrides,
  };
}

describe('guided onboarding', () => {
  it('starts at welcome and can be skipped without blocking the app', async () => {
    onboardingState.value = onboarding();
    const user = userEvent.setup();
    renderWithRouter(<OnboardingExperience />);

    expect(await screen.findByRole('heading', { name: /welcome/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /skip walkthrough/i }));

    await waitFor(() => expect(onboardingActions.updateOnboarding).toHaveBeenCalledWith({ action: 'skip' }));
    expect(screen.queryByRole('heading', { name: /welcome/i })).not.toBeInTheDocument();
  });

  it('creates a real first course and advances the persisted step', async () => {
    onboardingState.value = onboarding({ currentStep: 'course' });
    apiState.loads.loadCourses = [];
    const user = userEvent.setup();
    renderWithRouter(<OnboardingExperience />);

    await user.type(await screen.findByLabelText(/course code/i), 'BIO 101');
    await user.type(screen.getByLabelText(/course name/i), 'Introduction to Biology');
    await user.click(screen.getByRole('button', { name: /add course/i }));

    await waitFor(() => expect(apiState.mutations).toContainEqual({
      name: 'createCourse',
      params: expect.objectContaining({ code: 'BIO 101', name: 'Introduction to Biology' }),
    }));
    expect(onboardingActions.updateOnboarding).toHaveBeenCalledWith({
      action: 'complete_step',
      step: 'course',
      nextStep: 'coursework',
    });
  });

  it('shows resumable setup work after a skip', async () => {
    onboardingState.value = onboarding({
      status: 'skipped',
      currentStep: 'coursework',
      inferredCompletedSteps: ['course'],
    });
    const user = userEvent.setup();
    renderWithRouter(<OnboardingExperience />, { route: '/' });

    expect(await screen.findByRole('heading', { name: /getting started/i })).toBeInTheDocument();
    expect(screen.getByText(/1 of 4 essentials ready/i)).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: /resume walkthrough/i })[0]);
    await waitFor(() => expect(onboardingActions.updateOnboarding).toHaveBeenCalledWith({ action: 'resume' }));
  });

  it('confirms connected reminders and Google Calendar in the services step', async () => {
    onboardingState.value = onboarding({ currentStep: 'services' });
    googleCalendarState.status = {
      ...googleCalendarState.status,
      connected: true,
      googleEmail: 'jane@gmail.com',
    };
    vi.mocked(getNotificationPreferences).mockResolvedValueOnce({
      userId: 'mock-user-id',
      enabled: true,
      assignment24hEnabled: true,
      assignment1hEnabled: true,
      event10mEnabled: true,
      class10mEnabled: true,
      quietHoursEnabled: false,
      quietHoursStart: null,
      quietHoursEnd: null,
      timeZone: 'America/Los_Angeles',
    });

    renderWithRouter(<OnboardingExperience />);

    expect(await screen.findByText('2 of 2 connected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reminders connected/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /google calendar connected/i })).toBeDisabled();
    expect(screen.getByText('jane@gmail.com')).toBeInTheDocument();
  });

  it('offers offline access in the services step, off until it is switched on', async () => {
    onboardingState.value = onboarding({ currentStep: 'services' });
    const user = userEvent.setup();
    renderWithRouter(<OnboardingExperience />);

    const toggle = await screen.findByRole('switch', { name: 'Work offline' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText(/Keep your work available with no connection/i)).toBeInTheDocument();

    await user.click(toggle);

    expect(offlineActions.setEnabled).toHaveBeenCalledWith(true);
  });

  it('reports offline access as already on without asking again', async () => {
    onboardingState.value = onboarding({ currentStep: 'services' });
    offlineState.enabled = true;
    renderWithRouter(<OnboardingExperience />);

    expect(await screen.findByRole('switch', { name: 'Work offline' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText(/saved on this device/i)).toBeInTheDocument();
  });
});
