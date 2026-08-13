import { describe, expect, it } from 'vitest';

process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://user:pass@localhost:5432/test';

describe('onboarding state transitions', () => {
  it('advances only through the canonical step order', async () => {
    const { resolveOnboardingUpdate } = await import('../routes/onboarding');
    const current = { status: 'active' as const, currentStep: 'course' as const, completedSteps: [], deferredSteps: [] };
    expect(resolveOnboardingUpdate(current, { action: 'complete_step', step: 'course', nextStep: 'coursework' })).toMatchObject({
      value: { status: 'active', currentStep: 'coursework', completedSteps: ['course'] },
    });
    expect(resolveOnboardingUpdate(current, { action: 'complete_step', step: 'course', nextStep: 'account' })).toEqual({
      error: 'INVALID_ONBOARDING_STEP',
    });
  });

  it('records deferral, skip, resume, and completion without losing progress', async () => {
    const { resolveOnboardingUpdate } = await import('../routes/onboarding');
    const current = { status: 'active' as const, currentStep: 'schedule' as const, completedSteps: ['course'] as const, deferredSteps: [] };
    expect(resolveOnboardingUpdate({ ...current, completedSteps: [...current.completedSteps] }, { action: 'defer_step', step: 'schedule', nextStep: 'services' })).toMatchObject({
      value: { currentStep: 'services', deferredSteps: ['schedule'] },
    });
    expect(resolveOnboardingUpdate({ ...current, completedSteps: [...current.completedSteps] }, { action: 'skip' })).toMatchObject({ value: { status: 'skipped', skipped: true } });
    expect(resolveOnboardingUpdate({ ...current, status: 'skipped', completedSteps: [...current.completedSteps] }, { action: 'resume' })).toMatchObject({ value: { status: 'active' } });
    expect(resolveOnboardingUpdate({ status: 'active', currentStep: 'complete', completedSteps: [], deferredSteps: [] }, { action: 'complete' })).toMatchObject({ value: { status: 'completed', finished: true } });
  });

  it('rejects unknown actions and premature completion', async () => {
    const { resolveOnboardingUpdate } = await import('../routes/onboarding');
    const current = { status: 'active' as const, currentStep: 'welcome' as const, completedSteps: [], deferredSteps: [] };
    expect(resolveOnboardingUpdate(current, { action: 'explode' })).toEqual({ error: 'INVALID_ONBOARDING_ACTION' });
    expect(resolveOnboardingUpdate(current, { action: 'complete' })).toEqual({ error: 'INVALID_ONBOARDING_STEP' });
  });
});
