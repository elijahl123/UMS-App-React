import { describe, expect, it } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor } from '@testing-library/react';
import OnboardingExperience from '@/app/components/onboarding/OnboardingExperience';
import { renderWithRouter } from '@/app/test/render';
import { apiState, onboardingActions, onboardingState } from '@/app/test/mocks';
import type { OnboardingState } from '@/app/lib/onboarding/client';

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
});
